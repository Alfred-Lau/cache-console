type SeriesPoint = { day: string; sets: number; gets: number };

export function OpsChart({ series }: { series: SeriesPoint[] }) {
  const width = 640;
  const height = 220;
  const pad = { top: 16, right: 12, bottom: 36, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxVal = Math.max(1, ...series.flatMap((d) => [d.sets, d.gets]));
  const groupW = innerW / Math.max(series.length, 1);
  const barW = Math.max(6, groupW * 0.32);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-56 w-full min-w-[28rem] text-zinc-400"
        role="img"
        aria-label="最近 7 天 sets 与 gets"
      >
        <line
          x1={pad.left}
          y1={pad.top + innerH}
          x2={pad.left + innerW}
          y2={pad.top + innerH}
          stroke="currentColor"
          strokeOpacity="0.3"
        />
        {series.map((point, i) => {
          const x = pad.left + i * groupW + groupW / 2;
          const setsH = (point.sets / maxVal) * innerH;
          const getsH = (point.gets / maxVal) * innerH;
          const label = point.day.slice(5);
          return (
            <g key={point.day}>
              <rect
                x={x - barW - 2}
                y={pad.top + innerH - setsH}
                width={barW}
                height={setsH}
                fill="#34d399"
              />
              <rect
                x={x + 2}
                y={pad.top + innerH - getsH}
                width={barW}
                height={getsH}
                fill="#60a5fa"
              />
              <text
                x={x}
                y={height - 12}
                textAnchor="middle"
                className="fill-zinc-400"
                fontSize="11"
              >
                {label}
              </text>
            </g>
          );
        })}
        <text x={pad.left} y={12} fontSize="11" className="fill-emerald-400">
          sets
        </text>
        <text x={pad.left + 42} y={12} fontSize="11" className="fill-blue-400">
          gets
        </text>
      </svg>
    </div>
  );
}
