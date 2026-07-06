const WAYPOINTS: [number, number][] = [
  [0.19, 0.74], [0.30, 0.55], [0.42, 0.40], [0.62, 0.33], [0.78, 0.47],
  [0.70, 0.66], [0.50, 0.72], [0.34, 0.66],
]; // normalized loop, lifted from the mockup route polylines

export function projectStops(
  stops: { order: number; label: string; lat?: number; lon?: number }[],
  width: number,
  height: number,
): { order: number; label: string; x: number; y: number }[] {
  const coords = stops.filter((s) => s.lat != null && s.lon != null);
  if (coords.length === 0) {
    return stops.map((s, i) => {
      const [nx, ny] = WAYPOINTS[i % WAYPOINTS.length];
      return { order: s.order, label: s.label, x: nx * width, y: ny * height };
    });
  }
  const lats = coords.map((s) => s.lat as number);
  const lons = coords.map((s) => s.lon as number);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const spanLat = maxLat - minLat || 1, spanLon = maxLon - minLon || 1;
  const pad = 44;
  return stops.map((s) => {
    const x = s.lon != null ? pad + ((s.lon - minLon) / spanLon) * (width - 2 * pad) : width / 2;
    const y = s.lat != null ? pad + ((maxLat - s.lat) / spanLat) * (height - 2 * pad) : height / 2;
    return { order: s.order, label: s.label, x, y };
  });
}

export function MapCanvas({
  stops,
  activeOrder,
  width = 360,
  height = 764,
  showUserDot = false,
}: {
  stops: { order: number; label: string; lat?: number; lon?: number }[];
  activeOrder?: number;
  width?: number;
  height?: number;
  showUserDot?: boolean;
}) {
  const pts = projectStops(stops, width, height);
  const routeD = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") + " Z";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%" }}>
      <rect width={width} height={height} fill="#e8dec9" />
      {/* water shape (right) */}
      <path d="M300 0 L360 0 L360 764 L262 764 C300 540 250 300 300 0 Z" fill="#cdd9d6" />
      {/* park shape (bottom-left) */}
      <path d="M16 560 Q70 540 132 576 L150 700 L26 720 Z" fill="#d7ddc1" />
      {/* road strokes — major roads (from mockup lines 123–124) */}
      <g stroke="#dcd0b7" strokeWidth={9} strokeLinecap="round">
        <line x1={-10} y1={150} x2={330} y2={120} />
        <line x1={-10} y1={320} x2={300} y2={350} />
        <line x1={-10} y1={480} x2={280} y2={500} />
        <line x1={80} y1={-10} x2={60} y2={560} />
        <line x1={200} y1={-10} x2={230} y2={540} />
      </g>
      {/* road strokes — minor roads (from mockup lines 123–124) */}
      <g stroke="#e4dac4" strokeWidth={4} strokeLinecap="round">
        <line x1={-10} y1={230} x2={320} y2={210} />
        <line x1={-10} y1={410} x2={290} y2={430} />
        <line x1={140} y1={-10} x2={150} y2={560} />
      </g>
      {/* dashed terracotta route polyline */}
      <path
        d={routeD}
        fill="none"
        stroke="var(--tq-terracotta)"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="2 11"
        style={{ animation: "tqdash 1.4s linear infinite" }}
      />
      {/* pins */}
      {pts.map((p) => {
        const active = p.order === activeOrder;
        const isStart = p.label === "S";
        return (
          <g key={p.order}>
            {active && (
              <circle
                cx={p.x}
                cy={p.y}
                r={17}
                fill="var(--tq-terracotta)"
                opacity={0.4}
                style={{
                  animation: "tqpulse 2.2s ease-out infinite",
                  transformOrigin: `${p.x}px ${p.y}px`,
                }}
              />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={active ? 17 : 12}
              fill={active || isStart ? (isStart ? "var(--tq-navy)" : "var(--tq-terracotta)") : "var(--tq-white)"}
              stroke={active || isStart ? "none" : "var(--tq-terracotta)"}
              strokeWidth={2.5}
            />
            <text
              x={p.x}
              y={p.y + 4.5}
              textAnchor="middle"
              fontFamily="DM Sans"
              fontWeight={700}
              fontSize={12}
              fill={active || isStart ? "var(--tq-white)" : "var(--tq-navy)"}
            >
              {p.label}
            </text>
          </g>
        );
      })}
      {showUserDot && pts[1] && (
        <circle
          cx={pts[1].x - 18}
          cy={pts[1].y + 40}
          r={7}
          fill="var(--tq-navy)"
          stroke="var(--tq-white)"
          strokeWidth={3}
        />
      )}
    </svg>
  );
}
