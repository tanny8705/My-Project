import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  apiAdminDepartments,
  apiAdminDepartmentAdd,
  apiAdminDepartmentDelete,
  apiAdminDepartmentUpdate,
} from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AdminUsersPage() {
  const { token, user, loading } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [deptForm, setDeptForm] = useState({ code: "", name: "" });

  async function refresh() {
    const deps = await apiAdminDepartments(token);
    setDepartments(deps.departments || []);
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

  async function editDepartment(d) {
    const code = window.prompt("Department code", d.code || "");
    if (code === null) return;
    const name = window.prompt("Department name", d.name || "");
    if (name === null) return;
    try {
      setErr(""); setMsg("");
      await apiAdminDepartmentUpdate(token, d.id, { code, name });
      setMsg("Department updated");
      await refresh();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="layout">
      <h1>Department Management</h1>
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
                  <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-ghost" onClick={() => editDepartment(d)}>Edit</button>
                    <button type="button" className="btn btn-danger" onClick={() => removeDepartment(d.id)}>Remove</button>
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

