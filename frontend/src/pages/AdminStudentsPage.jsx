import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiAdminStudentCreditsReport, apiAdminUserCreate, apiAdminUserDelete, apiAdminUserUpdate, apiAdminUsers, apiAdminUserStatus } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AdminStudentsPage() {
  const { token, user, loading } = useAuth();
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sortKey, setSortKey] = useState("email");
  const [sortDir, setSortDir] = useState("asc");
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    prn: "",
    roll_no: "",
    tuf_id: "",
    division: "A",
    class_year: "SE",
    department_code: "COMPUTER",
    student_type: "regular",
  });
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token || !user?.roles?.includes("admin")) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiAdminStudentCreditsReport(token);
        const us = await apiAdminUsers(token, "student");
        if (!cancelled) {
          setRows(data.students || []);
          setUsers(us.users || []);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  async function refresh() {
    const data = await apiAdminStudentCreditsReport(token);
    const us = await apiAdminUsers(token, "student");
    setRows(data.students || []);
    setUsers(us.users || []);
  }

  if (!token && !loading) return <Navigate to="/login" replace />;
  if (loading || !user) return <p className="muted layout">Loading…</p>;
  if (!user.roles?.includes("admin")) return <Navigate to="/dashboard" replace />;

  async function createStudent(e) {
    e.preventDefault();
    setBusy(true); setErr(""); setMsg("");
    try {
      await apiAdminUserCreate(token, { ...form, role: "student" });
      setMsg("Student added.");
      setForm({ ...form, email: "", password: "", name: "", prn: "", roll_no: "", tuf_id: "" });
      await refresh();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function setStatus(id, status) {
    setBusy(true); setErr(""); setMsg("");
    try { await apiAdminUserStatus(token, id, { status }); setMsg(`Student ${status}`); await refresh(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function removeUser(id) {
    setBusy(true); setErr(""); setMsg("");
    try { await apiAdminUserDelete(token, id); setMsg("Student removed."); await refresh(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function editStudent(u) {
    const name = window.prompt("Student name", u.name || "");
    if (name === null) return;
    const prn = window.prompt("PRN", u.prn || "");
    if (prn === null) return;
    const roll_no = window.prompt("Roll No", u.roll_no || "");
    if (roll_no === null) return;
    const tuf_id = window.prompt("TUF ID", u.tuf_id || "");
    if (tuf_id === null) return;
    const division = window.prompt("Division (A/B/C/D)", u.division || "A");
    if (division === null) return;

    setBusy(true); setErr(""); setMsg("");
    try {
      await apiAdminUserUpdate(token, u.id, { name, prn, roll_no, tuf_id, division });
      setMsg("Student updated.");
      await refresh();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const sortedUsers = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const key = sortKey;
    const copy = [...users];
    copy.sort((a, b) => {
      const av = a?.[key] ?? "";
      const bv = b?.[key] ?? "";
      if (key === "id") return (Number(av) - Number(bv)) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
    return copy;
  }, [users, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  return (
    <div className="layout">
      <h1>Student Management</h1>
      {err && <p className="error">{err}</p>}
      {msg && <p style={{ color: "var(--success)" }}>{msg}</p>}
      <form className="card" onSubmit={createStudent} style={{ marginBottom: "1rem" }}>
        <h2>Add Student</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "0.5rem" }}>
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="PRN" value={form.prn} onChange={(e) => setForm({ ...form, prn: e.target.value })} />
          <input placeholder="Roll No" value={form.roll_no} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} />
          <input placeholder="TUF ID" value={form.tuf_id} onChange={(e) => setForm({ ...form, tuf_id: e.target.value })} />
          <input placeholder="Division" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} />
          <select value={form.department_code} onChange={(e) => setForm({ ...form, department_code: e.target.value })}>
            <option>COMPUTER</option><option>IT</option><option>MECHANICAL</option><option>CIVIL</option><option>AIDS</option><option>EXTC</option><option>MECHATRONICS</option>
          </select>
          <select value={form.student_type} onChange={(e) => setForm({ ...form, student_type: e.target.value })}>
            <option value="regular">regular</option><option value="lateral">lateral</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: "0.75rem" }}>Add Student</button>
      </form>

      <div className="card" style={{ overflowX: "auto", marginBottom: "1rem" }}>
        <h2>Student Accounts</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "0.5rem", cursor: "pointer" }} onClick={() => toggleSort("email")}>Email</th>
              <th style={{ padding: "0.5rem", cursor: "pointer" }} onClick={() => toggleSort("prn")}>PRN</th>
              <th style={{ padding: "0.5rem", cursor: "pointer" }} onClick={() => toggleSort("division")}>Division</th>
              <th style={{ padding: "0.5rem", cursor: "pointer" }} onClick={() => toggleSort("status")}>Status</th>
              <th style={{ padding: "0.5rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.5rem" }}>{u.email}</td>
                <td style={{ padding: "0.5rem" }}>{u.prn || "-"}</td>
                <td style={{ padding: "0.5rem" }}>{u.division || "-"}</td>
                <td style={{ padding: "0.5rem" }}>{u.status}</td>
                <td style={{ padding: "0.5rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => editStudent(u)}>Edit</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setStatus(u.id, "active")}>Unblock</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setStatus(u.id, "blocked")}>Block</button>
                  <button type="button" className="btn btn-danger" onClick={() => setStatus(u.id, "blacklisted")}>Blacklist</button>
                  <button type="button" className="btn btn-danger" onClick={() => removeUser(u.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
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
            {rows.map((r) => (
              <tr key={r.student_id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.5rem" }}>{r.name} ({r.prn})</td>
                <td style={{ padding: "0.5rem" }}>{r.activity_points}</td>
                <td style={{ padding: "0.5rem" }}>{r.internship_points}</td>
                <td style={{ padding: "0.5rem" }}>{r.grand_total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

