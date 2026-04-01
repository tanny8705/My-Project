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

export async function apiAdminDepartmentCreditsReport(token) {
  const r = await fetch(`${API_BASE}/api/admin/reports/department-credits`, {
    headers: authHeaders(token),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiAdminDepartments(token) {
  const r = await fetch(`${API_BASE}/api/admin/departments`, { headers: authHeaders(token) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiAdminDepartmentAdd(token, payload) {
  const r = await fetch(`${API_BASE}/api/admin/departments`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiAdminDepartmentDelete(token, id) {
  const r = await fetch(`${API_BASE}/api/admin/departments/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiAdminUsers(token, role) {
  const q = role ? `?role=${encodeURIComponent(role)}` : "";
  const r = await fetch(`${API_BASE}/api/admin/users${q}`, { headers: authHeaders(token) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiAdminUserCreate(token, payload) {
  const r = await fetch(`${API_BASE}/api/admin/users`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiAdminUserStatus(token, id, payload) {
  const r = await fetch(`${API_BASE}/api/admin/users/${id}/status`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiAdminUserDelete(token, id) {
  const r = await fetch(`${API_BASE}/api/admin/users/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiYearlyProgress(token) {
  const r = await fetch(`${API_BASE}/api/progress/yearly`, {
    headers: authHeaders(token),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiEligibility(token) {
  const r = await fetch(`${API_BASE}/api/eligibility`, { headers: authHeaders(token) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiInternshipAdd(token, formData) {
  const r = await fetch(`${API_BASE}/api/internship/add`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiInternships(token, status) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const r = await fetch(`${API_BASE}/api/internship/all${q}`, { headers: authHeaders(token) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiInternshipQueue(token) {
  const r = await fetch(`${API_BASE}/api/internship/queue`, { headers: authHeaders(token) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiInternshipApprove(token, id) {
  const r = await fetch(`${API_BASE}/api/internship/approve/${id}`, {
    method: "POST",
    headers: authHeaders(token),
    body: "{}",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiInternshipReject(token, id) {
  const r = await fetch(`${API_BASE}/api/internship/reject/${id}`, {
    method: "POST",
    headers: authHeaders(token),
    body: "{}",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

export async function apiFacultyStudentCreditsReport(token) {
  const r = await fetch(`${API_BASE}/api/faculty/reports/student-credits`, {
    headers: authHeaders(token),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}
