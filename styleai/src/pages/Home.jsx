import { useEffect, useState, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/firebase";
import "./Home.css";

const NavItem = ({ icon, label, active = false, onClick }) => (
  <div className={`nav-icon-item ${active ? 'active' : ''}`} onClick={onClick}>
    <div className="icon-wrapper">{icon}</div>
    <span className="sidebar-tooltip">{label}</span>
  </div>
);

import MainLayout from '../components/MainLayout';

function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [weather, setWeather] = useState({ temp: 24, icon: "01d", city: "Delhi", desc: "Clear Sky" });

  const todayStr = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  }, []);

  useEffect(() => {
    const hr = new Date().getHours();
    if (hr < 12) setGreeting("Good morning");
    else if (hr < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  // Weather Fetch
  useEffect(() => {
    const fetchWeather = async (lat, lon) => {
      try {
        const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`);
        const data = await res.json();
        if (data.main) {
          setWeather({
            temp: Math.round(data.main.temp),
            icon: data.weather[0].icon,
            city: data.name,
            desc: data.weather[0].main
          });
        }
      } catch (err) {
        console.error("Weather fetch failed:", err);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(28.6139, 77.2090) // Fallback to Delhi
      );
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        navigate('/login');
        return;
      }
      setUser(u);
      
      try {
        const { getDocs, collection } = await import('firebase/firestore');
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        
        if (userDoc.exists()) {
          const p = userDoc.data();
          setProfile(p);
          
          // Fetch wardrobe count to calculate dynamic style score
          const wardrobeSnap = await getDocs(collection(db, 'users', u.uid, 'wardrobe'));
          const itemCount = wardrobeSnap.size;
          
          // Calculate score: 10 points per item, max 100
          const calculatedScore = Math.min(Math.round(itemCount * 12.5), 100);
          setScore(calculatedScore);
        }
      } catch (err) {
        console.error("Error fetching home data:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="premium-loader"></div>
      </div>
    );
  }

  const handleRefresh = () => {
    setSpinning(true);
    setTimeout(() => setSpinning(false), 600);
  };

  return (
    <MainLayout>
      <div className="home-editorial-root">
        {/* Editorial Greeting */}
        <header className="home-editorial-header fade-in-down">
          <h1 className="editorial-greeting">{greeting}, {profile?.name || 'StyleMate'}</h1>
          <p className="editorial-subtitle">{todayStr} · Your daily style sync</p>
        </header>

        <div className="editorial-grid">
          {/* Main Content Column (60%) */}
          <div className="editorial-main-col">
            <div className="card outfit-hero-card fade-in-up">
              <div className="outfit-badge-floating">TODAY'S LOOK</div>
              
              <div className="outfit-image-wrapper">
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="Avatar" className="outfit-hero-avatar" />
                ) : (
                  <div className="avatar-placeholder-editorial">
                    <button onClick={() => navigate('/generate-model')}>✦ Generate Digital Twin</button>
                  </div>
                )}
                <div className="grain-overlay"></div>
              </div>

              <div className="outfit-details-editorial">
                <div className="outfit-header-row">
                  <div>
                    <h2 className="outfit-title">Smart Casual</h2>
                    <span className="occasion-pill">OFFICE & MEETINGS</span>
                  </div>
                  <button className="save-look-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
                  </button>
                </div>

                <div className="items-list-editorial">
                  {[
                    { name: "Black Sweatshirt", cat: "TOPS", col: "#1A1A1A" },
                    { name: "Olive Jacket", cat: "OUTERWEAR", col: "#556B2F" },
                    { name: "Blue Jeans", cat: "BOTTOMS", col: "#1C4D8A" }
                  ].map((it, idx) => (
                    <div className="item-editorial-row" key={idx}>
                      <div className="item-dot" style={{ backgroundColor: it.col }}></div>
                      <span className="item-name">{it.name}</span>
                      <span className="item-cat-label">{it.cat}</span>
                    </div>
                  ))}
                </div>

                <div className="outfit-actions-editorial">
                  <button className="btn-primary-luxe" onClick={() => navigate('/generate-outfit')}>
                    Generate New Outfit
                  </button>
                  <button className="btn-secondary-luxe" onClick={() => navigate('/wardrobe')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mr-2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    Virtual Try-on
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Column (40%) */}
          <div className="editorial-side-col">
            {/* Weather Widget */}
            <div className="card weather-glass-card fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="weather-top">
                <div className="weather-temp-main">
                  {weather.temp}<span className="unit">°</span>
                </div>
                <div className="weather-meta">
                  <div className="condition-icon">{weather.desc.toLowerCase().includes('clear') ? "☀" : "⛅"}</div>
                  <div className="city-name">{weather.city}</div>
                </div>
              </div>
              <p className="weather-hint">Refined for a light jacket today.</p>
              
              <div className="forecast-strip">
                {[
                  { day: "THU", temp: "22°", icon: "☀" },
                  { day: "FRI", temp: "19°", icon: "☁" },
                  { day: "SAT", temp: "24°", icon: "☀" }
                ].map((f, i) => (
                  <div key={i} className="forecast-item">
                    <span className="f-day">{f.day}</span>
                    <span className="f-icon">{f.icon}</span>
                    <span className="f-temp">{f.temp}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Style Score Card */}
            <div className="card style-score-card fade-in-up" style={{ animationDelay: '0.2s' }}>
              <h3 className="card-label-caps">STYLE SCORE</h3>
              <div className="score-ring-wrapper">
                <svg viewBox="0 0 100 100" className="score-ring-svg">
                  <circle className="ring-bg" cx="50" cy="50" r="45" />
                  <circle 
                    className="ring-fill" 
                    cx="50" cy="50" r="45" 
                    style={{ strokeDashoffset: 283 - (283 * score) / 100 }}
                  />
                </svg>
                <div className="score-value-display">
                  <span className="score-num">{score}</span>
                  <span className="score-label">Points</span>
                </div>
              </div>
              <div className="score-badge-luxe">
                {score >= 75 ? "STYLE ICON ★" : score >= 30 ? "TRENDSETTER ✦" : "STYLE EXPLORER ✧"}
              </div>
              <p className="score-suggestion">
                {score === 0 
                  ? "Add items to your wardrobe to calculate your style resonance." 
                  : score < 50 
                    ? "Great start! Add a few more pieces to unlock better AI outfit generation."
                    : score < 100
                      ? "Your wardrobe is looking solid. Add 2 more neutral tops to optimize your rotation."
                      : "Maximum style resonance achieved! Your AI stylist has complete understanding of your aesthetic."
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default Home;
