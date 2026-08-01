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

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
    delete: (path) => request(path, { method: 'DELETE' }),
  };
}
