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
    <section className="bg-white rounded-[40px] shadow-sm border border-[#784854]/05 p-12 max-w-4xl mx-auto fade-in-up">
      <header className="text-center mb-10">
        <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-[#784854]/60 mb-3">Biometric Enrollment</p>
        <h2 className="text-4xl font-['Cormorant_Garamond'] font-bold text-[#1A1A1A] mb-4">Initial Calibration</h2>
        <p className="text-[#666] text-lg font-light max-w-lg mx-auto">
          We analyze your unique facial structure to establish skin tone baseline and proportions for your digital twin.
        </p>
      </header>

      {!modelsLoaded ? (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="premium-loader"></div>
          <p className="text-[#784854]/40 font-bold uppercase tracking-widest text-[10px]">Loading AI Models</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="flex flex-col gap-6">
             <div className="relative rounded-[32px] overflow-hidden bg-[#fcf6f7] aspect-[4/3] border-4 border-[#784854]/05 shadow-inner">
               <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
               <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                 <div className="w-48 h-64 border-2 border-dashed border-white/40 rounded-full"></div>
               </div>
               <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[10px] text-white font-bold tracking-widest uppercase">Live Feed</div>
             </div>
             
             <button
               type="button"
               className="premium-button-primary w-full py-5 rounded-2xl bg-[#1A1A1A] text-white font-bold hover:bg-[#784854] transition-all shadow-xl hover:shadow-[#784854]/20"
               onClick={handleScan}
               disabled={capturing || analyzing}
             >
               {capturing ? "Mapping..." : analyzing ? "Synthesizing..." : "Analyze Face"}
             </button>
             {error && <p className="text-[#e74c3c] text-center text-sm font-medium">{error}</p>}
          </div>

          <div className="flex flex-col gap-6 justify-center">
            {results ? (
              <div className="bg-[#fcf6f7] rounded-[32px] p-8 border border-[#784854]/10 fade-in">
                <h3 className="text-xl font-bold text-[#1A1A1A] mb-6">Extraction Complete</h3>
                
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: results.skinTone }} />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#784854]/40">Skin Tone baseline</p>
                      <p className="font-bold text-[#1A1A1A]">{results.skinTone}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-xl shadow-sm">👤</div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#784854]/40">Facial Geometry</p>
                      <p className="font-bold text-[#1A1A1A]">{results.faceShape} Structure</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-xl shadow-sm">✨</div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#784854]/40">Biometric Expression</p>
                      <p className="font-bold text-[#1A1A1A] capitalize">{results.dominantExpression}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-[#784854]/10 flex items-center gap-2 text-[#784854]">
                  <div className="w-5 h-5 bg-[#784854] rounded-full flex items-center justify-center text-[10px] text-white">✓</div>
                  <span className="font-bold text-sm">Calibration Successfully established.</span>
                </div>
              </div>
            ) : (
              <div className="bg-[#fcf6f7] rounded-[32px] p-12 border border-dashed border-[#784854]/20 flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-2xl shadow-sm text-[#784854]/20">?</div>
                <p className="text-[#784854]/40 font-bold uppercase tracking-widest text-[10px]">Awaiting Data Input</p>
                <p className="text-[#666] text-sm">Position your face within the frame and capture to begin extraction.</p>
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
