import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiAdminUserCreate, apiAdminUserDelete, apiAdminUserUpdate, apiAdminUsers, apiAdminUserStatus } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AdminTpoPage() {
  const { token, user, loading } = useAuth();
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ email: "", password: "", name: "" });

  useEffect(() => {
    if (!token || !user?.roles?.includes("admin")) return;
    (async () => {
      try {
        const data = await apiAdminUsers(token, "tpo");
        setUsers(data.users || []);
      } catch (e) { setErr(e.message); }
    })();
  }, [token, user]);

  const refresh = async () => {
    const data = await apiAdminUsers(token, "tpo");
    setUsers(data.users || []);
  };

  const rows = useMemo(() => users.filter((u) => u.roles.includes("tpo")), [users]);
  if (!token && !loading) return <Navigate to="/login" replace />;
  if (loading || !user) return <p className="muted layout">Loading…</p>;
  if (!user.roles?.includes("admin")) return <Navigate to="/dashboard" replace />;

  const setStatus = async (id, status) => { try { await apiAdminUserStatus(token, id, { status }); setMsg(`TPO ${status}`); await refresh(); } catch (e) { setErr(e.message); } };
  const removeUser = async (id) => { try { await apiAdminUserDelete(token, id); setMsg("TPO removed"); await refresh(); } catch (e) { setErr(e.message); } };
  const create = async (e) => { e.preventDefault(); try { await apiAdminUserCreate(token, { ...form, role: "tpo" }); setMsg("TPO created"); await refresh(); } catch (e2) { setErr(e2.message); } };

  const editTpo = async (u) => {
    const name = window.prompt("TPO name", u.name || "");
    if (name === null) return;
    try {
      await apiAdminUserUpdate(token, u.id, { name, designation: "TPO" });
      setMsg("TPO updated");
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  };

  return <div className="layout"><h1>TPO Management</h1>{err && <p className="error">{err}</p>}{msg && <p style={{ color: "var(--success)" }}>{msg}</p>}
    <form className="card" onSubmit={create} style={{ marginBottom: "1rem" }}>
      <h2>Add TPO</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "0.5rem" }}>
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div><button type="submit" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>Add TPO</button>
    </form>
    <div className="card" style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}><thead><tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}><th style={{ padding: "0.5rem" }}>Email</th><th style={{ padding: "0.5rem" }}>Status</th><th style={{ padding: "0.5rem" }}>Actions</th></tr></thead><tbody>{rows.map((u) => <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}><td style={{ padding: "0.5rem" }}>{u.email}</td><td style={{ padding: "0.5rem" }}>{u.status}</td><td style={{ padding: "0.5rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}><button type="button" className="btn btn-ghost" onClick={() => editTpo(u)}>Edit</button><button type="button" className="btn btn-ghost" onClick={() => setStatus(u.id, "active")}>Unblock</button><button type="button" className="btn btn-ghost" onClick={() => setStatus(u.id, "blocked")}>Block</button><button type="button" className="btn btn-danger" onClick={() => setStatus(u.id, "blacklisted")}>Blacklist</button><button type="button" className="btn btn-danger" onClick={() => removeUser(u.id)}>Remove</button></td></tr>)}</tbody></table></div>
  </div>;
}

