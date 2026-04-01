import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiCreditsTotal, apiMe } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import ProgressBar from "../components/ProgressBar.jsx";

export default function Profile() {
  const { token, user, loading } = useAuth();
  const [me, setMe] = useState(null);
  const [credits, setCredits] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token || !user?.roles?.includes("student")) return;
    let cancelled = false;
    (async () => {
      try {
        const [m, c] = await Promise.all([apiMe(token), apiCreditsTotal(token)]);
        if (!cancelled) {
          setMe(m);
          setCredits(c);
        }
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
  if (user.roles?.includes("faculty")) return <Navigate to="/faculty" replace />;
  if (!user.roles?.includes("student")) return <Navigate to="/dashboard" replace />;

  const student = me?.student;
  const total = credits?.grand_total ?? 0;
  const target = credits?.target ?? 200;

  return (
    <div className="layout">
      <h1>Profile</h1>
      {err && <p className="error">{err}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Student details</h2>
          <div className="muted" style={{ marginBottom: "0.65rem" }}>
            {student?.department ? `Department: ${student.department}` : "Department not set"}
          </div>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{student?.name || "—"}</div>
          <div className="muted">PRN: {student?.prn || "—"}</div>
          <div className="muted">Roll No: {student?.roll_no || "—"}</div>
          <div className="muted">TUF ID: {student?.tuf_id || "—"}</div>
          <div className="muted">Division: {student?.division || "—"}</div>
          <div className="muted">Type: {student?.student_type || "regular"}</div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Total Credits</h2>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
            <div style={{ fontSize: "2rem", fontWeight: 800 }}>{total}</div>
            <div className="muted" style={{ fontWeight: 600 }}>
              Target: {target}
            </div>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <ProgressBar current={total} target={target} label="Progress toward graduation requirement" />
          </div>
        </div>
      </div>
    </div>
  );
}

