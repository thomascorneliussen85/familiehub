import { useAuth } from '../../context/AuthContext';
import { useFamilyMembers } from '../../context/FamilyMembersContext';
import { usePanelNavigation } from '../../context/PanelNavigationContext';
import './Sidebar.css';

const NAV_ITEMS = [
  { key: null, label: 'I dag', icon: 'home' },
  { key: 'shopping', label: 'Handleliste', icon: 'cart' },
  { key: 'chores', label: 'Gjøremål', icon: 'check' },
  { key: 'calendar', label: 'Kalender', icon: 'calendar' },
  { key: 'more', label: 'Mer', icon: 'grid' },
];

const ICONS = {
  home: <path d="M4 11l8-7 8 7M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  cart: (
    <>
      <path d="M4 4h2l1.6 10.4a2 2 0 002 1.6h7.6a2 2 0 002-1.7L20 8H6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="20" r="1.3" fill="currentColor" />
      <circle cx="17" cy="20" r="1.3" fill="currentColor" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M19.4 13a7.6 7.6 0 000-2l2-1.5-2-3.4-2.3.9a7.6 7.6 0 00-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 00-1.7 1l-2.3-.9-2 3.4L6.6 11a7.6 7.6 0 000 2l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 001.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 001.7-1l2.3.9 2-3.4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      {ICONS[name]}
    </svg>
  );
}

export default function Sidebar({ onOpenSettings }) {
  const { user } = useAuth();
  const { members } = useFamilyMembers();
  const { expandedKey, openPanel, closePanel } = usePanelNavigation();

  function select(key) {
    if (key === null) closePanel();
    else openPanel(key);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-icon">🏠</span>
        <span className="sidebar-brand-name">FamilieHub</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.label}
            className={`sidebar-nav-item ${expandedKey === item.key ? 'sidebar-nav-item-active' : ''}`}
            onClick={() => select(item.key)}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-foot">
        <div className="sidebar-user-chip">
          <span className="sidebar-user-avatar">{(user?.familyName || '?').charAt(0).toUpperCase()}</span>
          <span className="sidebar-user-meta">
            <span className="sidebar-user-name">{user?.familyName}</span>
            <span className="sidebar-user-sub">{members.length} medlemmer</span>
          </span>
        </div>
        <button className="sidebar-settings-row" onClick={onOpenSettings}>
          <Icon name="gear" />
          Innstillinger
        </button>
      </div>
    </aside>
  );
}
