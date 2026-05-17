import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import AuthCard from "../../components/AuthCard";
import { auth, db } from "../../firebase/firebase";
import { isFirestorePermissionDenied, warnFirestorePermission } from "../../firebase/firestoreErrors";
import "./AuthPage.css";

function AuthPage() {
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  const handleRedirect = async (user) => {
    if (!user) return;
    
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.avatarUrl) {
          navigate("/home", { replace: true });
          return;
        }
      }
      navigate("/onboarding", { replace: true });
    } catch (error) {
      warnFirestorePermission("Error checking user profile:", error);
      navigate(isFirestorePermissionDenied(error) ? "/home" : "/onboarding", { replace: true });
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

  // Canvas Logic for Left Panel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let shapes = [];
    const shapeTypes = ["tshirt", "dress", "blazer", "hanger", "sneaker", "tote"];

    const createShape = (y = Math.random() * canvas.height) => ({
      x: Math.random() * canvas.width,
      y: y,
      type: shapeTypes[Math.floor(Math.random() * shapeTypes.length)],
      size: Math.random() * 60 + 40,
      speed: Math.random() * 0.3 + 0.1,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: Math.random() * 0.002 + 0.001,
      opacity: Math.random() * 0.04 + 0.02,
    });

    const drawShape = (s) => {
      ctx.save();
      ctx.translate(s.x, s.y % canvas.height);
      ctx.rotate(s.rotation);
      ctx.strokeStyle = `rgba(255, 250, 242, ${s.opacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const sz = s.size;
      if (s.type === "tshirt") {
        ctx.moveTo(-sz/2, -sz/4); ctx.lineTo(-sz/4, -sz/2); ctx.lineTo(sz/4, -sz/2); ctx.lineTo(sz/2, -sz/4);
        ctx.lineTo(sz/2, sz/2); ctx.lineTo(-sz/2, sz/2); ctx.closePath();
      } else if (s.type === "dress") {
        ctx.moveTo(-sz/4, -sz/2); ctx.lineTo(sz/4, -sz/2); ctx.lineTo(sz/2, sz/2); ctx.lineTo(-sz/2, sz/2); ctx.closePath();
      } else if (s.type === "blazer") {
        ctx.strokeRect(-sz/3, -sz/2, sz*0.66, sz); ctx.moveTo(-sz/3, -sz/4); ctx.lineTo(0,0); ctx.lineTo(sz/3, -sz/4);
      } else if (s.type === "hanger") {
        ctx.moveTo(0, -sz/2); ctx.lineTo(sz/2, 0); ctx.lineTo(-sz/2, 0); ctx.closePath(); ctx.arc(0, -sz/2-5, 5, 0, Math.PI);
      } else if (s.type === "sneaker") {
        ctx.moveTo(-sz/2, sz/4); ctx.lineTo(sz/2, sz/4); ctx.lineTo(sz/2, -sz/4); ctx.lineTo(0, -sz/4); ctx.lineTo(-sz/2, sz/8); ctx.closePath();
      } else if (s.type === "tote") {
        ctx.strokeRect(-sz/3, -sz/4, sz*0.66, sz*0.75); ctx.arc(0, -sz/4, sz/4, Math.PI, 0);
      }
      ctx.stroke();
      ctx.restore();
    };

    const init = () => {
      const parent = canvas.parentElement;
      canvas.width = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
      shapes = Array.from({ length: 15 }, () => createShape());
    };

    let animationId;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      shapes.forEach(s => {
        s.y += s.speed;
        s.rotation += s.rotSpeed;
        drawShape(s);
      });
      animationId = requestAnimationFrame(animate);
    };

    init();
    animate();
    window.addEventListener("resize", init);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", init);
    };
  }, []);

  return (
    <div className="auth-container">
      <div className="mobile-header">STYLEMATE</div>

      <div className="auth-left">
        <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.6 }} />
        
        <div className="auth-brand-wrap">
          <div className="auth-brand">STYLEMATE</div>
          <div className="auth-tagline">Your AI Stylist, Always Ready.</div>
        </div>

        <div className="auth-rack-wrap">
          <svg width="100%" height="200" viewBox="0 0 400 200" fill="none">
            <line x1="20" y1="20" x2="380" y2="20" stroke="rgba(255,250,242,0.2)" strokeWidth="4" strokeLinecap="round" />
            {[ 
              { x: 80, d: "3s" }, { x: 140, d: "4s" }, { x: 200, d: "3.5s" }, 
              { x: 260, d: "4.5s" }, { x: 320, d: "3.2s" } 
            ].map((item, i) => (
              <g key={i} style={{ animation: `clothSway ${item.d} ease-in-out infinite`, transformOrigin: `${item.x}px 20px` }}>
                <line x1={item.x} y1="20" x2={item.x} y2="50" stroke="rgba(255,250,242,0.3)" strokeWidth="1.5" />
                <rect x={item.x - 20} y="50" width="40" height="70" rx="4" fill="rgba(255,250,242,0.12)" stroke="rgba(255,250,242,0.25)" strokeWidth="1.5" />
              </g>
            ))}
          </svg>
        </div>

        <div className="auth-badge">
          ✦ 10,000+ Outfits Generated
        </div>
      </div>

      <div className="auth-right">
        <AuthCard onAuthenticated={handleRedirect} />
      </div>

      <style>{`
        @keyframes clothSway {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
      `}</style>
    </div>
  );
}

export default AuthPage;
