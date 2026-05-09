import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Navigate, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import BodyDetailsStep from "../../components/BodyDetailsStep";
import ImageUploadStep from "../../components/ImageUploadStep";
import { auth, db } from "../../firebase/firebase";
import FaceScan from "./FaceScan";

function OnboardingPage() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [faceScanResult, setFaceScanResult] = useState(null);
  const [bodyPhotos, setBodyPhotos] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      
      if (nextUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", nextUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            
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

            // If avatar already exists, skip onboarding entirely and go home
            if (data.avatarUrl) {
              navigate("/home", { replace: true });
              return;
            }
          }
        } catch (error) {
          console.error("Error loading onboarding progress:", error);
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
        <p className="eyebrow">/onboarding</p>
        <h1>Complete your profile in 3 steps</h1>
        <p className="hero-copy">
          Step 1 Face scan, Step 2 full-body photos, Step 3 body details.
        </p>
        <div className="hero-badges">
          <span className={faceScanResult ? "done" : ""}>Step 1</span>
          <span className={bodyPhotos.length ? "done" : ""}>Step 2</span>
          <span>Step 3</span>
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
