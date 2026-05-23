import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Navigate, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import BodyDetailsStep from "../../components/BodyDetailsStep";
import ImageUploadStep from "../../components/ImageUploadStep";
import { auth, db } from "../../firebase/firebase";
import { warnFirestorePermission } from "../../firebase/firestoreErrors";
import FaceScan from "./FaceScan";
import { getUserNextRoute } from "../../utils/authFlow";
import heroModel from "../../assets/hero_model.png";

function OnboardingPage() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [faceScanResult, setFaceScanResult] = useState(null);
  const [bodyPhotos, setBodyPhotos] = useState([]);
  const navigate = useNavigate();
  const currentStep = !faceScanResult ? 1 : !bodyPhotos.length ? 2 : 3;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      
      if (nextUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", nextUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            const nextRoute = getUserNextRoute(data);

            if (nextRoute === "/home" || nextRoute === "/generate-model") {
              navigate(nextRoute, { replace: true });
              return;
            }
            
            // If face scan is already done, set faceScanResult
            if (data.facePhotoUrl) {
              setFaceScanResult({
                facePhotoUrl: data.facePhotoUrl,
                skinTone: data.skinTone,
                faceShape: data.faceShape,
                dominantExpression: data.dominantExpression,
                faceScanDone: true
              });
            }

            // Restore body photos step progress
            if (data.bodyPhotoUrls && data.bodyPhotoUrls.length > 0) {
              setBodyPhotos(data.bodyPhotoUrls);
            }
          }
        } catch (error) {
          warnFirestorePermission("Error loading onboarding progress:", error);
        }
      }
      
      setLoadingAuth(false);
    });

    return unsubscribe;
  }, []);

  if (loadingAuth) {
    return <main className="single-panel">Checking your session...</main>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="app-shell onboarding-shell">
      <section className="hero-panel">
        <button
          type="button"
          className="onboarding-back-button"
          onClick={() => navigate("/")}
        >
          Back to landing
        </button>
        <p className="eyebrow">/onboarding</p>
        <h1>Complete your profile in 3 steps</h1>
        <p className="hero-copy">
          Build your style identity with a fast three-step setup: scan, map, then calibrate.
        </p>

        <div className="onboarding-visual-stack">
          <article className="onboarding-preview-card main">
            <img src={heroModel} alt="Style preview" />
            <div className="onboarding-preview-chip chip-top">AI Twin</div>
            <div className="onboarding-preview-chip chip-bottom">Funky Setup</div>
          </article>

          <article className="onboarding-floating-card accent-one">
            <span>01</span>
            <strong>Scan face</strong>
            <p>Capture tone, shape, and expression.</p>
          </article>

          <article className="onboarding-floating-card accent-two">
            <span>02</span>
            <strong>Map body</strong>
            <p>Use full-length images for a sharper silhouette.</p>
          </article>
        </div>

        <div className="onboarding-progress-list">
          <article className={`onboarding-progress-item ${currentStep === 1 ? "current" : ""} ${faceScanResult ? "done" : ""}`}>
            <span className="onboarding-progress-index">01</span>
            <div>
              <h3>Face scan</h3>
              <p>Analyze facial geometry and skin-tone baseline.</p>
            </div>
          </article>
          <article className={`onboarding-progress-item ${currentStep === 2 ? "current" : ""} ${bodyPhotos.length ? "done" : ""}`}>
            <span className="onboarding-progress-index">02</span>
            <div>
              <h3>Body photos</h3>
              <p>Upload two references for body-aware avatar fitting.</p>
            </div>
          </article>
          <article className={`onboarding-progress-item ${currentStep === 3 ? "current" : ""}`}>
            <span className="onboarding-progress-index">03</span>
            <div>
              <h3>Measurements</h3>
              <p>Add metrics so recommendations feel tailored and usable.</p>
            </div>
          </article>
        </div>

        <div className="hero-badges">
          <span className={faceScanResult ? "done" : currentStep === 1 ? "current" : ""}>Step 1</span>
          <span className={bodyPhotos.length ? "done" : currentStep === 2 ? "current" : ""}>Step 2</span>
          <span className={currentStep === 3 ? "current" : ""}>Step 3</span>
        </div>

        <div className="onboarding-side-notes">
          <div className="onboarding-note-card">
            <strong>Why this setup matters</strong>
            <p>A cleaner avatar means better try-ons, smarter wardrobe planning, and stronger outfit suggestions later.</p>
          </div>
          <div className="onboarding-note-card">
            <strong>What unlocks next</strong>
            <p>Once this is complete, you generate your digital twin and enter the full dashboard flow.</p>
          </div>
        </div>
      </section>

      <section className="flow-panel">
        {!faceScanResult ? (
          <FaceScan user={user} onComplete={setFaceScanResult} />
        ) : null}

        {faceScanResult && !bodyPhotos.length ? (
          <ImageUploadStep
            user={user}
            faceScanResult={faceScanResult}
            onComplete={setBodyPhotos}
          />
        ) : null}

        {faceScanResult && bodyPhotos.length ? (
          <BodyDetailsStep
            user={user}
            onComplete={() => navigate("/generate-model")}
          />
        ) : null}
      </section>
    </main>
  );
}

export default OnboardingPage;
