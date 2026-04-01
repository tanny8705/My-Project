import { useEffect, useMemo, useState } from "react";
import { apiActivityAdd, apiRules } from "../api.js";

const TYPES = [
  "Internship",
  "Technical",
  "Cultural",
  "NSS",
  "Sports",
  "Certification",
];

export default function ActivityForm({ token, onSuccess }) {
  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState("Technical");
  const [description, setDescription] = useState("");
  const [role, setRole] = useState("Participated");
  const [contactHours, setContactHours] = useState(0);
  const [additionalHours, setAdditionalHours] = useState(0);
  const [totalHours, setTotalHours] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRules();
        if (!cancelled) setRules(data.rules || []);
      } catch {
        // Preview is optional; submission can still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveHours = useMemo(() => {
    if (totalHours === "") return Number(contactHours) + Number(additionalHours);
    const n = Number(totalHours);
    return Number.isFinite(n) ? n : 0;
  }, [totalHours, contactHours, additionalHours]);

  const creditsPreview = useMemo(() => {
    const cat = activityType;
    const matched = rules.filter((r) => r.category === cat);
    if (matched.length === 0) return 0;
    const sorted = [...matched].sort((a, b) => (b.hours_required || 0) - (a.hours_required || 0));
    for (const r of sorted) {
      const minH = Number(r.hours_required || 0);
      if (effectiveHours >= minH) return Number(r.credits_awarded || 0);
    }
    return 0;
  }, [rules, activityType, effectiveHours]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("activity_type", activityType);
      fd.append("description", description);
      fd.append("role", role);
      fd.append("contact_hours", String(contactHours));
      fd.append("additional_hours", String(additionalHours));
      const th =
        totalHours === "" ? String(Number(contactHours) + Number(additionalHours)) : totalHours;
      fd.append("total_hours", th);
      if (file) fd.append("proof", file);
      await apiActivityAdd(token, fd);
      setTitle("");
      setDescription("");
      setFile(null);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Submit activity</h2>
      {error && <p className="error">{error}</p>}

      <div className="card" style={{ background: "#111824", marginBottom: "1rem" }}>
        <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>
          Credits Claimed (preview)
        </div>
        <div style={{ fontSize: "1.35rem", fontWeight: 800 }}>{creditsPreview} pts</div>
        <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
          System calculates final credits after faculty approval using DB rules.
        </div>
      </div>

      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Industry internship — Acme Corp"
        />
      </div>
      <div className="field">
        <label htmlFor="activity_type">Category</label>
        <select
          id="activity_type"
          value={activityType}
          onChange={(e) => setActivityType(e.target.value)}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What you did, dates, outcomes…"
        />
      </div>
      <div className="field">
        <label htmlFor="role">Your role</label>
        <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option>Participated</option>
          <option>Organized</option>
          <option>Volunteered</option>
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div className="field">
          <label htmlFor="ch">Contact hours</label>
          <input
            id="ch"
            type="number"
            min={0}
            value={contactHours}
            onChange={(e) => setContactHours(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="ah">Additional hours</label>
          <input
            id="ah"
            type="number"
            min={0}
            value={additionalHours}
            onChange={(e) => setAdditionalHours(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="th">Total hours (optional override)</label>
        <input
          id="th"
          type="number"
          min={0}
          value={totalHours}
          onChange={(e) => setTotalHours(e.target.value)}
          placeholder="Leave blank to use contact + additional"
        />
      </div>
      <div className="field">
        <label htmlFor="proof">Proof (PDF or image)</label>
        <input id="proof" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Submitting…" : "Submit for verification"}
      </button>
    </form>
  );
}
