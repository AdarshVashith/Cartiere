import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './MobileNav.css';

const MobileNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Home', path: '/home', icon: '🏠' },
    { label: 'Wardrobe', path: '/wardrobe', icon: '🧥' },
    { label: 'Discover', path: '/discover', icon: '✦' },
    { label: 'Wishlist', path: '/wishlist', icon: '♡' },
    { label: 'Profile', path: '/me', icon: '👤' },
  ];

  return (
    <nav className="mobile-nav">
      {navItems.map((item) => (
        <div 
          key={item.path}
          className={`mobile-nav-item ${location.pathname === item.path ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
        >
          <span className="mobile-nav-icon">{item.icon}</span>
          <span className="mobile-nav-label">{item.label}</span>
          {location.pathname === item.path && <div className="mobile-active-dot" />}
        </div>
      ))}
    </nav>
  );
};

export default MobileNav;
