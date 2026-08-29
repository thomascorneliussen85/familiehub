import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import HubList from './pages/HubList';
import HubDetail from './pages/HubDetail';
import Rollout from './pages/Rollout';
import './App.css';

function Shell({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-title">🚀 FamilieHub Fleet</div>
        <nav className="shell-nav">
          <Link className={location.pathname === '/' ? 'active' : ''} to="/">
            Hubber
          </Link>
          <Link className={location.pathname.startsWith('/rollout') ? 'active' : ''} to="/rollout">
            Utrulling
          </Link>
        </nav>
        <div className="shell-user">
          <span>{user?.username}</span>
          <button className="btn" onClick={logout}>
            Logg ut
          </button>
        </div>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

function Routed() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <HubList />
          </Protected>
        }
      />
      <Route
        path="/hub/:hubId"
        element={
          <Protected>
            <HubDetail />
          </Protected>
        }
      />
      <Route
        path="/rollout"
        element={
          <Protected>
            <Rollout />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routed />
      </AuthProvider>
    </BrowserRouter>
  );
}
