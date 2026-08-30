import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

const AnsattContext = createContext(null);

const STORAGE_KEY = 'butikkhub-aktiv-ansatt-id';

// Nettbrettet er delt av alle ~10 ansatte, ingen egen innlogging per person
// (samme prinsipp som familiemedlemmer i FamilieHub). "Aktiv ansatt" er bare
// hvem som er valgt akkurat nå, til å merke hvem som fullførte en oppgave,
// logget en temperatur, eller meldte fra om en tom vare – ikke autentisering.
export function AnsattProvider({ children }) {
  const [ansatte, setAnsatte] = useState([]);
  const [aktivId, setAktivId] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });

  function load() {
    api.get('/ansatte').then(setAnsatte).catch(() => {});
  }

  useEffect(load, []);

  function velgAnsatt(id) {
    setAktivId(id);
    if (id) localStorage.setItem(STORAGE_KEY, String(id));
    else localStorage.removeItem(STORAGE_KEY);
  }

  const aktiv = ansatte.find((a) => a.id === aktivId) || null;

  return (
    <AnsattContext.Provider value={{ ansatte, aktiv, aktivId, velgAnsatt, reloadAnsatte: load }}>
      {children}
    </AnsattContext.Provider>
  );
}

export function useAnsatt() {
  return useContext(AnsattContext);
}
