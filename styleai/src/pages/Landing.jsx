import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";
import { warnFirestorePermission } from "../firebase/firestoreErrors";
import "./Landing.css";

const capabilityCards = [
  {
    icon: "compass",
    eyebrow: "Wardrobe Intelligence",
    title: "See what is missing before you buy anything.",
    body: "StyleMate maps your existing wardrobe, identifies gap categories, and pushes only the pieces that improve outfit range.",
  },
  {
    icon: "spark",
    eyebrow: "Virtual Styling",
    title: "Try recommendations on your AI model before you commit.",
    body: "Preview new clothes on your generated profile and compare looks with more confidence before shopping.",
  },
  {
    icon: "grid",
    eyebrow: "Aesthetic Engineering",
    title: "Move toward a sharper target look with technical guidance.",
    body: "Use Image Architect to break down proportions, palette, grooming direction, and structural upgrades for a chosen aesthetic.",
  },
];

const showcaseSignals = [
  { title: "Gap-aware shopping", body: "Only items your wardrobe actually needs." },
  { title: "Visual try-on", body: "Preview recommendations on your AI profile." },
  { title: "Target aesthetic", body: "Refine the exact look you want to grow into." },
];

const aestheticStrip = [
  "Quiet Luxury",
  "Industrial Techwear",
  "Scandi-Minimalism",
  "Old Money",
  "Streetwear",
  "Modern Workwear",
];

const wardrobeSignals = [
  "Digital wardrobe archive",
  "Discover gap analysis",
  "Virtual try-on previews",
];

