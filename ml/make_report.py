"""Builds docs/CityCycle_Model_Report.pdf from the numbers in web/public/data/summary.json.

Run from the repo root:  python ml/make_data_checks_pdf.py
"""
import io
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
S = json.loads((ROOT / "web/public/data/summary.json").read_text(encoding="utf-8"))
E = json.loads((ROOT / "web/public/data/eda.json").read_text(encoding="utf-8"))
df = pd.read_csv(ROOT / "data/raw/hour.csv", parse_dates=["dteday"])

gbm = next(m for m in S["models"] if m["key"] == "gbm")
lw = next(m for m in S["models"] if m["key"] == "last_week")
T = S["traps"]
span_hours = int((df["dteday"].max() - df["dteday"].min()).days + 1) * 24
missing = span_hours - len(df)

GREEN, INK, MUTED, LINE = colors.HexColor("#0f9d58"), colors.HexColor("#1b1f24"), colors.HexColor("#5b6572"), colors.HexColor("#d9dee5")
base = getSampleStyleSheet()
st = {
    "title": ParagraphStyle("t", parent=base["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, alignment=0, textColor=INK, spaceAfter=4),
    "lead": ParagraphStyle("l", parent=base["Normal"], fontSize=11, leading=16, textColor=MUTED, spaceAfter=10),
    "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=INK, spaceBefore=14, spaceAfter=6),
    "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=GREEN, spaceBefore=8, spaceAfter=3),
    "p": ParagraphStyle("p", parent=base["Normal"], fontSize=10, leading=14.5, textColor=INK, spaceAfter=5),
    "li": ParagraphStyle("li", parent=base["Normal"], fontSize=10, leading=14.5, textColor=INK, leftIndent=12, bulletIndent=0, spaceAfter=2),
    "cell": ParagraphStyle("c", parent=base["Normal"], fontSize=9, leading=12, textColor=INK),
    "cellb": ParagraphStyle("cb", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=INK),
}


def P(t, s="p"):
    return Paragraph(t, st[s])


def bullets(items):
    return [Paragraph(i, st["li"], bulletText="•") for i in items]


def table(rows, widths, header=True):
    data = [[Paragraph(str(c), st["cellb"] if (header and r == 0) else st["cell"]) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f6")))
    t.setStyle(TableStyle(style))
    return t


PLOT_GREEN, PLOT_BLUE, PLOT_GREY = "#0f9d58", "#5b6cff", "#9aa4b2"


def chart(draw, w_mm=170, h_mm=62):
    """Draws a matplotlib chart in the report's style and returns it as a PDF image."""
    fig, ax = plt.subplots(figsize=(w_mm / 25.4, h_mm / 25.4), dpi=200)
    draw(ax)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.spines["left"].set_color(PLOT_GREY)
    ax.spines["bottom"].set_color(PLOT_GREY)
    ax.tick_params(colors="#5b6572", labelsize=7.5)
    ax.grid(axis="y", color="#e6eaf0", linewidth=0.6)
    ax.set_axisbelow(True)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    buf.seek(0)
    return Image(buf, width=w_mm * mm, height=h_mm * mm)


def hourly_chart(ax):
    hp = E["hourly_profile"]
    hrs = [h["hr"] for h in hp]
    ax.plot(hrs, [h["working"] for h in hp], color=PLOT_GREEN, lw=2, label="Working days")
    ax.plot(hrs, [h["off"] for h in hp], color=PLOT_BLUE, lw=1.8, ls="--", label="Weekends and holidays")
    ax.set_xticks(range(0, 24, 3))
    ax.set_xticklabels([f"{h:02d}h" for h in range(0, 24, 3)])
    ax.set_ylabel("Average rentals per hour", fontsize=8, color="#5b6572")
    ax.legend(frameon=False, fontsize=8)


def temp_chart(ax):
    bt = E["by_temp"]
    ax.bar([b["bin"] for b in bt], [b["avg"] for b in bt], color=PLOT_GREEN, width=0.62)
    for i, b in enumerate(bt):
        ax.text(i, b["avg"] + 5, f"{b['avg']:.0f}", ha="center", fontsize=7.5, color="#1b1f24")
    ax.set_xlabel("Temperature band (degrees C)", fontsize=8, color="#5b6572")
    ax.set_ylabel("Average rentals per hour", fontsize=8, color="#5b6572")


def growth_chart(ax):
    bm = E["by_month"]
    ax.plot([m["month"] for m in bm], [m["y2011"] for m in bm], color=PLOT_GREY, lw=2, label="2011")
    ax.plot([m["month"] for m in bm], [m["y2012"] for m in bm], color=PLOT_GREEN, lw=2, label="2012")
    ax.set_xticks(range(1, 13))
    ax.set_xticklabels(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])
    ax.set_ylabel("Average rentals per hour", fontsize=8, color="#5b6572")
    ax.legend(frameon=False, fontsize=8)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 12 * mm, "CityCycle: model and data report")
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Page {doc.page}")
    canvas.restoreState()


story = [
    P("CityCycle model and data report", "title"),
    P("The historical analysis behind the live app: demand patterns, what drives them, how the model was tested, the traps we found, and the limits of the results.", "lead"),
]

# --- 1. summary -------------------------------------------------------------------------
story += [
    P("1. The short version", "h1"),
    *bullets([
        f"Two traps in the data would have made the model look far better than it is. Both were found and handled.",
        f"On months the model never saw ({S['split']['test_from']} to {S['split']['test_to']}), the forecast misses by about <b>{gbm['mae']:.0f} bikes per hour</b>, "
        f"against <b>{lw['mae']:.0f}</b> for simply copying the same hour last week, which is {S['improvement_vs_last_week']*100:.0f}% better.",
        f"The model explains about {gbm['r2']*100:.1f}% of the variation in hourly demand on that test period (R-squared {gbm['r2']:.3f}).",
        "The error figure applies to the 2012 test months. It has not been measured on the live forecast, because that would need live rental counts.",
    ]),
]

# --- 2. data overview -------------------------------------------------------------------
story += [
    P("2. The data at a glance", "h1"),
    table([
        ["Item", "Value"],
        ["Source", "UCI Bike Sharing Dataset (Capital Bikeshare, Washington D.C.), hour.csv"],
        ["Rows", f"{len(df):,} hourly records, {df['dteday'].min():%Y-%m-%d} to {df['dteday'].max():%Y-%m-%d}"],
        ["Missing hours", f"{missing} hours are absent (a full two years would be {span_hours:,}). About two thirds fall between midnight and 6am, most likely because hours with no rentals were not recorded. "
                          "The largest gaps are 29 and 30 October 2012 (Hurricane Sandy) and some days in January 2011. We left the gaps as they are and did not fill them in."],
        ["Training rows", f"{S['split']['train_rows']:,} ({S['split']['train_from']} to {S['split']['train_to']})"],
        ["Test rows", f"{S['split']['test_rows']:,} ({S['split']['test_from']} to {S['split']['test_to']})"],
        ["Growth", f"2012 demand ran {E['growth_2012_vs_2011']*100:.0f}% above 2011, so the model carries a year trend."],
        ["Scaling", "Temperature, humidity and wind arrive normalized in the source. We convert temperature back to degrees Celsius for the interface."],
    ], [38 * mm, 132 * mm]),
]

# --- 2b. historical patterns ------------------------------------------------------------
hp = E["hourly_profile"]
w_top = sorted(hp, key=lambda h: -h["working"])
w_peaks = sorted([w_top[0], next(h for h in w_top if abs(h["hr"] - w_top[0]["hr"]) > 3)], key=lambda h: h["hr"])
off_peak = max(hp, key=lambda h: h["off"])
bt = {b["bin"]: b["avg"] for b in E["by_temp"]}
D = json.loads((ROOT / "web/public/data/drivers.json").read_text(encoding="utf-8"))
share = {d["feature"]: d["share"] for d in D}
wk_avg = sum(h["working"] for h in hp) / 24
off_avg = sum(h["off"] for h in hp) / 24
story += [
    P("3. Demand patterns in the historical data", "h1"),
    P("These are averages over the full 2011 to 2012 record. The live pages do not show them. They are what the model learned from."),
    P("Hour of day and day type", "h2"),
    P(f"On working days demand has two commute peaks, at {w_peaks[0]['hr']:02d}:00 (about {w_peaks[0]['working']:.0f} rentals) and {w_peaks[1]['hr']:02d}:00 (about {w_peaks[1]['working']:.0f}). "
      f"Demand at 8am is about {E['peak_ratio_8am_vs_3am']:.0f} times demand at 3am. On weekends and holidays there is a single midday hump peaking at {off_peak['hr']:02d}:00 (about {off_peak['off']:.0f}). "
      f"The average hour sees {wk_avg:.0f} rentals on working days and {off_avg:.0f} on weekends and holidays."),
    chart(hourly_chart),
    P("Temperature", "h2"),
    P(f"Warmer weather brings more riders: {bt['<5']:.0f} rentals per hour on average below 5 degrees C, {bt['10-15']:.0f} at 10 to 15, {bt['20-25']:.0f} at 20 to 25 and {bt['25-30']:.0f} at 25 to 30. "
      "In this data demand keeps rising across the whole temperature range."),
    chart(temp_chart),
    P("Growth between 2011 and 2012", "h2"),
    P(f"Average demand in 2012 ran {E['growth_2012_vs_2011']*100:.0f}% above 2011, in every month. The model carries a year trend for this."),
    chart(growth_chart),
    KeepTogether([
        P("4. What drives demand", "h1"),
        P("Share of the model's total impact on its predictions, measured on the test months (mean absolute SHAP value). These are predictive links, not proven causes."),
        table(
            [["Driver", "Share of impact"]] + [[d["label"], f"{d['share']*100:.1f}%"] for d in D[:8]],
            [90 * mm, 40 * mm],
        ),
    ]),
    Spacer(1, 6),
    P("Rules of thumb that follow from the history", "h2"),
    *bullets([
        f"<b>Hour of day ({share['hr']*100:.0f}%).</b> Have bikes stocked at home-area docks before the morning peak and at evening return points before the evening peak. "
        "Run a reverse sweep in the quiet middle of the day.",
        f"<b>Temperature ({share['temp']*100:.0f}%).</b> Scale crews and truck runs with the temperature forecast: fewer on cold days, full strength on warm ones. Treat rain and snow as a separate reduction.",
        f"<b>Working day ({share['workingday']*100:.0f}%).</b> Keep a separate weekend playbook, since the demand shape is different.",
        f"<b>Growth trend ({share['yr']*100:.0f}%).</b> Retrain regularly and plan fleet size for continued growth.",
    ]),
    P("The timings in these rules (for example finishing the overnight run two hours before the peak) are simple heuristics, not optimized values. Truck travel and loading times are not in the data."),
]
# --- 3. trap 1 --------------------------------------------------------------------------
story += [
    P("5. Trap 1: two columns hand over the answer", "h1"),
    P("<b>What we found.</b> The columns <i>casual</i> and <i>registered</i> add up exactly to <i>cnt</i>, the number we are predicting. "
      "A model that sees either column is effectively being given the answer."),
    P(f"<b>The proof.</b> With those columns included, the model scored an R-squared of <b>{T['leakage_r2']:.3f}</b> on the test months. "
      f"Without them it scored <b>{gbm['r2']:.3f}</b>. The first number looks perfect and is useless, because nobody knows how many casual or registered riders there will be before the hour has happened."),
    P("<b>What we did.</b> Removed both columns. We also removed <i>instant</i> (a row counter) and <i>dteday</i> (replaced by month, weekday and hour), "
      "and <i>atemp</i> (feels-like temperature, almost identical to temperature)."),
    P("<b>Rule of thumb.</b> A score above 0.99 on this problem means a leak, not a great model."),
]

# --- 4. trap 2 --------------------------------------------------------------------------
rs = T["random_split"]
story += [
    P("6. Trap 2: a random split lets the model see the future", "h1"),
    P("<b>What we found.</b> If rows are split at random into training and test sets, the hour before and the hour after each test row sit in the training data. "
      "Demand changes smoothly, so the model can fill in the answer by looking at its neighbours."),
    KeepTogether([
        P("<b>The proof.</b>"),
        table([
            ["How the test was done", "Average miss (bikes per hour)", "R-squared"],
            ["Random split (flattering)", f"{rs['mae']:.1f}", f"{rs['r2']:.3f}"],
            ["Time split (honest)", f"{gbm['mae']:.1f}", f"{gbm['r2']:.3f}"],
        ], [70 * mm, 60 * mm, 40 * mm]),
    ]),
    Spacer(1, 5),
    P(f"<b>What we did.</b> Trained on {S['split']['train_from']} to {S['split']['train_to']} and tested on the six months after, which is how the forecast is used in practice. "
      "The random-split number is shown only to explain why it must not be used."),
]

# --- 5. models --------------------------------------------------------------------------
story += [
    P("7. Baselines and models compared", "h1"),
    P("Every model was scored on the same held-out months. Lower miss is better."),
    table(
        [["Model", "Type", "Average miss (bikes/hour)", "RMSE", "R-squared"]]
        + [[m["name"], "Baseline" if m["kind"] == "baseline" else "Model", f"{m['mae']:.1f}", f"{m['rmse']:.1f}", f"{m['r2']:.2f}"] for m in S["models"]],
        [55 * mm, 22 * mm, 45 * mm, 24 * mm, 24 * mm],
    ),
    Spacer(1, 5),
    P("Gradient boosting won and is used in the app. Random forest came close. A simple linear model was clearly weaker because demand has sharp, non-linear patterns "
      "such as the 8am and 5 to 6pm commute peaks."),
]

# --- 6. where error sits ----------------------------------------------------------------
eh = S["err_by_hour"]
rows = [["Hour", "Miss", "Hour", "Miss", "Hour", "Miss", "Hour", "Miss"]]
for i in range(6):
    r = []
    for k in range(4):
        h = eh[i + 6 * k]
        r += [f"{h['hr']:02d}:00", f"{h['mae']:.1f}"]
    rows.append(r)
story += [
    KeepTogether([
        P("8. Where the error sits", "h1"),
        P(f"Average miss in bikes per hour, by hour of day, on the test months. Night hours are easy. Commute hours are the hard part: "
          f"at commute peaks on working days the miss is about {S['peak_mae']:.0f} bikes on roughly {S['peak_mean_demand']:.0f} rentals per hour."),
        table(rows, [21 * mm] * 8),
    ]),
]

# --- 7. live forecast checks ------------------------------------------------------------
story += [
    P("9. Checks on the live forecast", "h1"),
    P("The live view feeds a 7-day weather outlook for Washington D.C. (Open-Meteo) into the same model."),
    table([
        ["Step", "How it is handled", "How to verify"],
        ["Weather values", "Temperature, humidity and wind are passed through unchanged.", "Compare /api/live with the Open-Meteo response for the same hour."],
        ["Weather type", "WMO weather codes are mapped to the dataset's 4 types: clear, cloudy, light rain or snow, heavy rain or snow.", "Check that rainy hours show type 3 or 4 and clear hours show type 1."],
        ["Working day", "Weekends and US federal holidays (plus DC Emancipation Day) count as non-working days.", "Checked against the holiday flags in the 2011 to 2012 data: 729 of 731 days match. The two differences are Juneteenth, which was not a holiday then and is now."],
        ["Time zone", "Hours are in Washington local time.", "Hour 08:00 should match 8am in D.C."],
    ], [30 * mm, 75 * mm, 65 * mm]),
]

# --- 8. limits --------------------------------------------------------------------------
story += [
    P("10. Known limits", "h1"),
    *bullets([
        "<b>Live totals reflect the 2012 system size.</b> Demand grew by about 63% in 2012. The model learned from 2011 and 2012 only, and tree models cannot predict beyond levels they have seen, "
        "so live totals may be too low if the system has grown. The shape of the day (when the peaks fall) is more reliable than the exact counts. Retraining on current rental data would fix this.",
        "<b>The error figure has not been measured live.</b> It comes from the 2012 test months. Measuring it for live forecasts needs live rental counts to compare against.",
        "<b>Weather forecasts can be wrong.</b> A wrong weather forecast produces a wrong demand forecast, however good the model is.",
        "<b>Wind unit is assumed.</b> The dataset does not state the unit of its normalized wind speed. We assumed kilometres per hour, which is what the weather service returns. Wind accounts for about 1% of model impact, so the effect would be small.",
        "<b>City-wide totals only.</b> The data cannot say which dock needs bikes.",
        "<b>Drivers are predictive, not proven causes.</b> A pattern such as warmer weather and higher demand should be tested on a few docks before it becomes a rule.",
    ]),
]

out = ROOT / "docs" / "CityCycle_Model_Report.pdf"
out.parent.mkdir(exist_ok=True)
SimpleDocTemplate(str(out), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=20 * mm,
                  title="CityCycle model and data report", author="CityCycle team").build(story, onFirstPage=footer, onLaterPages=footer)
print("wrote", out)
