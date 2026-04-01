import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiActivities } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

function statusColor(s) {
  if (s === "approved") return "var(--success)";
  if (s === "rejected") return "var(--danger)";
  return "var(--warning)";
}

export default function ActivityHistory() {
  const { token, user, loading } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState("pending"); // pending / approved / rejected
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token || !user?.roles?.includes("student")) return;
    let cancelled = false;

    (async () => {
      try {
        const [p, a, r] = await Promise.all([
          apiActivities(token, "pending"),
          apiActivities(token, "approved"),
          apiActivities(token, "rejected"),
        ]);
        if (cancelled) return;
        setCounts({
          pending: p.activities?.length ?? 0,
          approved: a.activities?.length ?? 0,
          rejected: r.activities?.length ?? 0,
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
        const data = await apiActivities(token, tab);
        if (!cancelled) setItems(data.activities || []);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, tab, user]);

  const tabs = useMemo(
    () => [
      { id: "pending", label: "Pending" },
      { id: "approved", label: "Approved" },
      { id: "rejected", label: "Rejected" },
    ],
    []
  );

  if (!token && !loading) return <Navigate to="/login" replace />;
  if (loading || !user) return <p className="muted layout">Loading…</p>;
  if (user.roles?.includes("admin")) return <Navigate to="/admin" replace />;
  if (user.roles?.includes("faculty")) return <Navigate to="/faculty" replace />;
  if (!user.roles?.includes("student")) {
    navigate("/dashboard");
    return null;
  }

  return (
    <div className="layout">
      <h1>My Submissions</h1>
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
        <p className="muted">No submissions in this status yet.</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {items.map((a) => (
            <li key={a.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong>{a.title}</strong>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {a.activity_type} · {a.total_hours}h ·{" "}
                    {a.created_at ? new Date(a.created_at).toLocaleString() : "—"}
                  </div>
                  {a.description && <p style={{ margin: "0.5rem 0 0" }}>{a.description}</p>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: statusColor(a.status), fontWeight: 700 }}>{a.status}</div>
                  {a.points_earned != null && (
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {a.points_earned} pts
                    </div>
                  )}
                  {a.proof_path && (
                    <a href={`/${a.proof_path}`} target="_blank" rel="noreferrer">
                      View proof
                    </a>
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
