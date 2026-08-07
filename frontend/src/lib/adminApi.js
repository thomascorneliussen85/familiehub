const BASE = '/api';

export function createAdminApi(pin) {
  async function request(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', 'X-Parent-Pin': pin },
      ...options,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).error;
      } catch {
        // ignorer parse-feil
      }
      throw new Error(detail || `Forespørsel feilet (${res.status})`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // For multipart/skjema-opplasting (f.eks. bilder) – ingen JSON.stringify,
  // og ingen Content-Type-header (nettleseren setter riktig multipart-grense selv).
  async function requestForm(path, method, formData) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'X-Parent-Pin': pin },
      body: formData,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).error;
      } catch {
        // ignorer parse-feil
      }
      throw new Error(detail || `Forespørsel feilet (${res.status})`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
    delete: (path) => request(path, { method: 'DELETE' }),
    postForm: (path, formData) => requestForm(path, 'POST', formData),
    patchForm: (path, formData) => requestForm(path, 'PATCH', formData),
  };
}
