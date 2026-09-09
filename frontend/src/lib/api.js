const BASE = '/api';

// Ny innlogget familie som ikke lenger har en gyldig økt (utløpt/tømt
// cookie) skal sendes til /login i stedet for å se kryptiske feilmeldinger
// overalt i appen – satt av AuthContext ved oppstart.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}
export function triggerUnauthorized() {
  onUnauthorized();
}

async function rawRequest(path, options = {}) {
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

async function request(path, options = {}) {
  const mutation = options.method && options.method !== 'GET';
  const notify = detail => window.dispatchEvent(new CustomEvent('hub:save', { detail }));
  if (mutation) notify({ phase: 'start' });
  try {
    const result = await rawRequest(path, options);
    if (mutation) notify({ phase: 'done', undoToken: result?.undoToken,
      label: path.startsWith('/calendar') ? 'Avtale' : path.startsWith('/dinner') ? 'Middag' : path.startsWith('/chores') ? 'Gjøremål' : 'Varer' });
    return result;
  } catch (error) {
    if (mutation) notify({ phase: 'error', error: `Kunne ikke bekrefte lagring: ${error.message}. Kontroller innholdet før du prøver igjen.` });
    throw error;
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
