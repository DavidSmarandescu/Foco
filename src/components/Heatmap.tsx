import { useEffect, useMemo, useRef } from 'react';
import { heatLevel, heatmapWeeks, type DailyTotals } from '../lib/streak';
import { formatDateLong, formatDuration, parseDayKey } from '../lib/time';

const CELL = 12;
const GAP = 3;
const LEFT = 22;
const TOP = 18;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function Heatmap({ totals, todayKey, goalMs }: { totals: DailyTotals; todayKey: string; goalMs: number }) {
  const cols = useMemo(() => heatmapWeeks(totals, todayKey, 53), [totals, todayKey]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const width = LEFT + cols.length * (CELL + GAP);
  const height = TOP + 7 * (CELL + GAP);

  // Etiqueta de mes en la primera semana que contiene un día 1–7.
  const monthLabels = cols
    .map((col, i) => {
      const d = parseDayKey(col[0].key);
      return d.getDate() <= 7 ? { i, label: MONTHS[d.getMonth()] } : null;
    })
    .filter((x): x is { i: number; label: string } => x !== null);

  return (
    <div className="heatmap" ref={scroller}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Minutos estudiados por día durante el último año">
        {monthLabels.map((m) => (
          <text key={m.i} x={LEFT + m.i * (CELL + GAP)} y={11} className="hm-text">
            {m.label}
          </text>
        ))}
        {[
          ['L', 0],
          ['X', 2],
          ['V', 4],
        ].map(([l, r]) => (
          <text key={l} x={0} y={TOP + (r as number) * (CELL + GAP) + CELL - 2} className="hm-text">
            {l}
          </text>
        ))}
        {cols.map((col, i) =>
          col.map((c, d) =>
            c.future ? null : (
              <rect
                key={c.key}
                x={LEFT + i * (CELL + GAP)}
                y={TOP + d * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={3}
                className={`hm-l${heatLevel(c.ms, goalMs)}${c.key === todayKey ? ' hm-today' : ''}`}
              >
                <title>
                  {formatDateLong(parseDayKey(c.key))}: {c.ms > 0 ? formatDuration(c.ms) : 'sin estudio'}
                </title>
              </rect>
            ),
          ),
        )}
      </svg>
    </div>
  );
}
