import { NavLink } from "react-router-dom";

const tabs = [
  {
    to: '/home', label: 'Home',
    icon: (a) => <svg width="20" height="20" fill="none"
      stroke={a ? '#111827' : '#9ca3af'} strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
        strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 21V12h6v9" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  },
  {
    to: '/wardrobe', label: 'Wardrobe',
    icon: (a) => <svg width="20" height="20" fill="none"
      stroke={a ? '#111827' : '#9ca3af'} strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H7v13a1 1 0 001 1h8a1 1 0 001-1V10h3.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  },
  {
    to: '/discover', label: 'Discover',
    icon: (a) => <svg width="20" height="20" fill="none"
      stroke={a ? '#111827' : '#9ca3af'} strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10"/>
      <path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  },
  {
    to: '/wishlist', label: 'Wishlist',
    icon: (a) => <svg width="20" height="20"
      fill={a ? '#111827' : 'none'}
      stroke={a ? '#111827' : '#9ca3af'} strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  },
  {
    to: '/architect', label: 'Architect',
    icon: (a) => <svg width="20" height="20" fill="none"
      stroke={a ? '#111827' : '#9ca3af'} strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  },
  {
    to: '/me', label: 'Me',
    icon: (a) => <svg width="20" height="20" fill="none"
      stroke={a ? '#111827' : '#9ca3af'} strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" strokeLinecap="round"/>
    </svg>
  }
];

export function BottomTabNav() {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      zIndex: 50, borderTop: '1px solid #f3f4f6',
      background: 'rgba(255,255,255,0.97)',
      backdropFilter: 'blur(8px)'
    }}>
      <ul style={{ display: 'flex', width: '100%', margin: 0, 
                   padding: 0, listStyle: 'none' }}>
        {tabs.map((tab) => (
          <li key={tab.to} style={{ flex: 1, minWidth: 0 }}>
            <NavLink to={tab.to} style={{ display: 'flex', 
              flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '8px 4px',
              textDecoration: 'none', width: '100%' }}>
              {({ isActive }) => (
                <>
                  <span style={{ display: 'flex', 
                                 alignItems: 'center', 
                                 justifyContent: 'center',
                                 width: 24, height: 24 }}>
                    {tab.icon(isActive)}
                  </span>
                  <span style={{
                    fontSize: '9px', marginTop: '2px',
                    color: isActive ? '#111827' : '#9ca3af',
                    fontWeight: isActive ? '600' : '400',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis', maxWidth: '100%',
                    textAlign: 'center'
                  }}>
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
