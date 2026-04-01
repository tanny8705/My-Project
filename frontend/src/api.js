const API_BASE = "";

function authHeaders(token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function apiRegister(body) {
  const r = await fetch(`${API_BASE}/api/register`, {
    method: "POST",
    headers: authHeaders(null),
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiLogin(email, password) {
  const r = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: authHeaders(null),
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiMe(token) {
  const r = await fetch(`${API_BASE}/api/me`, { headers: authHeaders(token) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiCreditsTotal(token) {
  const r = await fetch(`${API_BASE}/api/credits/total`, { headers: authHeaders(token) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiCreditsBreakdown(token) {
  const r = await fetch(`${API_BASE}/api/credits/breakdown`, { headers: authHeaders(token) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiActivities(token, status) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const r = await fetch(`${API_BASE}/api/activity/all${q}`, { headers: authHeaders(token) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiActivityAdd(token, formData) {
  const r = await fetch(`${API_BASE}/api/activity/add`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiApprove(token, id) {
  const r = await fetch(`${API_BASE}/api/activity/approve/${id}`, {
    method: "POST",
    headers: authHeaders(token),
    body: "{}",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiReject(token, id) {
  const r = await fetch(`${API_BASE}/api/activity/reject/${id}`, {
    method: "POST",
    headers: authHeaders(token),
    body: "{}",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiRules() {
  const r = await fetch(`${API_BASE}/api/rules`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiRulesAdd(token, payload) {
  const r = await fetch(`${API_BASE}/api/rules`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiAdminStats(token) {
  const r = await fetch(`${API_BASE}/api/admin/stats`, {
    headers: authHeaders(token),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiAdminStudentCreditsReport(token) {
  const r = await fetch(`${API_BASE}/api/admin/reports/student-credits`, {
    headers: authHeaders(token),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}
