const BASE = '/api';

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    onUnauthorized();
    throw new Error('Ikke innlogget');
  }
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

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

// Handlinger som krever butikksjef-PIN sender den som header – egen
// hjelpefunksjon i stedet for en egen "adminApi"-instans, siden PIN-en her
// bare trengs på noen få kall, ikke et helt sett med ruter slik FamilieHub
// sitt Innstillinger-panel gjør.
export function withPin(pin) {
  return {
    post: (path, body) => request(path, { method: 'POST', headers: { 'X-Butikksjef-Pin': pin }, body: JSON.stringify(body ?? {}) }),
    patch: (path, body) => request(path, { method: 'PATCH', headers: { 'X-Butikksjef-Pin': pin }, body: JSON.stringify(body ?? {}) }),
    delete: (path) => request(path, { method: 'DELETE', headers: { 'X-Butikksjef-Pin': pin } }),
  };
}
