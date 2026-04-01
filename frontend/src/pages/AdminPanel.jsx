import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  apiAdminDepartmentCreditsReport,
  apiAdminActorsCsv,
  apiAdminStudentCreditsReport,
  apiAdminStudentsCsv,
  apiAdminStats,
  apiAdminVerificationsCsv,
  apiRules,
  apiRulesAdd,
} from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

function toCsv(rows) {
  const headers = ["student_id", "name", "prn", "activity_points", "internship_points", "grand_total"];
  const escape = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
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

export default function AdminPanel() {
  const { token, user, loading } = useAuth();

  const [stats, setStats] = useState(null);
  const [rules, setRules] = useState([]);
  const [report, setReport] = useState([]);
  const [departmentReport, setDepartmentReport] = useState([]);

  const [ruleForm, setRuleForm] = useState({
    category: "Technical",
    hours_required: 0,
    credits_awarded: 10,
  });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const canAccess = useMemo(() => !!user?.roles?.includes("admin"), [user]);

  async function refreshAll() {
    if (!token) return;
    setErr("");
    const [s, r, d] = await Promise.all([
      apiAdminStats(token),
      apiRules(),
      apiAdminDepartmentCreditsReport(token),
    ]);
    setStats(s || {});
    setRules(r.rules || []);
    setDepartmentReport(d.departments || []);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!token || !canAccess) return;
        const [s, r, d] = await Promise.all([
          apiAdminStats(token),
          apiRules(),
          apiAdminDepartmentCreditsReport(token),
        ]);
        if (cancelled) return;
        setStats(s || {});
        setRules(r.rules || []);
        setDepartmentReport(d.departments || []);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, canAccess]);

  if (!token && !loading) return <Navigate to="/login" replace />;
  if (loading || !user) return <p className="muted layout">Loading…</p>;
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  async function addRule(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const payload = {
        category: ruleForm.category,
        hours_required: Number(ruleForm.hours_required),
        credits_awarded: Number(ruleForm.credits_awarded),
      };
      await apiRulesAdd(token, payload);
      setMsg("Rule added successfully. Credit engine will use it on next approval.");
      await refreshAll();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportStudentCredits() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const data = await apiAdminStudentCreditsReport(token);
      const rows = data.students || [];
      setReport(rows);

      const csv = toCsv(rows);
      saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "student_credits_report.csv");

      setMsg("Exported student-wise credits (CSV).");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadFullStudentsCsv() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const blob = await apiAdminStudentsCsv(token);
      saveBlob(blob, "students_full_report.csv");
      setMsg("Downloaded full student report (CSV).");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadVerificationAudit() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const blob = await apiAdminVerificationsCsv(token);
      saveBlob(blob, "verification_audit.csv");
      setMsg("Downloaded verification audit (CSV).");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadActorReport(role) {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const blob = await apiAdminActorsCsv(token, role);
      saveBlob(blob, `${role}_report.csv`);
      setMsg(`Downloaded ${role} report (CSV).`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="layout">
      <h1>Admin Dashboard</h1>
      <p className="muted">
        System overview, analytics graph and credit rule management.
      </p>

      {err && <p className="error">{err}</p>}
      {msg && <p style={{ color: "var(--success)" }}>{msg}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Total Students</h2>
          <div style={{ fontSize: "2rem", fontWeight: 900 }}>{stats?.total_students ?? 0}</div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Pending Requests</h2>
          <div style={{ fontSize: "2rem", fontWeight: 900 }}>{stats?.pending_requests ?? 0}</div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Approved Credits</h2>
          <div style={{ fontSize: "2rem", fontWeight: 900 }}>{stats?.approved_credits ?? 0}</div>
        </div>
      </div>

      <div style={{ marginTop: "1rem" }} className="card">
        <h2>Department Credit Graph</h2>
        <p className="muted">Visual summary by department (students + total credits).</p>
        {departmentReport.length === 0 ? (
          <p className="muted">No data yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.55rem" }}>
            {departmentReport.map((d) => {
              const width = Math.min(100, Math.round((d.grand_total / Math.max(1, stats?.approved_credits || 1)) * 100));
              return (
                <div key={d.code}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span>{d.code} ({d.students} students)</span>
                    <span>{d.grand_total.toFixed(1)} credits</span>
                  </div>
                  <div style={{ height: 10, border: "1px solid var(--border)", borderRadius: 999, overflow: "hidden", marginTop: 4 }}>
                    <div style={{ width: `${width}%`, height: "100%", background: "linear-gradient(90deg,var(--accent),#22c55e)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: "1rem" }} className="card">
        <h2>Manage Categories</h2>
        <p className="muted">Add/adjust credit rules (category + minimum hours → credits awarded).</p>

        <div className="card" style={{ background: "#111824", padding: "1rem", marginBottom: "1rem" }}>
          <form onSubmit={addRule}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Category</label>
                <input value={ruleForm.category} onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })} required />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Min hours</label>
                <input
                  type="number"
                  value={ruleForm.hours_required}
                  onChange={(e) => setRuleForm({ ...ruleForm, hours_required: e.target.value })}
                  required
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Credits</label>
                <input
                  type="number"
                  value={ruleForm.credits_awarded}
                  onChange={(e) => setRuleForm({ ...ruleForm, credits_awarded: e.target.value })}
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: "0.85rem" }}>
              Add Category / Rule
            </button>
          </form>
        </div>

        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.5rem" }}>Category</th>
                <th style={{ padding: "0.5rem" }}>Min hours</th>
                <th style={{ padding: "0.5rem" }}>Credits</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem" }}>{r.category}</td>
                  <td style={{ padding: "0.5rem" }}>{r.hours_required}</td>
                  <td style={{ padding: "0.5rem" }}>{r.credits_awarded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: "1rem" }} className="card">
        <h2>Reports</h2>
        <p className="muted">Download CSV reports (students + audit + role reports).</p>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={downloadFullStudentsCsv}>
            Download students (full details)
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={exportStudentCredits}>
            Download student credits (simple)
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={downloadVerificationAudit}>
            Download approvals audit
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => downloadActorReport("faculty")}>
            Download faculty report
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => downloadActorReport("hod")}>
            Download HOD report
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => downloadActorReport("tpo")}>
            Download TPO report
          </button>
        </div>

        {report.length > 0 && (
          <div className="card" style={{ marginTop: "1rem", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "0.5rem" }}>Student</th>
                  <th style={{ padding: "0.5rem" }}>Activity</th>
                  <th style={{ padding: "0.5rem" }}>Internship</th>
                  <th style={{ padding: "0.5rem" }}>Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {report.slice(0, 8).map((r) => (
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
            <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
              Preview shown (CSV contains all rows).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
