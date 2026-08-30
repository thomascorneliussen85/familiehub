import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function SignupPage() {
  const { signup } = useAuth();
  const [butikknavn, setButikknavn] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signup(butikknavn, email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-box panel" onSubmit={handleSubmit}>
        <h1>🏪 Opprett ButikkHub</h1>
        <input placeholder="Butikknavn" value={butikknavn} onChange={(e) => setButikknavn(e.target.value)} autoFocus />
        <input type="email" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          placeholder="Passord (minst 8 tegn)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn btn-accent" type="submit" disabled={busy}>
          {busy ? 'Oppretter…' : 'Opprett konto'}
        </button>
        {error && <div className="error-text">{error}</div>}
        <div className="auth-switch">
          Har dere allerede en konto? <Link to="/login">Logg inn</Link>
        </div>
      </form>
    </div>
  );
}
