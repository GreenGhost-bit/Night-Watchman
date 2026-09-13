const CX = 100;
const CY = 100;
const R = 78;
const DOMAIN_MAX = 2.4;

function polarToCartesian(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CX + R * Math.cos(rad),
    y: CY - R * Math.sin(rad),
  };
}

function describeArc(fromValue: number, toValue: number) {
  const startAngle = 180 - (Math.min(fromValue, DOMAIN_MAX) / DOMAIN_MAX) * 180;
  const endAngle = 180 - (Math.min(toValue, DOMAIN_MAX) / DOMAIN_MAX) * 180;
  const start = polarToCartesian(startAngle);
  const end = polarToCartesian(endAngle);
  const largeArc = startAngle - endAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function HealthGauge({
  healthFactor,
  minHealthFactor,
}: {
  healthFactor: number;
  minHealthFactor: number;
}) {
  const clamped = Math.max(0, Math.min(healthFactor, DOMAIN_MAX));
  const needleAngle = 180 - (clamped / DOMAIN_MAX) * 180;
  const needleEnd = polarToCartesian(needleAngle);

  const status: "critical" | "warning" | "healthy" =
    healthFactor < 1 ? "critical" : healthFactor < minHealthFactor ? "warning" : "healthy";

  const statusColor =
    status === "critical" ? "var(--bad)" : status === "warning" ? "var(--accent)" : "var(--good)";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 118" className="w-full max-w-[280px]">
        <path
          d={describeArc(0, 1)}
          stroke="var(--bad)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="butt"
        />
        <path
          d={describeArc(1, minHealthFactor)}
          stroke="var(--accent)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="butt"
        />
        <path
          d={describeArc(minHealthFactor, DOMAIN_MAX)}
          stroke="var(--good)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="butt"
        />
        <line
          x1={CX}
          y1={CY}
          x2={needleEnd.x}
          y2={needleEnd.y}
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r="5.5" fill="var(--ink)" />
      </svg>
      <p className="-mt-2 font-mono text-4xl font-bold" style={{ color: statusColor }}>
        {healthFactor.toFixed(2)}
      </p>
      <p className="tracked-label text-[10px] text-ink-faint">Health Factor</p>
    </div>
  );
}