function CapabilityIcon({ type }) {
  if (type === "spark") {
    return (
      <svg viewBox="0 0 64 64" className="capability-svg">
        <path d="M32 6 38 24 56 32 38 40 32 58 26 40 8 32 26 24Z" />
        <circle cx="49" cy="15" r="4" />
      </svg>
    );
  }

  if (type === "grid") {
    return (
      <svg viewBox="0 0 64 64" className="capability-svg">
        <rect x="10" y="10" width="18" height="18" rx="5" />
        <rect x="36" y="10" width="18" height="18" rx="5" />
        <rect x="10" y="36" width="18" height="18" rx="5" />
        <rect x="36" y="36" width="18" height="18" rx="5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className="capability-svg">
      <circle cx="32" cy="32" r="20" />
      <path d="M32 20 38 32l-6 12-6-12Z" />
      <circle cx="32" cy="32" r="4" />
    </svg>
  );
}

const Landing = () => {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", nextUser.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data());
          }
        } catch (err) {
          setProfile(null);
          warnFirestorePermission("Error fetching profile on landing:", err);
        }
      } else {
        setProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let nodes = [];

    const createNode = () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      radius: Math.random() * 2.6 + 1.2,
      driftX: (Math.random() - 0.5) * 0.18,
      driftY: Math.random() * 0.3 + 0.08,
      alpha: Math.random() * 0.24 + 0.04,
    });

    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      nodes = Array.from({ length: 32 }, createNode);
    };

    let animationFrame;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nodes.forEach((node) => {
        node.x += node.driftX;
        node.y += node.driftY;
        if (node.y > canvas.height + 20) node.y = -20;
        if (node.x < -20) node.x = canvas.width + 20;
        if (node.x > canvas.width + 20) node.x = -20;

        ctx.beginPath();
        ctx.fillStyle = `rgba(120, 72, 84, ${node.alpha})`;
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrame = requestAnimationFrame(render);
    };

    init();
    render();
    window.addEventListener("resize", init);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", init);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNav = (path) => navigate(path);
  const memberName = profile?.name || user?.email?.split("@")[0] || "StyleMate";

  return (
    <div className="landing-page">
      <canvas ref={canvasRef} id="bgCanvas" />

      <nav className={`landing-nav ${scrolled ? "scrolled" : ""}`}>
        <div className="container nav-content">
          <button className="logo-wrap landing-reset-btn" onClick={() => navigate("/")}>
            <span className="logo">STYLEMATE</span>
          </button>

          <div className="nav-actions-cluster">
            <div className="nav-inline-note">AI wardrobe system for sharper everyday dressing</div>
            {user ? (
              <button className="member-chip landing-reset-btn" onClick={() => handleNav("/home")}>
                <span className="member-chip-text">
                  <small>Member</small>
                  <strong>{memberName}</strong>
                </span>
                <span className="member-avatar-shell">
                  {profile?.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="Avatar" />
                  ) : (
                    <span>{memberName[0]?.toUpperCase() || "S"}</span>
                  )}
                </span>
              </button>
            ) : (
              <div className="nav-btns">
                <button className="btn-ghost landing-reset-btn" onClick={() => handleNav("/login")}>Login</button>
                <button className="btn-filled landing-reset-btn" onClick={() => handleNav("/login")}>Start Styling</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="landing-main">
        <section className="hero container">
          <div className="hero-copy">
            <div className="hero-kicker-wrap">
              <span className="hero-label">Precision wardrobe intelligence</span>
              <span className="hero-status-pill">Live AI Styling System</span>
            </div>

            <h1 className="hero-title">
              Build a wardrobe that
              <span className="hero-accent"> thinks ahead.</span>
            </h1>

            <p className="hero-subtext">
              StyleMate turns your wardrobe into a high-context styling system: what you own, what you are missing, what fits your aesthetic, and what deserves a place in rotation next.
            </p>

            <div className="hero-btns">
              <button className="btn-primary landing-reset-btn" onClick={() => handleNav(user ? "/home" : "/login")}>
                {user ? "Open Dashboard" : "Start Styling"}
              </button>
              <button className="btn-secondary landing-reset-btn" onClick={() => handleNav("/discover")}>
                Explore Discover
              </button>
            </div>

            <div className="hero-signal-row">
              {wardrobeSignals.map((signal) => (
                <span key={signal} className="hero-signal-pill">{signal}</span>
              ))}
            </div>
          </div>

          <div className="hero-stage">
            <div className="hero-stage-shell">
              <div className="hero-stage-topline">
                <span className="hero-stage-kicker">Style command view</span>
                <span className="hero-stage-chip">Premium AI model</span>
              </div>

              <div className="hero-stage-grid">
                <div className="hero-stage-portrait">
                  {profile?.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="User model" className="hero-avatar-figure" />
                  ) : (
                    <div className="hero-avatar-placeholder">
                      <div className="placeholder-bust" />
                      <p>Generate your avatar to unlock visual styling previews.</p>
                    </div>
                  )}
                  <div className="portrait-orbit orbit-one" />
                  <div className="portrait-orbit orbit-two" />
                  <div className="portrait-orbit orbit-three" />
                </div>

                <div className="hero-stage-panel">
                  <div className="hero-panel-card primary">
                    <p className="panel-eyebrow">Discover Signal</p>
                    <h3>What should enter the wardrobe next?</h3>
                    <p>Only gap-filling recommendations with styling logic, reasons, and price comparison.</p>
                  </div>

                  <div className="showcase-signal-stack">
                    {showcaseSignals.map((signal, index) => (
                      <div key={signal.title} className={`showcase-signal-card signal-${index + 1}`}>
                        <span className="panel-stat">{signal.title}</span>
                        <span className="panel-copy">{signal.body}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="aesthetic-marquee">
          <div className="aesthetic-track">
            {[...aestheticStrip, ...aestheticStrip].map((item, index) => (
              <span key={`${item}-${index}`} className="aesthetic-track-item">{item}</span>
            ))}
          </div>
        </section>

        <section className="capabilities container">
          <div className="section-heading">
            <p className="section-kicker">System Capabilities</p>
            <h2 className="section-title">A more professional way to manage personal style.</h2>
            <p className="section-description">
              Less random inspiration. More decision support across wardrobe planning, recommendation quality, and personal aesthetic direction.
            </p>
          </div>

          <div className="capabilities-grid">
            {capabilityCards.map((card) => (
              <article key={card.title} className="capability-card">
                <div className="capability-icon-shell">
                  <CapabilityIcon type={card.icon} />
                </div>
                <p className="capability-eyebrow">{card.eyebrow}</p>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="editorial-band container">
          <div className="editorial-band-card">
            <div className="editorial-band-copy">
              <p className="section-kicker">For disciplined styling</p>
              <h2 className="section-title small">From wardrobe chaos to a clear style operating system.</h2>
              <p className="section-description">
                Upload your wardrobe, mark what is complete, unlock Discover, and move into a more accurate recommendation loop shaped by your lifestyle and target aesthetic.
              </p>
            </div>

            <div className="editorial-band-stack">
              <div className="editorial-mini-card">
                <span>01</span>
                <p>Archive your real wardrobe</p>
              </div>
              <div className="editorial-mini-card">
                <span>02</span>
                <p>Unlock Discover with intent</p>
              </div>
              <div className="editorial-mini-card">
                <span>03</span>
                <p>Use Image Architect to refine the end goal</p>
              </div>
            </div>
          </div>
        </section>

        <section className="final-cta container">
          <div className="final-cta-card">
            <p className="section-kicker">Ready when you are</p>
            <h2 className="section-title">Turn the wardrobe into an advantage.</h2>
            <p className="section-description">
              Build a sharper closet, buy more intentionally, and style from a system that actually knows what you own.
            </p>
            <div className="hero-btns cta-actions">
              <button className="btn-primary landing-reset-btn" onClick={() => handleNav(user ? "/home" : "/login")}>
                {user ? "Go to Dashboard" : "Create Your Profile"}
              </button>
              <button className="btn-secondary landing-reset-btn" onClick={() => handleNav("/architect")}>
                Open Image Architect
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="container landing-footer-inner">
          <div>
            <div className="logo footer-logo">STYLEMATE</div>
            <p className="footer-copy">AI fashion direction for wardrobe clarity, stronger taste, and smarter decisions.</p>
          </div>
          <div className="footer-meta">© 2026 StyleMate. Built for modern wardrobe planning.</div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
