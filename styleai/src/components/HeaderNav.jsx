import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import cartiereLogo from '../assets/cartiere-logo.png';
import './HeaderNav.css';
import { warnFirestorePermission } from '../firebase/firestoreErrors';
import { mergeDiscoverState } from '../utils/discoverAccess';

const HeaderNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [discoverRefreshTick, setDiscoverRefreshTick] = useState(0);
  const discoverLocked = !mergeDiscoverState(
    { ...(profile || {}), __discoverRefreshTick: discoverRefreshTick },
    auth.currentUser?.uid
  ).isWardrobeComplete;

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
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) setProfile(userDoc.data());
          else setProfile({});
        } catch (error) {
          setProfile({});
          warnFirestorePermission('Header profile load failed:', error);
        }
      } else {
        setProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleDiscoverSettingsUpdated = () => {
      setDiscoverRefreshTick((value) => value + 1);
    };

    window.addEventListener('discover-settings-updated', handleDiscoverSettingsUpdated);
    return () => window.removeEventListener('discover-settings-updated', handleDiscoverSettingsUpdated);
  }, []);

  const navItems = [
    { label: 'Home', path: '/home' },
    { label: 'Wardrobe', path: '/wardrobe' },
    {
      label: 'Discover',
      path: '/discover',
      disabled: discoverLocked,
      helper: 'Confirm your full wardrobe first'
    },
    { label: 'Wishlist', path: '/wishlist' },
  ];

  const handleNavClick = (item) => {
    if (item.disabled) {
      window.alert('Discover unlocks after you confirm in Wardrobe that this is your full wardrobe.')
      navigate('/wardrobe')
      return
    }

    navigate(item.path)
  }

  return (
    <nav className={`header-nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="header-nav-inner">
        <div className="brand-logo" onClick={() => navigate('/home')}>
          <img src={cartiereLogo} alt="Cartieré" className="brand-logo-image" />
        </div>

        <div className="nav-links">
          {navItems.map((item) => (
            <div 
              key={item.path}
              className={`nav-link-item ${location.pathname === item.path ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
              onClick={() => handleNavClick(item)}
              title={item.disabled ? item.helper : item.label}
            >
              {item.label}
              {item.disabled && <span className="nav-lock-indicator">Locked</span>}
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
