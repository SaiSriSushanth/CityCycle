from __future__ import annotations

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "hour.csv"
OUT = ROOT / "web" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

SEED = 42
SPLIT_DATE = pd.Timestamp("2012-07-01")  # train: before, test: from this date on

# Trap 1: casual + registered == cnt. instant is a row index, dteday is replaced by calendar features.
LEAKY = ["casual", "registered"]
DROP = ["instant", "dteday", "atemp"]  # atemp is ~collinear with temp
FEATURES = ["yr", "mnth", "hr", "weekday", "workingday", "holiday", "season",
            "weathersit", "temp", "hum", "windspeed"]
CATEGORICAL = ["hr", "weekday", "season", "weathersit", "mnth"]

FEATURE_LABELS = {
    "hr": "Hour of day", "workingday": "Working day", "temp": "Temperature",
    "yr": "Year (growth trend)", "hum": "Humidity", "weathersit": "Weather",
    "season": "Season", "mnth": "Month", "weekday": "Day of week",
    "windspeed": "Wind speed", "holiday": "Holiday",
}


def metrics(y, p) -> dict:
    return {
        "mae": float(mean_absolute_error(y, p)),
        "rmse": float(np.sqrt(mean_squared_error(y, p))),
        "r2": float(r2_score(y, p)),
    }


def load() -> pd.DataFrame:
    df = pd.read_csv(RAW, parse_dates=["dteday"])
    df["ts"] = df["dteday"] + pd.to_timedelta(df["hr"], unit="h")
    return df.sort_values("ts").reset_index(drop=True)


def same_hour_last_week(df: pd.DataFrame, fallback: float) -> np.ndarray:
    """Naive seasonal baseline: demand exactly 168h earlier (the dataset has gaps)."""
    s = df.set_index("ts")["cnt"]
    full = s.reindex(pd.date_range(s.index.min(), s.index.max(), freq="h"))
    lag = full.shift(168).reindex(df["ts"])
    return lag.fillna(fallback).to_numpy()


