import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/firebase';
import { doc, getDoc, getDocs, collection, updateDoc, addDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import MainLayout from '../components/MainLayout';
import callBackend from '../utils/apiClient';
import './GenerateOutfit.css';

const OCCASIONS = ['Casual', 'Work', 'Date Night', 'Party', 'Formal', 'Festival', 'Travel', 'Gym', 'Wedding Guest']
const TIMES = ['Morning', 'Afternoon', 'Evening', 'Night']
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL && !window.location.hostname.includes('vercel.app')
  ? import.meta.env.VITE_BACKEND_URL
  : ''

export default function GenerateOutfit() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ name: 'StyleMate', avatarUrl: '', skinTone: 'neutral', city: '', gender: '', bodyType: '' });
  const [wardrobe, setWardrobe] = useState([]);
  const [weatherData, setWeatherData] = useState({ temp: '--', city: '', icon: '', description: '' });
  
  const [occasion, setOccasion] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('');
  const [destination, setDestination] = useState('');
  const [vibe, setVibe] = useState('');
  
  const [screen, setScreen] = useState('form'); // form, generating, result
  const [result, setResult] = useState({ 
    outfitName: '', 
    styleScore: 0, 
    items: [], 
    whyThisWorks: '', 
    hairTip: '' 
  });
  const [outfitPreviewUrl, setOutfitPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const getPreviewErrorMessage = (message = '') => {
    if (/quota|rate.?limit|429|too many requests/i.test(message)) {
      return 'Virtual try-on is temporarily unavailable right now. Please try again in a little while.';
    }
    return message || 'Virtual try-on preview is unavailable right now.';
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/login');
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const d = userDoc.data();
          setProfile({
            name: String(d.name || 'StyleMate'),
            avatarUrl: String(d.avatarUrl || ''),
            skinTone: String(d.skinTone || 'neutral'),
            city: String(d.city || ''),
            gender: String(d.gender || ''),
            bodyType: String(d.bodyType || '')
          });
          
          if (d.city && import.meta.env.VITE_OPENWEATHER_API_KEY) {
            const wRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(d.city)}&appid=${import.meta.env.VITE_OPENWEATHER_API_KEY}&units=metric`);
            const wData = await wRes.json();
            if (wRes.ok && wData.main) {
              setWeatherData({
                temp: String(Math.round(wData.main.temp)),
                city: String(wData.name),
                icon: String(wData.weather[0].icon),
                description: String(wData.weather[0].description || '')
              });
            }
          }
        }
        
        const wSnap = await getDocs(collection(db, 'users', user.uid, 'wardrobe'));
        setWardrobe(wSnap.docs.map(doc => ({
          id: doc.id,
          name: String(doc.data().name || 'Untitled'),
          category: String(doc.data().category || 'Other'),
          imageUrl: String(doc.data().imageUrl || ''),
          color: String(doc.data().color || '#000000'),
          isFrozen: !!doc.data().isFrozen
        })));
        
        setLoading(false);
      } catch (err) {
        console.error("Data load failed:", err);
        setLoading(false);
      }
    });
    return () => unsub();
  }, [navigate]);

  const handleGenerate = async () => {
    if (!occasion || !timeOfDay) return;
    setOutfitPreviewUrl(null);
    setPreviewError('');
    setScreen('generating');
    
    try {
      const activeWardrobe = wardrobe.filter(i => !i.isFrozen);
      
      const payload = {
        occasion,
        timeOfDay,
        destination: destination || '',
        vibe: vibe || '',
        weather: {
          temp: isNaN(Number(weatherData.temp)) ? 22 : Number(weatherData.temp),
          description: weatherData.description || 'clear sky'
        },
        profile: {
          gender: profile.gender || '',
          bodyType: profile.bodyType || '',
          skinTone: profile.skinTone || 'neutral'
        },
        wardrobe: activeWardrobe.map(item => ({
          id: item.id,
          name: item.name,
          category: item.category,
          color: item.color,
          imageUrl: item.imageUrl
        }))
      };

      const data = await callBackend('/api/generate-outfit', payload);
      
      const matched = (data.items || []).map(item => ({
        id: String(item.id || ''),
        name: String(item.name || ''),
        category: String(item.category || 'Other'),
        imageUrl: String(item.imageUrl || ''),
        color: String(item.color || '#000000')
      }));

      setResult({
        outfitName: String(data.outfitName || 'Bespoke Look'),
        styleScore: Number(data.styleScore || 85),
        whyThisWorks: String(data.whyThisWorks || ''),
        hairTip: String(data.hairTip || ''),
        items: matched
      });

      setScreen('result');
      
      // Trigger Virtual Try-On — use backend for robust pipeline
      if (profile.avatarUrl) {
        setPreviewLoading(true);
        try {
          const vtoRes = await fetch(`${BACKEND_URL}/api/generate-outfit-preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              avatarUrl: profile.avatarUrl,
              items: matched
            })
          });

          const vtoData = await vtoRes.json();
          if (vtoRes.ok && vtoData.success && vtoData.imageUrl) {
            setOutfitPreviewUrl(vtoData.imageUrl);
          } else {
            throw new Error(getPreviewErrorMessage(vtoData.error));
          }
        } catch (vtoErr) {
          console.warn('Virtual try-on unavailable:', vtoErr.message);
          setPreviewError(getPreviewErrorMessage(vtoErr.message));
        } finally {
          setPreviewLoading(false);
        }
      }

    } catch (err) {
      console.error("Generation failed:", err);
      setScreen('form');
    }
  };

  const [feedback, setFeedback] = useState(null); // 'like', 'dislike'

  const handleFeedback = async (type) => {
    setFeedback(type);
    const user = auth.currentUser;
    if (!user) return;

    try {
      if (type === 'like') {
        const feedbackRef = collection(db, 'users', user.uid, 'outfit_feedback');
        await addDoc(feedbackRef, {
          outfitName: result.outfitName,
          items: result.items,
          occasion,
          timeOfDay,
          vibe,
          timestamp: new Date().toISOString(),
          type: 'like'
        });
      }
    } catch (err) {
      console.error("Failed to save feedback:", err);
    }
  };

  const handleMarkAsWorn = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      
      const updatePromises = result.items.map(async (item) => {
        const originalItem = wardrobe.find(w => w.id === item.id) || wardrobe.find(w => w.name === item.name);
        if (originalItem && originalItem.id) {
          const docRef = doc(db, 'users', user.uid, 'wardrobe', originalItem.id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const currentCount = docSnap.data().wearCount || 0;
            await updateDoc(docRef, { 
              wearCount: currentCount + 1,
              lastWorn: new Date().toISOString()
            });
          }
        }
      });
      
      await Promise.all(updatePromises);

      // Save worn outfit to localStorage for Home page (24hr display)
      const wornOutfitData = {
        imageUrl: outfitPreviewUrl || profile.avatarUrl || '',
        outfitName: result.outfitName,
        items: result.items.map(i => ({ name: i.name, category: i.category })),
        timestamp: Date.now()
      };
      localStorage.setItem(`worn-outfit:${user.uid}`, JSON.stringify(wornOutfitData));

      navigate('/home');
    } catch (err) {
      console.error("Failed to update wear count:", err);
      navigate('/home');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5]">
        <div className="premium-loader"></div>
      </div>
    );
  }

  if (screen === 'generating') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', gap: '24px' }}>
        <div className="premium-loader"></div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-editorial)', fontSize: '28px', color: 'var(--text-primary)', marginBottom: '8px' }}>Curating your look</p>
          <p style={{ fontSize: '12px', letterSpacing: '0.3em', color: 'var(--text-secondary)' }}>SYNTHESIZING BESPOKE OUTFIT</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      <div className="outfit-gen-root">
        {screen === 'form' ? (
          <div className="gen-form-stage">
            <header className="gen-editorial-header fade-in-down">
              <h1>Style Request</h1>
              <p>Curating a high-fidelity look tailored to your biometric profile.</p>
            </header>

            <div className="gen-section fade-in-up">
              <h3 className="gen-section-title">The Occasion</h3>
              <div className="filter-grid-luxe">
                {OCCASIONS.map(occ => (
                  <button key={occ} onClick={() => setOccasion(occ)} className={`pill-luxe ${occasion === occ ? 'active' : ''}`}>{occ}</button>
                ))}
              </div>
            </div>

            <div className="gen-section fade-in-up" style={{ animationDelay: '0.1s' }}>
              <h3 className="gen-section-title">Timing</h3>
              <div className="filter-grid-luxe">
                {TIMES.map(t => (
                  <button key={t} onClick={() => setTimeOfDay(t)} className={`pill-luxe ${timeOfDay === t ? 'active' : ''}`}>{t}</button>
                ))}
              </div>
            </div>

            <div className="gen-section fade-in-up" style={{ animationDelay: '0.2s' }}>
              <h3 className="gen-section-title">Context & Vibe</h3>
              <div className="input-group-luxe">
                <input 
                  type="text" 
                  placeholder="Destination (e.g. Paris, Soho, Office)" 
                  className="input-luxe" 
                  value={destination} 
                  onChange={e => setDestination(e.target.value)} 
                />
                <textarea 
                  placeholder="Describe the desired aesthetic... (e.g. minimal, avant-garde, relaxed)" 
                  className="input-luxe" 
                  rows={3} 
                  value={vibe} 
                  onChange={e => setVibe(e.target.value)}
                />
              </div>
            </div>

            {weatherData.temp !== '--' && (
              <div className="weather-chip-luxe fade-in-up" style={{ animationDelay: '0.3s' }}>
                <span>{weatherData.temp}°C in {weatherData.city} · Atmospheric adaptation active</span>
              </div>
            )}

            <button 
              onClick={handleGenerate} 
              className="btn-generate-luxe fade-in-up" 
              style={{ animationDelay: '0.4s' }}
              disabled={!occasion || !timeOfDay}
            >
              Generate Look ✦
            </button>
          </div>
        ) : (
          <div className="gen-result-editorial">
            <header className="gen-editorial-header" style={{ textAlign: 'left', marginBottom: '48px' }}>
              <button onClick={() => setScreen('form')} className="pill-luxe" style={{ marginBottom: '24px' }}>← Back</button>
              <div className="gen-result-root">
                <div className="result-avatar-card fade-in-up">
                  {previewLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '20px', padding: '32px', textAlign: 'center' }}>
                      <div className="premium-loader"></div>
                      <div>
                        <p style={{ fontFamily: 'var(--font-editorial)', fontSize: '22px', color: 'var(--text-primary)', marginBottom: '8px' }}>Dressing your avatar</p>
                        <p style={{ fontSize: '11px', letterSpacing: '0.2em', color: 'var(--text-secondary)' }}>GEMINI AI IS APPLYING YOUR OUTFIT</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '12px' }}>This takes ~20 seconds...</p>
                      </div>
                    </div>
                  ) : outfitPreviewUrl ? (
                    <img src={outfitPreviewUrl} alt="Outfit" className="result-avatar-image" />
                  ) : profile.avatarUrl ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <img src={profile.avatarUrl} alt="Your Avatar" className="result-avatar-image" />
                      {previewError && (
                        <div style={{
                          position: 'absolute',
                          left: '16px',
                          right: '16px',
                          bottom: '16px',
                          padding: '12px 14px',
                          borderRadius: '14px',
                          background: 'rgba(255,255,255,0.92)',
                          border: '1px solid rgba(120, 72, 84, 0.14)',
                          boxShadow: '0 12px 30px rgba(31, 41, 55, 0.12)'
                        }}>
                          <p style={{ margin: 0, fontSize: '10px', letterSpacing: '0.18em', fontWeight: 700, color: 'var(--accent)' }}>PREVIEW UNAVAILABLE</p>
                          <p style={{ margin: '6px 0 0', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-primary)' }}>{previewError}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '40px 32px' }}>
                      {/* Top decorative accent */}
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.3em', color: 'var(--accent)', marginBottom: '24px' }}>YOUR LOOK</p>
                        <h3 style={{ fontFamily: 'var(--font-editorial)', fontSize: '36px', fontWeight: 600, lineHeight: 1.2, color: 'var(--text-primary)', marginBottom: '8px' }}>{result.outfitName}</h3>
                        <div style={{ width: '40px', height: '2px', background: 'var(--accent)', margin: '20px auto' }}></div>
                      </div>

                      {/* Items list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center' }}>
                        {result.items.map((item, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: 'rgba(255,255,255,0.6)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--bg-secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                              </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '2px' }}>{item.category}</p>
                              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Score at bottom */}
                      <div style={{ textAlign: 'center', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                        <p style={{ fontSize: '32px', fontFamily: 'var(--font-editorial)', fontWeight: 600, color: 'var(--text-primary)' }}>{result.styleScore}<span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>%</span></p>
                        <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: 'var(--text-secondary)', fontWeight: 700 }}>STYLE RESONANCE</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="result-info-panel">
                  <div className="result-header-editorial fade-in-up">
                    <span className="score-badge-inline">{result.styleScore}% STYLE RESONANCE</span>
                    <h2 style={{ fontFamily: 'var(--font-editorial)', fontSize: '48px', margin: '8px 0', lineHeight: 1.1 }}>{result.outfitName}</h2>
                  </div>

                  <div className="items-grid-luxe fade-in-up" style={{ animationDelay: '0.1s' }}>
                    {result.items.map((item, i) => (
                      <div key={i} className="item-card-mini">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} />
                        ) : (
                          <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                          </div>
                        )}
                        <div className="item-card-info">
                          <p className="cat">{item.category}</p>
                          <p className="name">{item.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="stylist-note-luxe fade-in-up" style={{ animationDelay: '0.2s' }}>
                    <h4 style={{ fontFamily: 'var(--font-editorial)', fontSize: '24px', marginBottom: '12px' }}>Stylist's Note</h4>
                    <p style={{ color: 'var(--text-primary)', lineHeight: '1.7', fontSize: '15px' }}>{result.whyThisWorks}</p>
                    
                    <div className="hair-tip-luxe" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px' }}>
                      <span style={{ fontSize: '20px' }}>💇</span>
                      <div>
                        <p className="cat" style={{ marginBottom: '2px', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)' }}>HAIR & GROOMING</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{result.hairTip}</p>
                      </div>
                    </div>
                  </div>

                  <div className="result-feedback-luxe fade-in-up" style={{ animationDelay: '0.25s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', margin: '20px 0', padding: '16px', background: 'rgba(255,255,255,0.4)', borderRadius: '20px', border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', margin: 0 }}>Love this look?</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        onClick={() => handleFeedback('dislike')} 
                        style={{ 
                          width: '44px', height: '44px', borderRadius: '50%', border: '1px solid var(--border)', 
                          background: feedback === 'dislike' ? '#FF4B4B' : 'white', 
                          color: feedback === 'dislike' ? 'white' : '#FF4B4B',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.3s'
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7L2 14c0 1.1.9 2 2 2h6zM21 2h-3v9h3V2z"/></svg>
                      </button>
                      <button 
                        onClick={() => handleFeedback('like')} 
                        style={{ 
                          width: '44px', height: '44px', borderRadius: '50%', border: '1px solid var(--border)', 
                          background: feedback === 'like' ? '#00B894' : 'white', 
                          color: feedback === 'like' ? 'white' : '#00B894',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.3s'
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                      </button>
                    </div>
                  </div>

                  <div className="result-actions-luxe fade-in-up" style={{ animationDelay: '0.3s', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <button onClick={() => setScreen('form')} className="pill-luxe">Try Another</button>
                    <button onClick={handleMarkAsWorn} className="btn-generate-luxe" style={{ marginTop: 0, padding: '12px' }}>Mark as Worn ✦</button>
                  </div>
                </div>
              </div>
            </header>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
