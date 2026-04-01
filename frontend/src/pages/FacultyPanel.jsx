import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  apiActivities,
  apiApprove,
  apiFacultyStudentCreditsReport,
  apiInternshipApprove,
  apiInternshipReject,
  apiInternships,
  apiReject,
  apiScopedStudentsCsv,
} from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

function exportCsv(rows) {
  const headers = ["student_id", "name", "prn", "activity_points", "internship_points", "grand_total"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const body = [headers.join(",")]
    .concat(rows.map((r) => headers.map((h) => esc(r[h])).join(",")))
    .join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "department_student_credits.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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

export default function FacultyPanel() {
  const { token, user, loading } = useAuth();
  const [items, setItems] = useState([]);
  const [internships, setInternships] = useState([]);
  const [studentsReport, setStudentsReport] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    if (!token) return;
    const data = await apiActivities(token, "pending");
    setItems(data.activities || []);
    const intern = await apiInternships(token, "pending");
    setInternships(intern.internships || []);
    const rep = await apiFacultyStudentCreditsReport(token);
    setStudentsReport(rep.students || []);
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
  if (user.roles?.includes("hod")) return <Navigate to="/hod" replace />;
  if (user.roles?.includes("tpo")) return <Navigate to="/tpo" replace />;
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

  async function approveInternship(id) {
    setMsg("");
    setErr("");
    try {
      await apiInternshipApprove(token, id);
      setMsg("Internship approved and credits assigned.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function rejectInternship(id) {
    setMsg("");
    setErr("");
    try {
      await apiInternshipReject(token, id);
      setMsg("Internship rejected.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function downloadScopedStudentReport() {
    setMsg("");
    setErr("");
    try {
      const blob = await apiScopedStudentsCsv(token);
      saveBlob(blob, "students_scoped_report.csv");
      setMsg("Downloaded student report (CSV).");
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

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>Pending internships</h2>
        <p className="muted">In-house requires HOD; out-house requires TPO.</p>
        {internships.length === 0 ? (
          <p className="muted">No pending internships.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {internships.map((i) => (
              <li key={i.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <strong>{i.title}</strong>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {i.student_name} ({i.prn}) · {i.company_name} · {i.internship_type} · {i.total_hours}h
                    </div>
                    {i.report_path && (
                      <a href={`/${i.report_path}`} target="_blank" rel="noreferrer">
                        Open report
                      </a>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                    <button type="button" className="btn btn-primary" onClick={() => approveInternship(i.id)}>
                      Approve
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => rejectInternship(i.id)}>
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>Department Student Credits</h2>
        <p className="muted">All registered students in your branch are listed, even with zero points.</p>
        {studentsReport.length > 0 && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <button type="button" className="btn btn-ghost" onClick={downloadScopedStudentReport}>
              Download student report (CSV)
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => exportCsv(studentsReport)}>
              Download credits only (CSV)
            </button>
          </div>
        )}
        {studentsReport.length === 0 ? (
          <p className="muted">No students found in your department.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "0.5rem" }}>Student</th>
                  <th style={{ padding: "0.5rem" }}>Activity</th>
                  <th style={{ padding: "0.5rem" }}>Internship</th>
                  <th style={{ padding: "0.5rem" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {studentsReport.map((r) => (
                  <tr key={r.student_id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.5rem" }}>
                      {r.name} ({r.prn})
                    </td>
                    <td style={{ padding: "0.5rem" }}>{r.activity_points}</td>
                    <td style={{ padding: "0.5rem" }}>{r.internship_points}</td>
                    <td style={{ padding: "0.5rem" }}>{r.grand_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
