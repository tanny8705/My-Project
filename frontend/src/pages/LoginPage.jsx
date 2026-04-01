import { useState } from "react";
import { Navigate } from "react-router-dom";
import { apiLogin, apiRegister } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const { token, login, user } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [prn, setPrn] = useState("");
  const [department, setDepartment] = useState("CS");
  const [classYear, setClassYear] = useState("SE");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (token && user) {
    if (user.roles?.includes("admin")) return <Navigate to="/admin" replace />;
    if (user.roles?.includes("faculty")) return <Navigate to="/faculty" replace />;
    if (user.roles?.includes("hod")) return <Navigate to="/hod" replace />;
    if (user.roles?.includes("tpo")) return <Navigate to="/tpo" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        const data = await apiLogin(email, password);
        login(data.access_token);
      } else {
        const data = await apiRegister({
          email,
          password,
          role: "student",
          name,
          prn,
          department,
          class_year: classYear,
        });
        login(data.access_token);
      }
    } catch (err) {
      setError(err.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: "2rem auto" }}>
      <h1>Campus Credit Tracker</h1>
      <p className="muted">Digitize submissions, verification, and credit totals.</p>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          type="button"
          className={`btn ${mode === "login" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setMode("login")}
        >
          Log in
        </button>
        <button
          type="button"
          className={`btn ${mode === "register" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setMode("register")}
        >
          Register (student)
        </button>
      </div>
      <form onSubmit={onSubmit}>
        {error && <p className="error">{error}</p>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        {mode === "register" && (
          <>
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="prn">PRN</label>
              <input id="prn" value={prn} onChange={(e) => setPrn(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="dept">Department</label>
              <input id="dept" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cy">Class</label>
              <select id="cy" value={classYear} onChange={(e) => setClassYear(e.target.value)}>
                <option value="FE">FE</option>
                <option value="SE">SE</option>
                <option value="TE">TE</option>
                <option value="BE">BE</option>
              </select>
            </div>
          </>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: "1.25rem", fontSize: "0.85rem" }}>
        Demo faculty: <code>faculty123@gmail.com</code> / <code>faculty@123</code>
        <br />
        Demo HOD: <code>hod123@gmail.com</code> / <code>hod@123</code>
        <br />
        Demo TPO: <code>tpo123@gmail.com</code> / <code>tpo@123</code>
        <br />
        Demo admin: <code>admin123@gmail.com</code> / <code>admin@123</code>
      </p>
    </div>
  );
}
