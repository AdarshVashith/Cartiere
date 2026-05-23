import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../firebase/firebase";
import { uploadToCloudinary } from "../../utils/cloudinary";
const MODEL_URL = "/models";

function FaceScan({ user, onComplete }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        setModelsLoaded(true);
      } catch (error) {
        setError("Failed to load face detection models. Please refresh.");
      }
    };

    loadModels();
  }, []);

  useEffect(() => {
    if (!modelsLoaded) {
      return undefined;
    }

    let stream;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: "user"
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (cameraError) {
        setError("Could not access webcam. Please allow camera permission.");
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [modelsLoaded]);

  const extractSkinTone = (canvas, box) => {
    const context = canvas.getContext("2d");
    const centerX = Math.floor(box.x + box.width / 2);
    const centerY = Math.floor(box.y + box.height / 2.5);
    const pixel = context.getImageData(centerX, centerY, 1, 1).data;
    const red = pixel[0].toString(16).padStart(2, "0");
    const green = pixel[1].toString(16).padStart(2, "0");
    const blue = pixel[2].toString(16).padStart(2, "0");
    return `#${red}${green}${blue}`;
  };

  const estimateFaceShape = (landmarks) => {
    const jaw = landmarks.getJawOutline();
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    const faceWidth = Math.abs(jaw[16].x - jaw[0].x);
    const faceHeight = Math.abs(jaw[8].y - leftEye[0].y);
    const jawWidth = Math.abs(jaw[12].x - jaw[4].x);
    const foreheadWidth = Math.abs(rightEye[3].x - leftEye[0].x) * 1.5;
    const ratio = faceWidth / faceHeight;

    if (ratio > 0.88) {
      return "Round";
    }

    if (jawWidth < foreheadWidth * 0.75) {
      return "Heart";
    }

    if (jawWidth > foreheadWidth * 0.9) {
      return "Square";
    }

    return "Oval";
  };

  const handleScan = async () => {
    setError(null);
    setCapturing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        throw new Error("Camera is not ready yet.");
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0);

      const imageDataUrl = canvas.toDataURL("image/jpeg");
      setCapturedImage(imageDataUrl);
      setCapturing(false);
      setAnalyzing(true);

      let facePhotoUrl = "";
      try {
        facePhotoUrl = await uploadToCloudinary(imageDataUrl, "styleai/face-scans");
      } catch (error) {
        throw new Error("Failed to upload image. Please try again.");
      }

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Detection timed out")), 15000);
      });

      const detectionPromise = faceapi
        .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceExpressions();

      const detection = await Promise.race([detectionPromise, timeoutPromise]);

      if (!detection) {
        throw new Error("No face detected. Please center your face and ensure good lighting.");
      }

      const skinTone = extractSkinTone(canvas, detection.detection.box);
      const faceShape = estimateFaceShape(detection.landmarks);
      const [dominantExpression, confidence] = Object.entries(detection.expressions).sort(
        (left, right) => right[1] - left[1]
      )[0];
      const expressions = Object.fromEntries(
        Object.entries(detection.expressions).map(([key, value]) => [key, Number(value)])
      );

      const analysisResults = {
        skinTone,
        faceShape,
        dominantExpression,
        confidence,
        expressions,
        faceScanDone: true,
        faceScanAt: new Date().toISOString(),
        preview: imageDataUrl,
        facePhotoUrl
      };

      setResults(analysisResults);
      setAnalyzing(false);
      await setDoc(
        doc(db, "users", user.uid),
        {
          skinTone: analysisResults.skinTone,
          faceShape: analysisResults.faceShape,
          dominantExpression: analysisResults.dominantExpression,
          facePhotoUrl: analysisResults.facePhotoUrl,
          faceScanDone: true
        },
        { merge: true }
      );
      await onComplete(analysisResults);
    } catch (error) {
      setError(error.message);
      setCapturing(false);
      setAnalyzing(false);
    }
  };

  return (
    <section className="card onboarding-stage-card fade-in-up">
      <header className="onboarding-stage-header">
        <p className="onboarding-stage-kicker">Biometric Enrollment</p>
        <h2 className="onboarding-stage-title">Initial Calibration</h2>
        <p className="onboarding-stage-copy">
          Let the camera read your face so the system can build a sharper base for your avatar and try-on previews.
        </p>
      </header>

      {!modelsLoaded ? (
        <div className="loading-row onboarding-loader-block">
          <div className="premium-loader"></div>
          <p className="onboarding-loader-label">Loading AI Models</p>
        </div>
      ) : (
        <div className="scan-layout onboarding-face-layout">
          <div className="stack">
             <div className="onboarding-camera-shell">
               <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
               <div className="onboarding-camera-frame">
                 <div className="onboarding-camera-outline"></div>
               </div>
               <div className="onboarding-camera-badge">Live Feed</div>
             </div>

             <div className="onboarding-trait-strip">
               <span>Skin tone baseline</span>
               <span>Face shape</span>
               <span>Expression read</span>
             </div>
             
             <button
               type="button"
               className="premium-button-primary onboarding-submit-button"
               onClick={handleScan}
               disabled={capturing || analyzing}
             >
               {capturing ? "Mapping..." : analyzing ? "Synthesizing..." : "Analyze Face"}
             </button>
             {error && <p className="error-text">{error}</p>}
          </div>

          <div className="result-panel">
            {results ? (
              <div className="result-card fade-in funky-result-card">
                <h3 className="result-title">Extraction Complete</h3>
                
                <div className="stack">
                  {capturedImage ? (
                    <img src={capturedImage} alt="Captured preview" className="result-image" />
                  ) : null}

                  <div className="result-row">
                    <div className="swatch" style={{ backgroundColor: results.skinTone }} />
                    <div>
                      <p className="result-label">Skin Tone baseline</p>
                      <p className="result-value">{results.skinTone}</p>
                    </div>
                  </div>

                  <div className="result-row">
                    <div className="onboarding-result-icon">👤</div>
                    <div>
                      <p className="result-label">Facial Geometry</p>
                      <p className="result-value">{results.faceShape} Structure</p>
                    </div>
                  </div>

                  <div className="result-row">
                    <div className="onboarding-result-icon">✨</div>
                    <div>
                      <p className="result-label">Biometric Expression</p>
                      <p className="result-value">{results.dominantExpression}</p>
                    </div>
                  </div>
                </div>

                <div className="success-pill">Calibration successfully established.</div>
              </div>
            ) : (
              <div className="result-card placeholder-card onboarding-placeholder-card">
                <div className="onboarding-placeholder-icon">?</div>
                <p className="onboarding-placeholder-title">Awaiting Data Input</p>
                <p>Center your face in the guide, then let the model extract your starter features.</p>
              </div>
            )}
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </section>
  );
}

export default FaceScan;
