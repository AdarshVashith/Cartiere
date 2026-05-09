import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/firebase';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import MainLayout from '../components/MainLayout';
import './GenerateOutfit.css';

const OCCASIONS = ['Casual', 'Work', 'Date Night', 'Party', 'Formal', 'Festival', 'Travel', 'Gym', 'Wedding Guest']
const TIMES = ['Morning', 'Afternoon', 'Evening', 'Night']

export default function GenerateOutfit() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ name: 'StyleMate', avatarUrl: '', skinTone: 'neutral', city: '' });
  const [wardrobe, setWardrobe] = useState([]);
  const [weatherData, setWeatherData] = useState({ temp: '--', city: '', icon: '' });
  
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
            city: String(d.city || '')
          });
          
          if (d.city && import.meta.env.VITE_OPENWEATHER_API_KEY) {
            const wRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(d.city)}&appid=${import.meta.env.VITE_OPENWEATHER_API_KEY}&units=metric`);
            const wData = await wRes.json();
            if (wRes.ok && wData.main) {
              setWeatherData({
                temp: String(Math.round(wData.main.temp)),
                city: String(wData.name),
                icon: String(wData.weather[0].icon)
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
          color: String(doc.data().color || '#000000')
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
    setScreen('generating');
    
    try {
      const wardrobeText = wardrobe.map(i => `${i.name} (${i.category})`).join(', ');
      const prompt = `Style Request: ${occasion} look for ${timeOfDay}. 
      Wardrobe: ${wardrobeText}. 
      Skin Tone: ${profile.skinTone}. 
      Weather: ${weatherData.temp}°C. 
      Vibe: ${vibe}. 
      Return JSON: { "outfitName": "string", "styleScore": number, "selectedItems": ["string"], "whyThisWorks": "string", "hairTip": "string" }`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${import.meta.env.VITE_GROQ_API_KEY}` 
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: 'You are a luxury fashion stylist. Respond only with JSON.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' }
        })
      });

      const data = await res.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      
      const matched = (parsed.selectedItems || []).map(name => {
        const found = wardrobe.find(w => w.name.toLowerCase().includes(String(name).toLowerCase()));
        // Strictly return only primitive fields — no Firestore object fields allowed
        if (found) {
          return {
            name: String(found.name || ''),
            category: String(found.category || 'Other'),
            imageUrl: String(found.imageUrl || ''),
            color: String(found.color || '#000000')
          };
        }
        return { name: String(name), category: 'Stylist Choice', imageUrl: '', color: '#000000' };
      });

      setResult({
        outfitName: String(parsed.outfitName || 'Bespoke Look'),
        styleScore: Number(parsed.styleScore || 85),
        whyThisWorks: String(parsed.whyThisWorks || ''),
        hairTip: String(parsed.hairTip || ''),
        items: matched
      });

      setScreen('result');
      
      // Trigger Virtual Try-On — isolated so failures never reset the result screen
      if (profile.avatarUrl) {
        setPreviewLoading(true);
        try {
          const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyDNsHj_YFjj3naCzxLagUU7IVMFV9fSbTw';
          const MODEL = 'gemini-2.5-flash-image'; // Use the fast image generation model
          
          // Helper to fetch images as base64
          const fetchB64 = async (url) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
            const buffer = await res.arrayBuffer();
            const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
            return { inlineData: { mimeType, data: base64 } };
          };

          // Get first 3 garments to stay within multimodal limits
          const garments = matched.filter(i => i.imageUrl).slice(0, 3);
          const [avatarImg, ...clothImgs] = await Promise.all([
            fetchB64(profile.avatarUrl),
            ...garments.map(i => fetchB64(i.imageUrl))
          ]);

          const outfitDesc = matched.map(i => `${i.category}: ${i.name}`).join(', ');
          const prompt = `Task: Photorealistic Virtual Try-On.
Reference Image 1: The person (user's avatar).
Clothing Items: ${outfitDesc}.

Generate a high-resolution professional fashion image of the EXACT person from Reference Image 1 wearing the specified outfit. 
- Preserve facial identity, body shape, and skin tone 100%.
- Background: Clean studio white/gray.
- Full body pose.`;

          const vtoRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    avatarImg,
                    ...clothImgs,
                    { text: prompt }
                  ]
                }],
                generationConfig: { responseModalities: ['IMAGE'] }
              })
            }
          );

          if (!vtoRes.ok) {
            throw new Error(`Gemini VTO failed: ${vtoRes.status}`);
          }

          const vtoData = await vtoRes.json();
          let imageBase64 = null;
          let imageMime = 'image/png';
          
          const candidates = vtoData?.candidates || [];
          for (const cand of candidates) {
            const parts = cand?.content?.parts || [];
            for (const part of parts) {
              if (part?.inlineData?.mimeType?.startsWith('image/')) {
                imageBase64 = part.inlineData.data;
                imageMime = part.inlineData.mimeType;
                break;
              }
            }
            if (imageBase64) break;
          }

          if (imageBase64) {
            setOutfitPreviewUrl(`data:${imageMime};base64,${imageBase64}`);
          }
        } catch (vtoErr) {
          console.warn('Virtual try-on unavailable:', vtoErr.message);
        } finally {
          setPreviewLoading(false);
        }
      }

    } catch (err) {
      console.error("Generation failed:", err);
      setScreen('form');
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
                    <img src={profile.avatarUrl} alt="Your Avatar" className="result-avatar-image" />
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

                  <div className="result-actions-luxe fade-in-up" style={{ animationDelay: '0.3s', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <button onClick={() => setScreen('form')} className="pill-luxe">Try Another</button>
                    <button onClick={() => navigate('/home')} className="btn-generate-luxe" style={{ marginTop: 0, padding: '12px' }}>Save & Exit</button>
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
