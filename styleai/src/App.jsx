import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Navigate, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import AuthPage from "./pages/auth/AuthPage";
import { auth } from "./firebase/firebase";
import GenerateModel from "./pages/GenerateModel";
import GenerateOutfit from "./pages/GenerateOutfit";
import Discover from "./pages/Discover";
import Home from "./pages/Home";
import Me from "./pages/Me";
import OnboardingPage from "./pages/onboarding/OnboardingPage";
import Wardrobe from "./pages/wardrobe/Wardrobe";
import Wishlist from "./pages/Wishlist";
import Landing from "./pages/Landing";
import ImageArchitect from "./pages/ImageArchitect";
import { warnFirestorePermission } from "./firebase/firestoreErrors";
import { getUserNextRoute, hasCompletedOnboarding, isOnboardingRoute } from "./utils/authFlow";

function ProtectedRoute({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db } = await import('./firebase/firebase');
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const userData = userDoc.exists() ? userDoc.data() : null;
          const nextRoute = getUserNextRoute(userData);
          const viewingOnboarding = isOnboardingRoute(location.pathname);

          if (!hasCompletedOnboarding(userData)) {
            if (!viewingOnboarding && location.pathname !== nextRoute) {
              navigate(nextRoute, { replace: true });
            }
          } else if (viewingOnboarding && location.pathname !== "/home") {
            navigate("/home", { replace: true });
          }
        } catch (err) {
          warnFirestorePermission("Auth check error:", err);
        }
        setUser(firebaseUser);
      } else {
        navigate("/");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="premium-loader" />
        <p className="premium-subtitle" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Authenticating</p>
      </div>
    );
  }

  return user ? children : null;
}

function PublicRoute({ children, allowAuthenticated = false }) {
  const [loading, setLoading] = useState(true);
  const [canView, setCanView] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setCanView(true);
        setLoading(false);
        return;
      }

      if (allowAuthenticated) {
        setCanView(true);
        setLoading(false);
        return;
      }

      try {
        const { getDoc, doc } = await import("firebase/firestore");
        const { db } = await import("./firebase/firebase");
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        const userData = userDoc.exists() ? userDoc.data() : null;
        navigate(getUserNextRoute(userData), { replace: true });
      } catch (err) {
        warnFirestorePermission("Public route auth check error:", err);
        navigate("/onboarding", { replace: true });
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="premium-loader" />
        <p className="premium-subtitle" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Authenticating</p>
      </div>
    );
  }

  return canView ? children : null;
}

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicRoute allowAuthenticated>
            <Landing />
          </PublicRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        }
      />
      <Route
        path="/auth"
        element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/generate-model"
        element={
          <ProtectedRoute>
            <GenerateModel />
          </ProtectedRoute>
        }
      />
      <Route
        path="/generate-outfit"
        element={
          <ProtectedRoute>
            <GenerateOutfit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/discover"
        element={
          <ProtectedRoute>
            <Discover />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wardrobe"
        element={
          <ProtectedRoute>
            <Wardrobe />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wishlist"
        element={
          <ProtectedRoute>
            <Wishlist />
          </ProtectedRoute>
        }
      />
      <Route
        path="/architect"
        element={
          <ProtectedRoute>
            <ImageArchitect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/me"
        element={
          <ProtectedRoute>
            <Me />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
