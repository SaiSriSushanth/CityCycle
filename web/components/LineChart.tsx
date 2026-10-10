"use client";
import { useEffect, useRef, useState } from "react";

export type Series = { key: string; label: string; color: string; dash?: string; width?: number };
export type Point = { x: number; label: string } & Record<string, number | string>;

type Props = {
  data: Point[];
  series: Series[];
  height?: number;
  xTicks?: { x: number; text: string }[];
  yUnit?: string;
  area?: string; // series key to fill softly
};

const M = { l: 44, r: 12, t: 10, b: 26 };

export function LineChart({ data, series, height = 300, xTicks = [], yUnit = "", area }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setW(Math.max(280, el.getBoundingClientRect().width));
    measure(); // read the real width straight away instead of waiting for the first resize event
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (data.length === 0) return <div className="empty">No data for this range.</div>;

  const xs = data.map((d) => d.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let ymax = 0;
  for (const d of data) for (const s of series) ymax = Math.max(ymax, Number(d[s.key]) || 0);
  const step = ymax > 600 ? 200 : ymax > 250 ? 100 : 50;
  ymax = Math.ceil(ymax / step) * step;
  const iw = w - M.l - M.r, ih = height - M.t - M.b;
  const X = (x: number) => M.l + (x1 === x0 ? iw / 2 : ((x - x0) / (x1 - x0)) * iw);
  const Y = (v: number) => M.t + ih - (v / ymax) * ih;
  const path = (k: string) => data.map((d, i) => `${i ? "L" : "M"}${X(d.x).toFixed(1)},${Y(Number(d[k])).toFixed(1)}`).join("");
  const yTicks = Array.from({ length: ymax / step + 1 }, (_, i) => i * step);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    const target = x0 + ((px - M.l) / iw) * (x1 - x0);
    let best = 0, bd = Infinity;
    data.forEach((d, i) => { const dd = Math.abs(d.x - target); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };

  const h = hover !== null ? data[hover] : null;
  const tipLeft = h ? Math.min(Math.max(X(h.x) + 14, 8), w - 190) : 0;

  return (
    <div className="chart" ref={wrap}>
      <div className="legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color, opacity: s.dash ? 0.9 : 1 }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${height}`} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Demand chart">
        <g className="grid axis">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={w - M.r} y1={Y(t)} y2={Y(t)} />
              <text x={M.l - 8} y={Y(t) + 4} textAnchor="end">{t}{yUnit}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t.x} x={X(t.x)} y={height - 6} textAnchor="middle">{t.text}</text>
          ))}
        </g>
        {area && (
          <path d={`${path(area)}L${X(x1)},${Y(0)}L${X(x0)},${Y(0)}Z`} fill={series.find((s) => s.key === area)?.color} opacity="0.14" />
        )}
        {series.map((s) => (
          <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {h && (
          <g>
            <line x1={X(h.x)} x2={X(h.x)} y1={M.t} y2={M.t + ih} stroke="rgba(20,33,61,.45)" strokeDasharray="3 3" />
            {series.map((s) => (
              <circle key={s.key} cx={X(h.x)} cy={Y(Number(h[s.key]))} r="4.5" fill={s.color} stroke="#ffffff" strokeWidth="2.5" />
            ))}
          </g>
        )}
        <rect x={M.l} y={M.t} width={iw} height={ih} fill="transparent" />
      </svg>
      {h && (
        <div className="tooltip" style={{ left: tipLeft, top: 44 }}>
          <div className="t">{h.label}</div>
          {series.map((s) => (
            <div className="r" key={s.key}>
              <span><i className="dot" style={{ background: s.color }} />{s.label}</span>
              <b>{Math.round(Number(h[s.key]))}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
