import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import './HeaderNav.css';

const HeaderNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) setProfile(userDoc.data());
      }
    });
    return () => unsubscribe();
  }, []);

  const navItems = [
    { label: 'Home', path: '/home' },
    { label: 'Wardrobe', path: '/wardrobe' },
    { label: 'Discover', path: '/discover' },
    { label: 'Wishlist', path: '/wishlist' },
  ];

  return (
    <nav className={`header-nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="header-nav-inner">
        <div className="brand-logo" onClick={() => navigate('/home')}>
          STYLEMATE
        </div>

        <div className="nav-links">
          {navItems.map((item) => (
            <div 
              key={item.path}
              className={`nav-link-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              {item.label}
              {location.pathname === item.path && <div className="nav-underline-accent" />}
            </div>
          ))}
        </div>

        <div className="header-actions-right">

          <div className="nav-profile-trigger" onClick={() => navigate('/me')}>
            {profile?.avatarUrl && typeof profile.avatarUrl === 'string' ? (
              <img src={profile.avatarUrl} alt="Avatar" className="header-avatar" />
            ) : (
              <div className="header-avatar-placeholder">
                {typeof profile?.name === 'string' ? profile.name[0] : 'S'}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default HeaderNav;
