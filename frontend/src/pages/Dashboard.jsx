import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiActivities, apiCreditsBreakdown, apiCreditsTotal, apiEligibility, apiYearlyProgress } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import CreditCard from "../components/CreditCard.jsx";
import ProgressBar from "../components/ProgressBar.jsx";

function statusColor(s) {
  if (s === "approved") return "var(--success)";
  if (s === "rejected") return "var(--danger)";
  return "var(--warning)";
}

export default function Dashboard() {
  const { token, user, loading } = useAuth();
  const [totals, setTotals] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [recent, setRecent] = useState([]);
  const [years, setYears] = useState([]);
  const [elig, setElig] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token || !user?.roles?.includes("student")) return;
    let cancelled = false;
    (async () => {
      try {
        const [t, b, acts] = await Promise.all([
          apiCreditsTotal(token),
          apiCreditsBreakdown(token),
          apiActivities(token),
        ]);
        const [yp, el] = await Promise.all([apiYearlyProgress(token), apiEligibility(token)]);
        if (!cancelled) {
          setTotals(t);
          setBreakdown(b.breakdown || []);
          setRecent((acts.activities || []).slice(0, 5));
          setYears(yp.years || []);
          setElig(el || null);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  if (!token && !loading) return <Navigate to="/login" replace />;
  if (loading || !user) return <p className="muted layout">Loading…</p>;
  if (user.roles?.includes("admin")) return <Navigate to="/admin" replace />;
  if (user.roles?.includes("faculty")) return <Navigate to="/faculty" replace />;
  if (user.roles?.includes("hod")) return <Navigate to="/hod" replace />;
  if (user.roles?.includes("tpo")) return <Navigate to="/tpo" replace />;
  if (!user.roles?.includes("student")) return <Navigate to="/" replace />;

  const grand = totals?.grand_total ?? 0;
  const target = totals?.target ?? 200;

  return (
    <div className="layout">
      <h1>Dashboard</h1>
      <p className="muted">Real-time credit score and progress toward graduation requirement (demo target: {target}).</p>
      {err && <p className="error">{err}</p>}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "1rem",
          marginTop: "1rem",
        }}
      >
        <CreditCard label="Grand total" value={grand} sub="Activity + internship" />
        <CreditCard label="Activity points" value={totals?.total_activity_points ?? 0} />
        <CreditCard label="Internship credits" value={totals?.total_internship_points ?? 0} sub="Approved internships only" />
      </div>
      <div style={{ marginTop: "1rem" }}>
        <ProgressBar current={grand} target={target} />
      </div>
      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>Category breakdown</h2>
        {breakdown.length === 0 ? (
          <p className="muted">No approved activities yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {breakdown.map((row) => (
              <li key={row.category}>
                <strong>{row.category}</strong> — {row.points} pts
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>Year-wise progress</h2>
        {years.length === 0 ? (
          <p className="muted">No approved records yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {years.map((y) => (
              <li key={y.year}>
                <strong>{y.year}</strong> — Activity: {y.activity_points} pts, Internship: {y.internship_credits} credits
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>Eligibility check</h2>
        {!elig ? (
          <p className="muted">Loading eligibility…</p>
        ) : (
          <div>
            <div style={{ fontWeight: 900, color: elig.eligible ? "var(--success)" : "var(--danger)" }}>
              {elig.eligible ? "ELIGIBLE FOR DEGREE ✅" : "NOT ELIGIBLE ❌"}
            </div>
            <div className="muted" style={{ marginTop: "0.35rem" }}>
              Requirement: Activity ≥ {elig.required_activity_points}, Internship ≥ {elig.required_internship_credits}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Activities</h2>
        {recent.length === 0 ? (
          <p className="muted">No submissions yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {recent.map((a) => (
              <li key={a.id} className="card" style={{ padding: "0.9rem 1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <strong>{a.title}</strong>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {a.activity_type} · {a.total_hours}h
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: statusColor(a.status), fontWeight: 800 }}>{a.status}</div>
                    {a.points_earned != null && <div className="muted" style={{ fontSize: "0.85rem" }}>{a.points_earned} pts</div>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
