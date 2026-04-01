import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  apiAdminDepartments,
  apiAdminDepartmentAdd,
  apiAdminDepartmentDelete,
  apiAdminUserCreate,
  apiAdminUserDelete,
  apiAdminUsers,
  apiAdminUserStatus,
} from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AdminUsersPage() {
  const { token, user, loading } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [deptForm, setDeptForm] = useState({ code: "", name: "" });
  const [userForm, setUserForm] = useState({
    email: "",
    password: "",
    role: "faculty",
    department_code: "COMPUTER",
    name: "",
    prn: "",
    class_year: "SE",
  });

  async function refresh() {
    const [deps, us] = await Promise.all([apiAdminDepartments(token), apiAdminUsers(token)]);
    setDepartments(deps.departments || []);
    setUsers(us.users || []);
  }

  useEffect(() => {
    if (!token || !user?.roles?.includes("admin")) return;
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const visibleDeptOptions = useMemo(() => departments.map((d) => d.code), [departments]);

  if (!token && !loading) return <Navigate to="/login" replace />;
  if (loading || !user) return <p className="muted layout">Loading…</p>;
  if (!user.roles?.includes("admin")) return <Navigate to="/dashboard" replace />;

  async function addDepartment(e) {
    e.preventDefault();
    try {
      setErr(""); setMsg("");
      await apiAdminDepartmentAdd(token, deptForm);
      setDeptForm({ code: "", name: "" });
      setMsg("Department added");
      await refresh();
    } catch (e2) { setErr(e2.message); }
  }

  async function removeDepartment(id) {
    try {
      setErr(""); setMsg("");
      await apiAdminDepartmentDelete(token, id);
      setMsg("Department removed");
      await refresh();
    } catch (e2) { setErr(e2.message); }
  }

  async function createUser(e) {
    e.preventDefault();
    try {
      setErr(""); setMsg("");
      await apiAdminUserCreate(token, userForm);
      setMsg("User created");
      setUserForm({ ...userForm, email: "", password: "", name: "", prn: "" });
      await refresh();
    } catch (e2) { setErr(e2.message); }
  }

  async function setStatus(id, status) {
    try {
      setErr(""); setMsg("");
      await apiAdminUserStatus(token, id, { status });
      setMsg(`Status updated to ${status}`);
      await refresh();
    } catch (e2) { setErr(e2.message); }
  }

  async function removeUser(id) {
    try {
      setErr(""); setMsg("");
      await apiAdminUserDelete(token, id);
      setMsg("User removed");
      await refresh();
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <div className="layout">
      <h1>User & Department Management</h1>
      {err && <p className="error">{err}</p>}
      {msg && <p style={{ color: "var(--success)" }}>{msg}</p>}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>Departments</h2>
        <form onSubmit={addDepartment} style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <input placeholder="Code" value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })} required />
          <input placeholder="Department name" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} required />
          <button type="submit" className="btn btn-primary">Add</button>
        </form>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead><tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}><th style={{ padding: "0.5rem" }}>Code</th><th style={{ padding: "0.5rem" }}>Name</th><th style={{ padding: "0.5rem" }}>Action</th></tr></thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem" }}>{d.code}</td>
                  <td style={{ padding: "0.5rem" }}>{d.name}</td>
                  <td style={{ padding: "0.5rem" }}><button type="button" className="btn btn-danger" onClick={() => removeDepartment(d.id)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Create / Manage Users</h2>
        <form onSubmit={createUser} className="card" style={{ background: "#111824", marginBottom: "0.75rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: "0.5rem" }}>
            <input placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} required />
            <input placeholder="Password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} required />
            <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
              <option value="student">student</option><option value="faculty">faculty</option><option value="hod">hod</option><option value="tpo">tpo</option>
            </select>
            <select value={userForm.department_code} onChange={(e) => setUserForm({ ...userForm, department_code: e.target.value })}>
              {visibleDeptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input placeholder="Name" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
            {userForm.role === "student" && <input placeholder="PRN" value={userForm.prn} onChange={(e) => setUserForm({ ...userForm, prn: e.target.value })} />}
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>Create User</button>
        </form>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead><tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}><th style={{ padding: "0.5rem" }}>Email</th><th style={{ padding: "0.5rem" }}>Role</th><th style={{ padding: "0.5rem" }}>Department</th><th style={{ padding: "0.5rem" }}>Status</th><th style={{ padding: "0.5rem" }}>Actions</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem" }}>{u.email}</td>
                  <td style={{ padding: "0.5rem" }}>{u.roles.join(", ")}</td>
                  <td style={{ padding: "0.5rem" }}>{u.department || "-"}</td>
                  <td style={{ padding: "0.5rem" }}>{u.status}</td>
                  <td style={{ padding: "0.5rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
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
      </div>
    </div>
  );
}

