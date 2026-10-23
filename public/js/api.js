export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details || {}; }
}

async function request(method, url, body, isForm = false) {
  const headers = { 'X-Requested-With': 'calibra' };
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch('/api' + url, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet e tente novamente.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('calibra:unauth'));
    throw new ApiError(res.status, data?.error || 'Algo deu errado. Tente novamente.', data?.details);
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b || {}),
  put: (u, b) => request('PUT', u, b),
  del: (u, b) => request('DELETE', u, b || undefined),
  upload: (u, formData) => request('POST', u, formData, true),
};

export const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
