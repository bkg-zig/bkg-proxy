import { useMemo, useState } from 'react';
import { fmt } from '../lib/api';

export const COLORS = ['#4a9eff', '#c65df0', '#3fb96f', '#e5b83b', '#ff9d97', '#6db1ff', '#ff9a3c'];

export function Ring({ value, color }: { value: number; color: string }) {
  const v = Math.max(0, Math.min(100, Number(value || 0)));
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`${v.toFixed(1)} Prozent`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="12" />
      <circle
        cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12"
        strokeDasharray={c} strokeDashoffset={c - (v / 100) * c}
        transform="rotate(-90 70 70)" strokeLinecap="round"
      />
      <text x="70" y="76" textAnchor="middle" fill="#eef2f7" fontFamily="JetBrains Mono" fontSize="20" fontWeight="700">
        {v.toFixed(1)}%
      </text>
    </svg>
  );
}

export interface Series {
  name: string;
  color?: string;
  points: Array<{ t: number; v: number }>;
}

export function LineChart({ series, unit }: { series: Series[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const clean = series.filter((s) => s.points.length);
  const { minT, maxT, maxV } = useMemo(() => {
    let minT = Infinity, maxT = -Infinity, maxV = 0;
    clean.forEach((s) => s.points.forEach((p) => {
      minT = Math.min(minT, p.t); maxT = Math.max(maxT, p.t); maxV = Math.max(maxV, p.v);
    }));
    if (!Number.isFinite(minT)) { minT = 0; maxT = 1; }
    if (minT === maxT) { minT -= 60_000; maxT += 60_000; }
    return { minT, maxT, maxV: Math.max(maxV, 1) };
  }, [clean]);

  if (!clean.length) return <p className="muted">Noch keine Daten in diesem Zeitraum.</p>;
  const W = 900, H = 190, P = 38;
  const X = (t: number) => P + ((t - minT) / (maxT - minT)) * (W - P - 10);
  const Y = (v: number) => H - 26 - (v / maxV) * (H - 50);

  const nearest = (target: number) => {
    let best: { t: number; v: number } | null = null;
    clean.forEach((s) => s.points.forEach((p) => {
      if (!best || Math.abs(p.t - target) < Math.abs(best.t - target)) best = p;
    }));
    return best as { t: number; v: number } | null;
  };

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block' }}
        role="img"
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          setHover(minT + ((x - P) / (W - P - 10)) * (maxT - minT));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={P} y1={H - 26} x2={W - 10} y2={H - 26} stroke="rgba(255,255,255,.1)" />
        <text x="4" y="16" fill="#62707f" fontFamily="JetBrains Mono" fontSize="11">
          {fmt(maxV)} {unit}
        </text>
        {clean.map((s, i) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color ?? COLORS[i % COLORS.length]}
            strokeWidth="2"
            points={s.points.map((p) => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')}
          />
        ))}
        {hover !== null && nearest(hover) && (
          <line
            x1={X(nearest(hover)!.t)} y1={10} x2={X(nearest(hover)!.t)} y2={H - 26}
            stroke="rgba(255,255,255,.3)" strokeDasharray="3 3"
          />
        )}
      </svg>
      {hover !== null && nearest(hover) && (
        <div className="tip" style={{ display: 'block', left: 14, top: 8 }}>
          <strong>{new Date(nearest(hover)!.t).toLocaleString('de-DE')}</strong>
          {clean.map((s, i) => {
            let near: { t: number; v: number } | null = null;
            s.points.forEach((p) => {
              if (!near || Math.abs(p.t - nearest(hover)!.t) < Math.abs(near.t - nearest(hover)!.t)) near = p;
            });
            const n = near as { v: number } | null;
            return (
              <div key={s.name}>
                <span style={{ color: s.color ?? COLORS[i % COLORS.length] }}>■</span> {s.name}:{' '}
                <strong>{n ? fmt(Math.round(n.v * 100) / 100) : '–'}</strong> {unit}
              </div>
            );
          })}
        </div>
      )}
      <p className="legend">
        {clean.map((s, i) => (
          <span key={s.name} style={{ marginRight: 12 }}>
            <span style={{ color: s.color ?? COLORS[i % COLORS.length] }}>■</span> {s.name}
          </span>
        ))}
      </p>
    </div>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  fmt?: (value: never, row: T) => string;
}

export function SortableTable<T extends Record<string, unknown>>({
  id, columns, rows,
}: {
  id: string;
  columns: Array<Column<T>>;
  rows: T[];
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`sort:${id}`) ?? 'null') ?? { key: columns[0].key, dir: -1 };
    } catch {
      return { key: columns[0].key, dir: -1 };
    }
  });
  const sorted = [...rows].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    const numeric = !Number.isNaN(Number(x)) && !Number.isNaN(Number(y)) && x !== '' && y !== '';
    const cmp = numeric ? Number(x) - Number(y) : String(x ?? '').localeCompare(String(y ?? ''));
    return cmp * sort.dir;
  });
  return (
    <table className="cyber-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              onClick={() => {
                const next = { key: c.key, dir: (sort.key === c.key ? -sort.dir : -1) as 1 | -1 };
                setSort(next);
                sessionStorage.setItem(`sort:${id}`, JSON.stringify(next));
              }}
            >
              {c.label}{sort.key === c.key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c.key}>{c.fmt ? c.fmt(row[c.key] as never, row) : String(row[c.key] ?? '')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Meter({ value, max }: { value: number; max: number }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar-track">
      <div className={`bar-fill${percent > 90 ? ' over' : percent > 65 ? ' hot' : ''}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function seriesBy(rows: Array<Record<string, unknown>>, key: string, value: (r: Record<string, unknown>) => number): Series[] {
  const map = new Map<string, Array<{ t: number; v: number }>>();
  rows.forEach((r) => {
    const name = String(r[key] ?? '–');
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push({ t: Number(r.t), v: value(r) });
  });
  return [...map.entries()].map(([name, points], i) => ({
    name,
    points: points.sort((a, b) => a.t - b.t),
    color: COLORS[i % COLORS.length],
  }));
}
