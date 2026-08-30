import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-box panel" onSubmit={handleSubmit}>
        <h1>🏪 ButikkHub</h1>
        <input type="email" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <input type="password" placeholder="Passord" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn btn-accent" type="submit" disabled={busy}>
          {busy ? 'Logger inn…' : 'Logg inn'}
        </button>
        {error && <div className="error-text">{error}</div>}
        <div className="auth-switch">
          Ny butikk? <Link to="/signup">Opprett konto</Link>
        </div>
      </form>
    </div>
  );
}
