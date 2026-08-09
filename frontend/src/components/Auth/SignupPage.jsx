import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import InstallAppPrompt from './InstallAppPrompt';
import './Auth.css';

function CreateFamilyForm() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [familyName, setFamilyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passordene er ikke like');
      return;
    }
    setBusy(true);
    try {
      await signup(familyName.trim(), email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Familienavn (f.eks. «Familien Hansen»)"
        value={familyName}
        onChange={(e) => setFamilyName(e.target.value)}
        required
        autoFocus
      />
      <input
        type="email"
        placeholder="E-post"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
        required
      />
      <input
        type="password"
        placeholder="Passord (minst 8 tegn)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        required
      />
      <input
        type="password"
        placeholder="Gjenta passord"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        required
      />
      {error && <div className="auth-error">{error}</div>}
      <button className="btn btn-accent auth-submit" type="submit" disabled={busy}>
        {busy ? 'Oppretter…' : 'Opprett konto'}
      </button>
    </form>
  );
}

function JoinFamilyForm() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (selectedFamily || query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      api
        .get(`/auth/family-search?q=${encodeURIComponent(query.trim())}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, selectedFamily]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!selectedFamily) {
      setError('Velg familien dere skal bli med i');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passordene er ikke like');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/join-request', {
        familyId: selectedFamily.id,
        email: email.trim(),
        password,
      });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-join-sent">
        ✓ Forespørselen er sendt til {selectedFamily.name}. Dere kan logge inn så snart noen i
        familien har godkjent den.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {!selectedFamily ? (
        <>
          <input
            type="text"
            placeholder="Søk etter familienavn…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {searching && <div className="auth-hint">Søker…</div>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <div className="auth-hint">Fant ingen familier med det navnet.</div>
          )}
          {results.length > 0 && (
            <div className="auth-family-results">
              {results.map((f) => (
                <button
                  type="button"
                  key={f.id}
                  className="auth-family-result"
                  onClick={() => setSelectedFamily(f)}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="auth-selected-family">
            Blir med i <strong>{selectedFamily.name}</strong>{' '}
            <button type="button" className="auth-family-change" onClick={() => setSelectedFamily(null)}>
              (bytt)
            </button>
          </div>
          <input
            type="email"
            placeholder="Din e-post"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="Passord (minst 8 tegn)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder="Gjenta passord"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-accent auth-submit" type="submit" disabled={busy}>
            {busy ? 'Sender…' : 'Send forespørsel'}
          </button>
        </>
      )}
      {error && !selectedFamily && <div className="auth-error">{error}</div>}
    </form>
  );
}

export default function SignupPage() {
  const [mode, setMode] = useState('create');

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-title">🏠 FamilieHub</div>
        <div className="auth-subtitle">
          {mode === 'create' ? 'Opprett en konto for familien din' : 'Bli med i en familie som finnes fra før'}
        </div>
        <div className="auth-mode-toggle">
          <button
            type="button"
            className={mode === 'create' ? 'auth-mode-active' : ''}
            onClick={() => setMode('create')}
          >
            Opprett ny familie
          </button>
          <button
            type="button"
            className={mode === 'join' ? 'auth-mode-active' : ''}
            onClick={() => setMode('join')}
          >
            Bli med i en familie
          </button>
        </div>
        {mode === 'create' ? <CreateFamilyForm /> : <JoinFamilyForm />}
        <div className="auth-switch">
          Har dere allerede konto? <Link to="/login">Logg inn</Link>
        </div>
        <InstallAppPrompt />
      </div>
    </div>
  );
}
