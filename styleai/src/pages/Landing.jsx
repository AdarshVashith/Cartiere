import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";
import "./Landing.css";

const Landing = () => {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const trackRef = useRef(null);
  const lineRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, "users", u.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data());
          }
        } catch (err) {
          console.error("Error fetching profile on landing:", err);
        }
      } else {
        setProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const outfitData = [
    { name: "Smart Casual", combo: "Teal Shirt + Trousers" },
    { name: "Evening Look", combo: "Mauve Blazer + White Shirt" },
    { name: "Weekend Vibes", combo: "Grey Hoodie + Jeans" },
    { name: "Office Ready", combo: "Structured Jacket + Shirt" },
    { name: "Summer Edit", combo: "Linen Shirt + Shorts" },
    { name: "Minimalist", combo: "White Tee + Slim Pants" },
  ];

  // Canvas Logic
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
      size: Math.random() * 80 + 60,
      speed: Math.random() * 0.4 + 0.2,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: Math.random() * 0.003 + 0.002,
      opacity: Math.random() * 0.06 + 0.04,
    });

    const drawShape = (s, scrollY) => {
      ctx.save();
      const drawY = (s.y - scrollY * 0.1) % canvas.height;
      ctx.translate(s.x, drawY < 0 ? drawY + canvas.height : drawY);
      ctx.rotate(s.rotation);
      ctx.strokeStyle = `rgba(120, 72, 84, ${s.opacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();

      const sz = s.size;
      if (s.type === "tshirt") {
        ctx.moveTo(-sz / 2, -sz / 4); ctx.lineTo(-sz / 4, -sz / 2); ctx.lineTo(sz / 4, -sz / 2); ctx.lineTo(sz / 2, -sz / 4);
        ctx.lineTo(sz / 2, sz / 2); ctx.lineTo(-sz / 2, sz / 2); ctx.closePath();
      } else if (s.type === "dress") {
        ctx.moveTo(-sz / 4, -sz / 2); ctx.lineTo(sz / 4, -sz / 2); ctx.lineTo(sz / 2, sz / 2); ctx.lineTo(-sz / 2, sz / 2); ctx.closePath();
      } else if (s.type === "blazer") {
        ctx.strokeRect(-sz / 3, -sz / 2, sz * 0.66, sz); ctx.moveTo(-sz / 3, -sz / 4); ctx.lineTo(0, 0); ctx.lineTo(sz / 3, -sz / 4);
      } else if (s.type === "hanger") {
        ctx.moveTo(0, -sz / 2); ctx.lineTo(sz / 2, 0); ctx.lineTo(-sz / 2, 0); ctx.closePath(); ctx.arc(0, -sz / 2 - 5, 5, 0, Math.PI);
      } else if (s.type === "sneaker") {
        ctx.moveTo(-sz / 2, sz / 4); ctx.lineTo(sz / 2, sz / 4); ctx.lineTo(sz / 2, -sz / 4); ctx.lineTo(0, -sz / 4); ctx.lineTo(-sz / 2, sz / 8); ctx.closePath();
      } else if (s.type === "tote") {
        ctx.strokeRect(-sz / 3, -sz / 4, sz * 0.66, sz * 0.75); ctx.arc(0, -sz / 4, sz / 4, Math.PI, 0);
      }
      ctx.stroke();
      ctx.restore();
    };

    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      shapes = Array.from({ length: 20 }, () => createShape());
    };

    let animationId;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      shapes.forEach((s) => {
        s.y += s.speed;
        s.rotation += s.rotSpeed;
        drawShape(s, window.scrollY);
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

  // Scroll and Observer Logic
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target.classList.contains("counter")) {
              const target = +entry.target.dataset.target;
              let count = 0;
              const update = () => {
                count += Math.ceil(target / 100);
                if (count < target) {
                  entry.target.innerText = count;
                  requestAnimationFrame(update);
                } else {
                  entry.target.innerText = target;
                }
              };
              update();
            }
            if (entry.target.id === "howItWorks") {
              if (lineRef.current) lineRef.current.style.strokeDashoffset = "0";
            }
            entry.target.classList.add("active");
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll(".counter, .testimonial-card, .how-it-works").forEach((el) => observer.observe(el));

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Carousel Auto-scroll
  useEffect(() => {
    const interval = setInterval(() => {
      setCarouselIdx((prev) => (prev + 1) % outfitData.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [outfitData.length]);

  useEffect(() => {
    if (trackRef.current) {
      const offset = carouselIdx * (200 + 32);
      trackRef.current.style.transform = `translateX(-${offset}px)`;
    }
  }, [carouselIdx]);

  const handleNav = (path) => navigate(path);

  return (
    <div className="landing-page">
      <canvas ref={canvasRef} id="bgCanvas" />

      <nav className={`landing-nav ${scrolled ? "scrolled" : ""}`}>
        <div className="container nav-content">
          <div className="logo-wrap" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
            <div className="logo">STYLEMATE</div>
          </div>
          <div className="nav-btns">
            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10px", opacity: 0.5, fontWeight: 700, letterSpacing: '0.1em' }}>MEMBER</div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: 'var(--mauve)' }}>{profile?.name || user.email.split('@')[0]}</div>
                </div>
                <div 
                  onClick={() => handleNav("/home")}
                  className="sidebar-avatar-thumb"
                  style={{ width: '44px', height: '44px', border: '2px solid var(--mauve)', cursor: 'pointer' }}
                >
                  {profile?.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="Avatar" />
                  ) : (
                    <div style={{ background: 'var(--mauve)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      {user.email[0].toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <button className="btn-ghost" onClick={() => handleNav("/login")}>Login</button>
                <button className="btn-filled" onClick={() => handleNav("/login")}>Start Styling</button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="hero container">
        <div className="hero-left">
          <span className="hero-label">AI-POWERED FASHION ENGINE</span>
          <h1 className="hero-title">
            {profile?.name ? (
              `Welcome back, ${profile.name.split(' ')[0]}.`
            ) : (
              <>
                Your Personal <br />
                <span style={{ color: 'var(--mauve)' }}>AI Stylist</span>
              </>
            )}
          </h1>
          <p className="hero-subtext">
            StyleMate analyzes your wardrobe to generate weather-aware, context-driven outfit combinations tailored specifically to your aesthetic.
          </p>
          <div className="hero-btns">
            {user ? (
              <button className="btn-primary" onClick={() => handleNav("/home")}>Dashboard →</button>
            ) : (
              <button className="btn-primary" onClick={() => handleNav("/login")}>Join StyleMate</button>
            )}
            <button className="btn-secondary">Explore Features</button>
          </div>
        </div>
        
        <div className="hero-right fade-in">
          <div className="ai-badge">✦ PREMIUM AI MODEL</div>
          <div className="wardrobe-rack">
            {profile?.avatarUrl ? (
              <div className="model-stage-landing">
                <img src={profile.avatarUrl} alt="User Model" style={{ width: '100%', height: 'auto', maxHeight: '400px', objectFit: 'contain' }} />
              </div>
            ) : (
              <div className="empty-rack-landing">
                <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="0.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M9 20V6"/><path d="M15 20V6"/><path d="M2 10h20"/></svg>
                <p>Digital wardrobe ready for your collection.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="features container">
        <h2 className="section-title">Elevate Your Daily Style</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/></svg>
            </div>
            <h3>Style Intelligence</h3>
            <p>Our AI maps your collection to identify style gaps and discover hidden outfit combinations you never knew existed.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 19.07-1.41-1.41"/><path d="M12 20v2"/><path d="m6.34 17.66-1.41 1.41"/><path d="M2 12h2"/><path d="m4.93 19.07 1.41-1.41"/><path d="M20 12a8 8 0 1 0-16 0"/><path d="M12 9v3l1.5 1.5"/></svg>
            </div>
            <h3>Contextual Sync</h3>
            <p>Receive daily outfit recommendations synced with your local weather and calendar, ensuring you're always ready.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            </div>
            <h3>Brand Affinity</h3>
            <p>StyleMate learns your preference for cuts, colors, and textures, creating a personalized fashion profile that evolves with you.</p>
          </div>
        </div>
      </section>

      <section className="final-cta container" style={{ padding: '120px 0', textAlign: 'center' }}>
        <h2 className="premium-title" style={{ fontSize: '64px', marginBottom: '24px' }}>Ready to redefine your style?</h2>
        <p className="premium-subtitle" style={{ fontSize: '18px', maxWidth: '600px', margin: '0 auto 48px' }}>
          Join thousands of fashion-forward individuals using AI to master their wardrobes.
        </p>
        <button className="btn-primary" onClick={() => handleNav(user ? "/home" : "/login")}>
          {user ? "Enter Dashboard" : "Start Styling for Free"}
        </button>
      </section>

      <footer>
        <div className="container">
          <div className="logo" style={{ fontSize: '20px', marginBottom: '12px' }}>STYLEMATE</div>
          <div style={{ fontSize: "12px", opacity: 0.5, letterSpacing: '0.05em' }}>© 2026 STYLEMATE LUXURY AI. ALL RIGHTS RESERVED.</div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
