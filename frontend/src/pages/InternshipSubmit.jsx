import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiInternshipAdd } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function InternshipSubmit() {
  const { token, user, loading } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState("in_house");
  const [hours, setHours] = useState(120);
  const [days, setDays] = useState("");
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (!token && !loading) return <Navigate to="/login" replace />;
  if (loading || !user) return <p className="muted layout">Loading…</p>;
  if (user.roles?.includes("admin")) return <Navigate to="/admin" replace />;
  if (user.roles?.includes("faculty")) return <Navigate to="/faculty" replace />;
  if (!user.roles?.includes("student")) return <Navigate to="/dashboard" replace />;

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("company_name", company);
      fd.append("internship_type", type);
      fd.append("total_hours", String(hours));
      if (days !== "") fd.append("duration_days", String(days));
      if (academicYear) fd.append("academic_year", String(academicYear));
      if (report) fd.append("report", report);
      await apiInternshipAdd(token, fd);
      navigate("/internships");
    } catch (e2) {
      setErr(e2.message || "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="layout">
      <h1>Submit Internship</h1>
      <p className="muted">
        In-house internships are verified by <strong>HOD</strong>; out-house internships are verified by <strong>TPO</strong>.
        Credits: <strong>45 hours = 1 credit</strong> (floor).
      </p>
      <form className="card" onSubmit={submit}>
        {err && <p className="error">{err}</p>}
        <div className="field">
          <label>Internship Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. AI Internship" />
        </div>
        <div className="field">
          <label>Company / College</label>
          <input value={company} onChange={(e) => setCompany(e.target.value)} required placeholder="e.g. Acme Corp / College Lab" />
        </div>
        <div className="field">
          <label>Internship Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="in_house">In-house</option>
            <option value="out_house">Out-house</option>
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
          <div className="field">
            <label>Total Hours</label>
            <input type="number" min={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} required />
          </div>
          <div className="field">
            <label>Duration (days)</label>
            <input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} placeholder="optional" />
          </div>
          <div className="field">
            <label>Academic Year</label>
            <input type="number" min={2000} value={academicYear} onChange={(e) => setAcademicYear(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label>Report Upload (PDF/Image)</label>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setReport(e.target.files?.[0] || null)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Submitting…" : "Submit for verification"}
        </button>
      </form>
    </div>
  );
}

