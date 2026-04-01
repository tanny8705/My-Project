import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiInternshipApprove, apiInternshipQueue, apiInternshipReject, apiScopedStudentsCsv } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function HodPanel() {
  const { token, user, loading } = useAuth();
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const data = await apiInternshipQueue(token);
    setItems(data.internships || []);
  }

  useEffect(() => {
    if (!token || !user?.roles?.includes("hod")) return;
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
  if (user.roles?.includes("admin")) return <Navigate to="/admin" replace />;
  if (!user.roles?.includes("hod")) return <Navigate to="/" replace />;

  async function approve(id) {
    setErr("");
    setMsg("");
    try {
      await apiInternshipApprove(token, id);
      setMsg("Approved.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function reject(id) {
    setErr("");
    setMsg("");
    try {
      await apiInternshipReject(token, id);
      setMsg("Rejected.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function downloadStudentsCsv() {
    setErr("");
    setMsg("");
    try {
      const blob = await apiScopedStudentsCsv(token);
      saveBlob(blob, "hod_students_report.csv");
      setMsg("Downloaded students report (CSV).");
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="layout">
      <h1>HOD Dashboard</h1>
      <p className="muted">
        Queue: <strong>In-house (pending)</strong> and <strong>Out-house (TPO verified)</strong>.
      </p>
      {err && <p className="error">{err}</p>}
      {msg && <p style={{ color: "var(--success)" }}>{msg}</p>}
      <button type="button" className="btn btn-ghost" onClick={downloadStudentsCsv} style={{ marginBottom: "0.75rem" }}>
        Download students report (CSV)
      </button>

      {items.length === 0 ? (
        <p className="muted">No items in your queue.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {items.map((i) => (
            <li key={i.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong>{i.title}</strong>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {i.student_name} ({i.prn}) · {i.company_name} · {i.internship_type} · {i.total_hours}h · {i.status}
                  </div>
                  {i.report_path && (
                    <a href={`/${i.report_path}`} target="_blank" rel="noreferrer">
                      View report
                    </a>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                  <button type="button" className="btn btn-primary" onClick={() => approve(i.id)}>
                    Approve
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => reject(i.id)}>
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

