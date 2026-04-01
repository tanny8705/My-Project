import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiInternships } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

function statusColor(s) {
  if (s === "approved") return "var(--success)";
  if (s === "rejected") return "var(--danger)";
  return "var(--warning)";
}

export default function InternshipSubmissions() {
  const { token, user, loading } = useAuth();
  const [tab, setTab] = useState("pending");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [err, setErr] = useState("");

  const tabs = useMemo(
    () => [
      { id: "pending", label: "Pending" },
      { id: "approved", label: "Approved" },
      { id: "rejected", label: "Rejected" },
    ],
    []
  );

  useEffect(() => {
    if (!token || !user?.roles?.includes("student")) return;
    let cancelled = false;
    (async () => {
      try {
        const [p, a, r] = await Promise.all([
          apiInternships(token, "pending"),
          apiInternships(token, "approved"),
          apiInternships(token, "rejected"),
        ]);
        if (cancelled) return;
        setCounts({
          pending: p.internships?.length ?? 0,
          approved: a.internships?.length ?? 0,
          rejected: r.internships?.length ?? 0,
        });
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  useEffect(() => {
    if (!token || !user?.roles?.includes("student")) return;
    let cancelled = false;
    (async () => {
      try {
        setErr("");
        const data = await apiInternships(token, tab);
        if (!cancelled) setItems(data.internships || []);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, tab, user]);

  if (!token && !loading) return <Navigate to="/login" replace />;
  if (loading || !user) return <p className="muted layout">Loading…</p>;
  if (user.roles?.includes("admin")) return <Navigate to="/admin" replace />;
  if (user.roles?.includes("faculty")) return <Navigate to="/faculty" replace />;
  if (!user.roles?.includes("student")) return <Navigate to="/dashboard" replace />;

  return (
    <div className="layout">
      <h1>Internship Submissions</h1>
      {err && <p className="error">{err}</p>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              className={`btn ${active ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTab(t.id)}
            >
              {t.label} ({counts[t.id]})
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="muted">No internships in this status yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {items.map((i) => (
            <li key={i.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong>{i.title}</strong>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {i.company_name} · {i.internship_type === "in_house" ? "In-house" : "Out-house"} · {i.total_hours}h
                    {i.academic_year ? ` · ${i.academic_year}` : ""}
                  </div>
                  {i.report_path && (
                    <a href={`/${i.report_path}`} target="_blank" rel="noreferrer">
                      View report
                    </a>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: statusColor(i.status), fontWeight: 800 }}>{i.status}</div>
                  {i.credit_points != null && (
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {i.credit_points} credits
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

