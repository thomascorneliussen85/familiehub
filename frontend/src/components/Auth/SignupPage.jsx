import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import InstallAppPrompt from './InstallAppPrompt';
import './Auth.css';

export default function SignupPage() {
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
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-title">🏠 FamilieHub</div>
        <div className="auth-subtitle">Opprett en konto for familien din</div>
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
        <div className="auth-switch">
          Har dere allerede konto? <Link to="/login">Logg inn</Link>
        </div>
        <InstallAppPrompt />
      </form>
    </div>
  );
}
