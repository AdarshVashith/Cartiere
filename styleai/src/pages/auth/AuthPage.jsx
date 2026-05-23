import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import AuthCard from "../../components/AuthCard";
import { auth, db } from "../../firebase/firebase";
import { warnFirestorePermission } from "../../firebase/firestoreErrors";
import { getUserNextRoute } from "../../utils/authFlow";
import cartiereLogo from "../../assets/cartiere-logo.png";
import authSideBanner from "../../assets/auth-side-banner.png";
import "./AuthPage.css";

function AuthPage() {
  const navigate = useNavigate();

  const handleRedirect = async (user) => {
    if (!user) return;
    
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.exists() ? userDoc.data() : null;
      navigate(getUserNextRoute(userData), { replace: true });
    } catch (error) {
      warnFirestorePermission("Error checking user profile:", error);
      navigate("/onboarding", { replace: true });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        handleRedirect(user);
      }
    });
    return unsubscribe;
  }, [navigate]);

  return (
    <div className="auth-container">
      <div className="mobile-header">
        <img src={cartiereLogo} alt="Cartieré" className="mobile-header-image" />
      </div>

      <div className="auth-left">
        <img src={authSideBanner} alt="" className="auth-side-banner-image" />
        <div className="auth-brand-wrap auth-brand-wrap-top">
          <img src={cartiereLogo} alt="Cartieré" className="auth-brand-image auth-brand-image-top" />
        </div>
      </div>

      <div className="auth-right">
        <AuthCard onAuthenticated={handleRedirect} />
      </div>
    </div>
  );
}

export default AuthPage;
