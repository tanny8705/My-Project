export default function CreditCard({ label, value, sub }) {
  return (
    <div className="card" style={{ minWidth: 160 }}>
      <div className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.03em" }}>{value}</div>
      {sub && (
        <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.35rem" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
