import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from '../lib/api';
import { socket } from '../lib/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { email, familyName } | null
  const [loading, setLoading] = useState(true);
  const checkedOnce = useRef(false);

  useEffect(() => {
    // Unngår at App.jsx sitt eget 401-håndteringsforsøk (via api.js) og denne
    // oppstartssjekken kolliderer om begge kjører samtidig.
    if (checkedOnce.current) return;
    checkedOnce.current = true;
    api
      .get('/auth/me')
      .then((data) => {
        setUser(data);
        socket.connect();
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      socket.disconnect();
      setUser(null);
    });
    return () => setUnauthorizedHandler(() => {});
  }, []);

  async function login(email, password) {
    const data = await api.post('/auth/login', { email, password });
    setUser(data);
    socket.connect();
    return data;
  }

  async function signup(familyName, email, password) {
    const data = await api.post('/auth/signup', { familyName, email, password });
    setUser(data);
    socket.connect();
    return data;
  }

  async function logout() {
    await api.post('/auth/logout').catch(() => {});
    socket.disconnect();
    setUser(null);
  }

  // Henter /auth/me på nytt – brukes etter ting som endrer familienavnet, så
  // resten av appen (header, innstillinger) viser det nye navnet med en gang
  // uten at brukeren må logge ut og inn igjen.
  async function refreshUser() {
    const data = await api.get('/auth/me').catch(() => null);
    if (data) setUser(data);
    return data;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
