export default function ProgressBar({ current, target, label }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <span style={{ fontWeight: 600 }}>{label || "Progress toward requirement"}</span>
        <span className="muted">
          {current} / {target} ({pct}%)
        </span>
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: "#121820",
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "linear-gradient(90deg, var(--accent), #22c55e)",
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}