def make_onehot_ridge() -> Pipeline:
    pre = ColumnTransformer(
        [("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL)],
        remainder="passthrough",
    )
    return Pipeline([("pre", pre), ("model", Ridge(alpha=1.0))])


def main(no_export: bool = False) -> None:
    df = load()
    train = df[df["ts"] < SPLIT_DATE].copy()
    test = df[df["ts"] >= SPLIT_DATE].copy()
    X_tr, y_tr = train[FEATURES], train["cnt"]
    X_te, y_te = test[FEATURES], test["cnt"]
    print(f"rows={len(df)} train={len(train)} test={len(test)} "
          f"test window {test['ts'].min():%Y-%m-%d} -> {test['ts'].max():%Y-%m-%d}")

    results: dict[str, dict] = {}
    preds: dict[str, np.ndarray] = {}

    # --- baselines -----------------------------------------------------------------
    preds["mean"] = np.full(len(test), y_tr.mean())
    results["mean"] = metrics(y_te, preds["mean"])
    preds["last_week"] = same_hour_last_week(df, y_tr.mean())[df["ts"] >= SPLIT_DATE]
    results["last_week"] = metrics(y_te, preds["last_week"])

    # --- models --------------------------------------------------------------------
    ridge = make_onehot_ridge().fit(X_tr, y_tr)
    preds["ridge"] = ridge.predict(X_te)
    results["ridge"] = metrics(y_te, preds["ridge"])

    rf = RandomForestRegressor(n_estimators=300, min_samples_leaf=2, n_jobs=-1,
                               random_state=SEED).fit(X_tr, y_tr)
    preds["rf"] = rf.predict(X_te)
    results["rf"] = metrics(y_te, preds["rf"])

    params = dict(objective="regression", learning_rate=0.05, num_leaves=63,
                  min_data_in_leaf=20, feature_fraction=0.9, bagging_fraction=0.9,
                  bagging_freq=1, verbose=-1, seed=SEED)
    gbm = lgb.train(params, lgb.Dataset(X_tr, y_tr), num_boost_round=600)
    preds["gbm"] = np.clip(gbm.predict(X_te), 0, None)
    results["gbm"] = metrics(y_te, preds["gbm"])

    for k, v in results.items():
        print(f"{k:10s} MAE={v['mae']:.1f} RMSE={v['rmse']:.1f} R2={v['r2']:.3f}")

    # --- the traps, quantified (for the "what we caught" page) ---------------------
    leak = lgb.train(params, lgb.Dataset(train[FEATURES + LEAKY], y_tr), num_boost_round=200)
    leak_r2 = r2_score(y_te, leak.predict(test[FEATURES + LEAKY]))
    Xa, Xb, ya, yb = train_test_split(df[FEATURES], df["cnt"], test_size=0.25, random_state=SEED)
    rnd = lgb.train(params, lgb.Dataset(Xa, ya), num_boost_round=600)
    random_split = metrics(yb, rnd.predict(Xb))
    traps = {
        "leakage_r2": float(leak_r2),
        "random_split": random_split,
        "temporal_split": results["gbm"],
    }
    print("leakage R2", round(leak_r2, 4), "| random split", random_split)

    # --- drivers: mean |SHAP| via LightGBM native contributions ---------------------
    contrib = gbm.predict(X_te, pred_contrib=True)[:, :-1]
    imp = np.abs(contrib).mean(axis=0)
    drivers = sorted(
        ({"feature": f, "label": FEATURE_LABELS[f], "impact": float(v)}
         for f, v in zip(FEATURES, imp)),
        key=lambda d: -d["impact"],
    )
    total = sum(d["impact"] for d in drivers)
    for d in drivers:
        d["share"] = d["impact"] / total

    # --- evidence for the ops guidance ----------------------------------------------
    d2 = df.copy()
    d2["daytype"] = np.where(d2["workingday"] == 1, "working", "off")
    hourly = (d2.groupby(["daytype", "hr"])["cnt"].mean().unstack(0).round(1)
              .reset_index().rename(columns={"working": "working", "off": "off"}))
    temp_c = (d2["temp"] * 41)
    bins = pd.cut(temp_c, [-10, 5, 10, 15, 20, 25, 30, 50],
                  labels=["<5", "5-10", "10-15", "15-20", "20-25", "25-30", "30+"])
    by_temp = d2.groupby(bins, observed=True)["cnt"].mean().round(1)
    by_weather = d2.groupby("weathersit")["cnt"].agg(["mean", "count"]).round(1)
    by_month = d2.groupby(["yr", "mnth"])["cnt"].mean().round(1).unstack(0)
    eda = {
        "hourly_profile": hourly.to_dict(orient="records"),
        "by_temp": [{"bin": str(k), "avg": float(v)} for k, v in by_temp.items()],
        "by_weather": [{"code": int(k), "avg": float(r["mean"]), "hours": int(r["count"])}
                       for k, r in by_weather.iterrows()],
        "by_month": [{"month": int(m), "y2011": float(r.get(0, np.nan)),
                      "y2012": float(r.get(1, np.nan))} for m, r in by_month.iterrows()],
        "growth_2012_vs_2011": float(df[df.yr == 1]["cnt"].mean() / df[df.yr == 0]["cnt"].mean() - 1),
        "peak_ratio_8am_vs_3am": float(
            d2[(d2.workingday == 1) & (d2.hr == 8)]["cnt"].mean()
            / d2[(d2.workingday == 1) & (d2.hr == 3)]["cnt"].mean()),
    }

    # --- forecast artifact (test window) ---------------------------------------------
    fc = test[["ts", "cnt", "hr", "workingday", "weathersit", "temp", "hum", "windspeed",
               "season", "mnth", "weekday", "holiday", "yr"]].copy()
    fc["model"] = preds["gbm"].round(1)
    fc["baseline"] = preds["last_week"].round(1)
    fc["mean_baseline"] = preds["mean"].round(1)
    forecast = [
        {"t": r.ts.strftime("%Y-%m-%dT%H:00"), "actual": int(r.cnt), "model": float(r.model),
         "baseline": float(r.baseline), "hr": int(r.hr), "workingday": int(r.workingday),
         "weather": int(r.weathersit), "tempC": round(float(r.temp) * 41, 1)}
        for r in fc.itertuples()
    ]

    # MAE by hour-of-day (is the error usable where it matters?)
    fc["err"] = (fc["model"] - fc["cnt"]).abs()
    err_by_hour = fc.groupby("hr")["err"].mean().round(1)
    peak_mask = fc["hr"].isin([7, 8, 9, 17, 18, 19]) & (fc["workingday"] == 1)

    summary = {
        "split": {"train_rows": int(len(train)), "test_rows": int(len(test)),
                  "train_from": train["ts"].min().strftime("%Y-%m-%d"),
                  "train_to": train["ts"].max().strftime("%Y-%m-%d"),
                  "test_from": test["ts"].min().strftime("%Y-%m-%d"),
                  "test_to": test["ts"].max().strftime("%Y-%m-%d")},
        "models": [
            {"key": "mean", "name": "Average demand", "kind": "baseline", **results["mean"]},
            {"key": "last_week", "name": "Same hour last week", "kind": "baseline", **results["last_week"]},
            {"key": "ridge", "name": "Ridge regression", "kind": "model", **results["ridge"]},
            {"key": "rf", "name": "Random forest", "kind": "model", **results["rf"]},
            {"key": "gbm", "name": "Gradient boosting", "kind": "model", **results["gbm"]},
        ],
        "champion": "gbm",
        "improvement_vs_last_week": 1 - results["gbm"]["mae"] / results["last_week"]["mae"],
        "improvement_vs_mean": 1 - results["gbm"]["mae"] / results["mean"]["mae"],
        "mean_demand_test": float(y_te.mean()),
        "peak_mae": float(fc.loc[peak_mask, "err"].mean()),
        "peak_mean_demand": float(fc.loc[peak_mask, "cnt"].mean()),
        "err_by_hour": [{"hr": int(h), "mae": float(v)} for h, v in err_by_hour.items()],
        "traps": traps,
    }

    print_report(summary, drivers, eda)
    if no_export:
        print("\n--no-export: the website's data files were NOT changed.")
        return

    # --- model for the browser: LightGBM trees as JSON, scored in TypeScript ----------
    dump = gbm.dump_model()

    def slim(node: dict) -> dict:
        if "leaf_value" in node:
            return {"v": node["leaf_value"]}
        return {"f": node["split_feature"], "t": node["threshold"],
                "d": node["decision_type"], "l": node["default_left"],
                "L": slim(node["left_child"]), "R": slim(node["right_child"])}

    model_json = {"features": FEATURES, "trees": [slim(t["tree_structure"]) for t in dump["tree_info"]]}

    for name, obj in {"summary": summary, "drivers": drivers, "eda": eda,
                      "forecast": forecast, "model": model_json}.items():
        (OUT / f"{name}.json").write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")
    print("wrote artifacts to", OUT)


def print_report(summary: dict, drivers: list, eda: dict) -> None:
    """Readable stats for the terminal (the same numbers the PDF report uses)."""
    line = "-" * 78
    print(f"\n{line}\nMODEL COMPARISON  (test window {summary['split']['test_from']} -> {summary['split']['test_to']})\n{line}")
    print(f"{'model':<24}{'type':<10}{'MAE':>8}{'RMSE':>9}{'R2':>8}")
    for m in summary["models"]:
        star = "  <- used in the app" if m["key"] == summary["champion"] else ""
        print(f"{m['name']:<24}{m['kind']:<10}{m['mae']:>8.1f}{m['rmse']:>9.1f}{m['r2']:>8.3f}{star}")
    print(f"\nimprovement vs same-hour-last-week: {summary['improvement_vs_last_week']:.0%}   "
          f"vs average: {summary['improvement_vs_mean']:.0%}")
    print(f"commute-peak MAE: {summary['peak_mae']:.0f} bikes on ~{summary['peak_mean_demand']:.0f} rentals/hour")

    t = summary["traps"]
    print(f"\n{line}\nTRAPS\n{line}")
    print(f"leakage (casual/registered kept): R2 = {t['leakage_r2']:.3f}   vs honest R2 = {t['temporal_split']['r2']:.3f}")
    print(f"random split: MAE {t['random_split']['mae']:.1f} (R2 {t['random_split']['r2']:.3f})   "
          f"vs time split: MAE {t['temporal_split']['mae']:.1f}")

    print(f"\n{line}\nDRIVERS (mean |SHAP|, share of total)\n{line}")
    for d in drivers[:8]:
        print(f"{d['label']:<22}{d['share']:>7.1%}  {'#' * int(d['share'] * 80)}")

    print(f"\n{line}\nERROR BY HOUR (MAE, bikes/hour)\n{line}")
    row = []
    for e in summary["err_by_hour"]:
        row.append(f"{e['hr']:02d}h {e['mae']:6.1f}")
        if len(row) == 6:
            print("   ".join(row)); row = []
    print(f"\ngrowth 2012 vs 2011: {eda['growth_2012_vs_2011']:.0%}   "
          f"8am vs 3am on working days: {eda['peak_ratio_8am_vs_3am']:.0f}x")


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Train the CityCycle model and print its stats.")
    ap.add_argument("--no-export", action="store_true",
                    help="train and print stats only; do not overwrite the website's data files")
    args = ap.parse_args()
    main(args.no_export)
