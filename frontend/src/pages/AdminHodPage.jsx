import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiAdminUserCreate, apiAdminUserDelete, apiAdminUserUpdate, apiAdminUsers, apiAdminUserStatus } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AdminHodPage() {
  const { token, user, loading } = useAuth();
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ email: "", password: "", name: "", department_code: "COMPUTER", division: "A" });

  useEffect(() => {
    if (!token || !user?.roles?.includes("admin")) return;
    (async () => {
      try {
        const data = await apiAdminUsers(token, "hod");
        setUsers(data.users || []);
      } catch (e) { setErr(e.message); }
    })();
  }, [token, user]);

  const refresh = async () => {
    const data = await apiAdminUsers(token, "hod");
    setUsers(data.users || []);
  };

  const rows = useMemo(() => users.filter((u) => u.roles.includes("hod")), [users]);
  if (!token && !loading) return <Navigate to="/login" replace />;
  if (loading || !user) return <p className="muted layout">Loading…</p>;
  if (!user.roles?.includes("admin")) return <Navigate to="/dashboard" replace />;

  const setStatus = async (id, status) => { try { await apiAdminUserStatus(token, id, { status }); setMsg(`HOD ${status}`); await refresh(); } catch (e) { setErr(e.message); } };
  const removeUser = async (id) => { try { await apiAdminUserDelete(token, id); setMsg("HOD removed"); await refresh(); } catch (e) { setErr(e.message); } };
  const create = async (e) => { e.preventDefault(); try { await apiAdminUserCreate(token, { ...form, role: "hod" }); setMsg("HOD created"); await refresh(); } catch (e2) { setErr(e2.message); } };

  const editHod = async (u) => {
    const name = window.prompt("HOD name", u.name || "");
    if (name === null) return;
    const division = window.prompt("Division (A/B/C/D)", u.division || "A");
    if (division === null) return;
    try {
      await apiAdminUserUpdate(token, u.id, { name, division, designation: "HOD" });
      setMsg("HOD updated");
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  };

  return <div className="layout"><h1>HOD Management</h1>{err && <p className="error">{err}</p>}{msg && <p style={{ color: "var(--success)" }}>{msg}</p>}
    <form className="card" onSubmit={create} style={{ marginBottom: "1rem" }}>
      <h2>Add HOD</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "0.5rem" }}>
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Division (A/B/C/D)" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} required />
        <select value={form.department_code} onChange={(e) => setForm({ ...form, department_code: e.target.value })}>
          <option>COMPUTER</option><option>IT</option><option>MECHANICAL</option><option>CIVIL</option><option>AIDS</option><option>EXTC</option><option>MECHATRONICS</option>
        </select>
      </div><button type="submit" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>Add HOD</button>
    </form>
    <div className="card" style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}><thead><tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}><th style={{ padding: "0.5rem" }}>Email</th><th style={{ padding: "0.5rem" }}>Department</th><th style={{ padding: "0.5rem" }}>Division</th><th style={{ padding: "0.5rem" }}>Status</th><th style={{ padding: "0.5rem" }}>Actions</th></tr></thead><tbody>{rows.map((u) => <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}><td style={{ padding: "0.5rem" }}>{u.email}</td><td style={{ padding: "0.5rem" }}>{u.department || "-"}</td><td style={{ padding: "0.5rem" }}>{u.division || "-"}</td><td style={{ padding: "0.5rem" }}>{u.status}</td><td style={{ padding: "0.5rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}><button type="button" className="btn btn-ghost" onClick={() => editHod(u)}>Edit</button><button type="button" className="btn btn-ghost" onClick={() => setStatus(u.id, "active")}>Unblock</button><button type="button" className="btn btn-ghost" onClick={() => setStatus(u.id, "blocked")}>Block</button><button type="button" className="btn btn-danger" onClick={() => setStatus(u.id, "blacklisted")}>Blacklist</button><button type="button" className="btn btn-danger" onClick={() => removeUser(u.id)}>Remove</button></td></tr>)}</tbody></table></div>
  </div>;
}

