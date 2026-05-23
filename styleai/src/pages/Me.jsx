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

  const profileName = profile?.name || "Style Enthusiast";
  const profileCity = profile?.city || "Unknown Location";
  const profileInitial = profileName?.[0] || "C";
  const profileIdentity = [profile?.gender, profile?.bodyType, profile?.targetAesthetic]
    .filter(Boolean)
    .join(" · ") || "Curated personal profile";
  const quickSummary = [
    { label: "City", value: profileCity },
    { label: "Skin Tone", value: profile?.skinTone || "Saved" },
    { label: "Aesthetic", value: profile?.targetAesthetic || "Not set" },
    { label: "Avatar", value: profile?.avatarUrl ? "Ready" : "Missing" },
  ];

  return (
    <MainLayout>
      <div className="profile-content-wrap profile-lookbook-page">
        <header className="profile-lookbook-header fade-in-down">
          <div className="profile-lookbook-headline">
            <p className="profile-kicker">Profile Center</p>
            <h1 className="profile-page-title">My Profile</h1>
            <p className="profile-page-copy">
              Your details, avatar, and styling baseline in one place.
            </p>
          </div>
          <div className="profile-edition-mark">Easy View</div>
        </header>

        <section className="profile-hero-spread fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="profile-hero-copy">
            <div className="profile-copy-frame">
              <p className="profile-section-label">Overview</p>
              <h2 className="profile-name-display">{profileName}</h2>
              <p className="profile-identity-line">{profileIdentity}</p>
              <div className="profile-meta-row lookbook-meta-row">
                <span className="profile-loc">{profileCity}</span>
                <div className="skin-dot" style={{ backgroundColor: profile?.skinTone || "#f5c5a3" }} />
              </div>
              <div className="profile-overview-grid">
                {quickSummary.map((item) => (
                  <div key={item.label} className="profile-overview-item">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="profile-note-panel">
              <p className="profile-note-kicker">What this controls</p>
              <p className="profile-note-copy">
                These settings shape your avatar, improve fit accuracy, and help Cartieré give better wardrobe recommendations.
              </p>
            </div>

            <div className="profile-action-row">
              <button onClick={() => navigate('/onboarding')} className="edit-prof-btn">Edit Profile</button>
              <button onClick={() => navigate('/generate-model')} className="premium-button-secondary profile-secondary-action">Regenerate Avatar</button>
            </div>
          </div>

          <div className="profile-portrait-frame">
            <div className="profile-portrait-card">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Avatar" className="profile-portrait-image" />
              ) : (
                <div className="avatar-placeholder lookbook-avatar-placeholder">
                  {profileInitial}
                </div>
              )}
            </div>
            <div className="profile-caption-strip">
              <span>Avatar Preview</span>
              <span>{profile?.targetAesthetic || "Profile Saved"}</span>
            </div>
          </div>
        </section>

        <section className="profile-stat-spread fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="profile-section-heading">
            <div>
              <p className="profile-section-label">Body Details</p>
              <h3 className="section-subtitle-premium">Measurements and identifiers</h3>
            </div>
          </div>
          <div className="profile-stat-grid">
            {stats.map((stat, i) => (
              <article key={i} className="stat-card-mini profile-stat-card">
                <span className="stat-lbl">{stat.label}</span>
                <span className="stat-val profile-stat-value">{stat.value}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="profile-editorial-grid fade-in-up" style={{ animationDelay: '0.3s' }}>
          <article className="appearance-card-premium profile-editorial-card">
            <p className="profile-section-label">Skin Tone</p>
            <h3 className="section-subtitle-premium">Saved colour reference</h3>
            <div className="palette-info-row lookbook-palette-row">
              <div className="palette-block" style={{ backgroundColor: profile?.skinTone || "#f5c5a3" }} />
              <div className="palette-text">
                <p>This tone is used to tune your try-ons and improve outfit recommendation accuracy.</p>
                <span className="skin-hex">{profile?.skinTone || "#f5c5a3"}</span>
              </div>
            </div>
          </article>

          <article className="profile-editorial-card profile-summary-card">
            <p className="profile-section-label">Style Summary</p>
            <h3 className="section-subtitle-premium">What Cartieré knows</h3>
            <div className="profile-summary-list">
              <div>
                <span>Gender</span>
                <strong>{profile?.gender || "—"}</strong>
              </div>
              <div>
                <span>Body Type</span>
                <strong>{profile?.bodyType || "—"}</strong>
              </div>
              <div>
                <span>Face Shape</span>
                <strong>{profile?.faceShape || "—"}</strong>
              </div>
              <div>
                <span>Target Aesthetic</span>
                <strong>{profile?.targetAesthetic || "Not set"}</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="account-danger-zone fade-in-up profile-actions-footer" style={{ animationDelay: '0.4s' }}>
          <button onClick={handleSignOut} className="sign-out-btn-premium">Sign Out of Cartieré</button>
        </section>

        <footer className="profile-footer-info">
          <p>Cartieré Luxury AI · Version 1.2.0</p>
        </footer>
      </div>
    </MainLayout>
  );
}

export default Me;
