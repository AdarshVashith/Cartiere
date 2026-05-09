import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";
import { BottomTabNav } from "../components/TabNav";

import MainLayout from "../components/MainLayout";
import './Me.css';

function Me() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        navigate("/login");
      } else {
        setUser(firebaseUser);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          setProfile(userDoc.data());
        } else {
          setError("Profile not found.");
        }
      } catch (err) {
        setError("Failed to load profile.");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="premium-loader"></div>
      </div>
    );
  }

  const stats = [
    { label: "Height", value: profile?.height || "—" },
    { label: "Weight", value: profile?.weight || "—" },
    { label: "Age", value: profile?.age || "—" },
    { label: "Gender", value: profile?.gender || "—" },
    { label: "Body type", value: profile?.bodyType || "—" },
    { label: "Face shape", value: profile?.faceShape || "—" },
  ];

  return (
    <MainLayout>
      <div className="profile-content-wrap">
        <header className="top-header fade-in-down">
          <div className="greeting-text">
            <h1 className="premium-title">My Profile</h1>
            <p className="premium-subtitle">Your personal style footprint and digital identity</p>
          </div>
        </header>

        <section className="profile-header-card fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="profile-avatar-large">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Avatar" />
            ) : (
              <div className="avatar-placeholder">
                {profile?.name ? profile.name[0] : "S"}
              </div>
            )}
          </div>
          <div className="profile-main-info">
            <h2 className="profile-name-title">{profile?.name || "Style Enthusiast"}</h2>
            <div className="profile-meta-row">
              <span className="profile-loc">{profile?.city || "Unknown Location"}</span>
              <div className="skin-dot" style={{ backgroundColor: profile?.skinTone || "#f5c5a3" }} />
            </div>
          </div>
          <div className="profile-actions-header">
            <button onClick={() => navigate('/onboarding')} className="edit-prof-btn">Edit</button>
          </div>
        </section>

        <section className="stats-grid-section fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="section-subtitle-premium">Physical Profile</h3>
          <div className="stats-row-wardrobe">
            {stats.map((stat, i) => (
              <div key={i} className="stat-card-mini">
                <span className="stat-lbl">{stat.label}</span>
                <span className="stat-val" style={{ fontSize: '24px' }}>{stat.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="appearance-card-premium fade-in-up" style={{ animationDelay: '0.3s' }}>
           <h3 className="section-subtitle-premium">Personal Palette</h3>
           <div className="palette-info-row">
             <div className="palette-block" style={{ backgroundColor: profile?.skinTone || "#f5c5a3" }} />
             <div className="palette-text">
               <p>Your AI recommendations are fine-tuned for your signature skin tone (<span className="skin-hex">{profile?.skinTone || "#f5c5a3"}</span>).</p>
             </div>
           </div>
        </section>

        <section className="account-danger-zone fade-in-up" style={{ animationDelay: '0.4s' }}>
          <button onClick={() => navigate('/generate-model')} className="premium-button-secondary" style={{ width: '100%', marginBottom: '16px' }}>Regenerate AI Avatar</button>
          <button onClick={handleSignOut} className="sign-out-btn-premium">Sign Out of StyleMate</button>
        </section>

        <footer className="profile-footer-info">
          <p>StyleMate Luxury AI · Version 1.2.0</p>
        </footer>
      </div>
    </MainLayout>
  );
}

export default Me;
