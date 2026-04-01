import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiActivities, apiApprove, apiReject } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function FacultyPanel() {
  const { token, user, loading } = useAuth();
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    if (!token) return;
    const data = await apiActivities(token, "pending");
    setItems(data.activities || []);
  }

  useEffect(() => {
    if (!token || !user) return;
    const canModerate = user.roles?.includes("faculty") || user.roles?.includes("admin");
    if (!canModerate) return;
    let cancelled = false;
    (async () => {
      try {
        await load();
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
  const canModerate = user.roles?.includes("faculty") || user.roles?.includes("admin");
  if (!canModerate) return <Navigate to="/dashboard" replace />;

  async function approve(id) {
    setMsg("");
    setErr("");
    try {
      await apiApprove(token, id);
      setMsg("Approved and credits calculated from database rules.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function reject(id) {
    setMsg("");
    setErr("");
    try {
      await apiReject(token, id);
      setMsg("Rejected.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="layout">
      <h1>Faculty panel</h1>
      <p className="muted">Review pending activities. Credits apply only after approval.</p>
      {err && <p className="error">{err}</p>}
      {msg && <p style={{ color: "var(--success)" }}>{msg}</p>}
      {items.length === 0 ? (
        <p className="muted">No pending requests.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {items.map((a) => (
            <li key={a.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong>{a.title}</strong>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {a.student_name} ({a.prn}) · {a.activity_type} · {a.total_hours}h
                  </div>
                  {a.description && <p style={{ margin: "0.5rem 0 0" }}>{a.description}</p>}
                  {a.proof_path && (
                    <a href={`/${a.proof_path}`} target="_blank" rel="noreferrer">
                      Open proof
                    </a>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                  <button type="button" className="btn btn-primary" onClick={() => approve(a.id)}>
                    Approve
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => reject(a.id)}>
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
