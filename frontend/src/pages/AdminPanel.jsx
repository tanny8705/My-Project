import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  apiAdminStudentCreditsReport,
  apiAdminStats,
  apiActivities,
  apiApprove,
  apiReject,
  apiRules,
  apiRulesAdd,
} from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

function statusColor(s) {
  if (s === "approved") return "var(--success)";
  if (s === "rejected") return "var(--danger)";
  return "var(--warning)";
}

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

export default function AdminPanel() {
  const { token, user, loading } = useAuth();

  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [rules, setRules] = useState([]);
  const [report, setReport] = useState([]);

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
    const [s, p, r] = await Promise.all([
      apiAdminStats(token),
      apiActivities(token, "pending"),
      apiRules(),
    ]);
    setStats(s || {});
    setPending(p.activities || []);
    setRules(r.rules || []);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!token || !canAccess) return;
        const [s, p, r] = await Promise.all([
          apiAdminStats(token),
          apiActivities(token, "pending"),
          apiRules(),
        ]);
        if (cancelled) return;
        setStats(s || {});
        setPending(p.activities || []);
        setRules(r.rules || []);
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

  async function approve(id) {
    setMsg("");
    setErr("");
    setBusy(true);
    try {
      await apiApprove(token, id);
      setMsg("Approved and credits calculated using DB rules.");
      await refreshAll();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reject(id) {
    setMsg("");
    setErr("");
    setBusy(true);
    try {
      await apiReject(token, id);
      setMsg("Rejected. Credits not awarded.");
      await refreshAll();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

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
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "student_credits_report.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setMsg("Exported student-wise credits (CSV).");
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
        Approve/reject submissions and keep credit rules in SQLite. Credits are recalculated automatically on approval.
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
        <h2>Review Requests</h2>
        <p className="muted">View submissions and accept/reject. Credits are assigned only after approval.</p>
        {pending.length === 0 ? (
          <p className="muted">No pending requests.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {pending.map((a) => (
              <li key={a.id} className="card" style={{ padding: "0.9rem 1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <strong>{a.title}</strong>
                    <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.15rem" }}>
                      {a.student_name} ({a.prn}) · {a.activity_type} · {a.total_hours}h
                    </div>
                    {a.description && <p style={{ margin: "0.5rem 0 0" }}>{a.description}</p>}
                    {a.proof_path && (
                      <a href={`/${a.proof_path}`} target="_blank" rel="noreferrer">
                        View proof
                      </a>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                    <button type="button" className="btn btn-primary" onClick={() => approve(a.id)} disabled={busy}>
                      Accept (Assign Credits)
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => reject(a.id)} disabled={busy}>
                      Reject
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: "0.5rem" }} className="muted">
                  Status: <span style={{ color: statusColor(a.status), fontWeight: 800 }}>{a.status}</span>
                </div>
              </li>
            ))}
          </ul>
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
        <p className="muted">Student-wise credits report and CSV export.</p>

        <button type="button" className="btn btn-primary" disabled={busy} onClick={exportStudentCredits}>
          Export data
        </button>

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
