import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import { auth, db } from '../firebase/firebase';
import callBackend from '../utils/apiClient';
import { mergeDiscoverState, writeLocalDiscoverState } from '../utils/discoverAccess';
import './ImageArchitect.css';

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ImageArchitect() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [wardrobe, setWardrobe] = useState([]);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [targetAesthetic, setTargetAesthetic] = useState('Quiet Luxury');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        navigate('/login');
        return;
      }

      setUser(firebaseUser);

      let profileData = {};
      try {
        const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (profileSnap.exists()) {
          profileData = profileSnap.data();
          setProfile(profileData);
        } else {
          setProfile({});
        }
      } catch (error) {
        setProfile({});
      }

      const discoverState = mergeDiscoverState(profileData, firebaseUser.uid);
      if (discoverState.targetAesthetic) {
        setTargetAesthetic(discoverState.targetAesthetic);
      }

      try {
        const wardrobeSnap = await getDocs(collection(db, 'users', firebaseUser.uid, 'wardrobe'));
        setWardrobe(wardrobeSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      } catch (error) {
        setWardrobe([]);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const analyzeImage = async () => {
    if (!image || !user) return;
    setLoading(true);
    setError('');

    try {
      const imageBase64 = await toBase64(image);
      const data = await callBackend('/api/image-architect', {
        imageBase64,
        mimeType: image.type,
        targetAesthetic,
        profile: {
          gender: profile?.gender,
          age: profile?.age,
          bodyType: profile?.bodyType,
          skinTone: profile?.skinTone,
          job: profile?.job,
          styleInterests: mergeDiscoverState(profile, user.uid).styleInterests,
          lifestyleNeeds: mergeDiscoverState(profile, user.uid).lifestyleNeeds
        },
        wardrobe: wardrobe.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          color: item.color
        }))
      });

      setResult(data);

      writeLocalDiscoverState(user.uid, {
        ...mergeDiscoverState(profile, user.uid),
        targetAesthetic,
        architectSummary: data.analysis?.summary || ''
      });

      await setDoc(
        doc(db, 'users', user.uid),
        {
          targetAesthetic,
          architectSummary: data.analysis?.summary || '',
          architectAnalysis: data.analysis || {},
          architectOutfitSuggestions: data.outfitSuggestions || []
        },
        { merge: true }
      );
    } catch (err) {
      console.error(err);
      if (result) {
        setError('Analysis completed locally, but Firebase sync is blocked.');
      } else {
        setError(err.message || 'Analysis failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="architect-container">
        <header className="architect-header fade-in-down">
          <div className="architect-header-top">
            <div>
              <h1 className="premium-title">Image Architect</h1>
              <p className="premium-subtitle">Biometric stylist, aesthetic diagnostics, and target-look engineering</p>
            </div>
            <div className="discover-subnav architect-subnav">
              <button type="button" className="discover-subnav-pill" onClick={() => navigate('/discover')}>
                Wardrobe Discover
              </button>
              <button type="button" className="discover-subnav-pill active">Image Architect</button>
            </div>
          </div>
        </header>

        <div className="architect-main-grid">
          <div className="upload-section fade-in-up">
            <div className={`preview-box ${!preview ? 'empty' : ''}`} onClick={() => document.getElementById('fileInput')?.click()}>
              {preview ? <img src={preview} alt="Preview" /> : <span>Upload a reference image</span>}
              <input type="file" id="fileInput" hidden onChange={handleImageChange} accept="image/*" />
            </div>

            <div className="control-group">
              <label>Target Aesthetic</label>
              <select value={targetAesthetic} onChange={(e) => setTargetAesthetic(e.target.value)}>
                <option>Quiet Luxury</option>
                <option>Industrial Techwear</option>
                <option>Scandi-Minimalism</option>
                <option>Old Money</option>
                <option>Avant-Garde</option>
                <option>Streetwear</option>
              </select>
            </div>

            <button className="btn-generate-luxe" onClick={analyzeImage} disabled={!image || loading}>
              {loading ? 'Analyzing Geometry...' : 'Analyze Target Image'}
            </button>
          </div>

          <div className="result-section">
            {!result && !loading && (
              <div className="empty-result fade-in">
                <p>Upload a person you want to become like and StyleMate will break down the visual roadmap to reach that aesthetic.</p>
              </div>
            )}

            {loading && (
              <div className="loading-state fade-in">
                <div className="premium-loader"></div>
                <p>Deconstructing aesthetic leakage...</p>
              </div>
            )}

            {result && (
              <div className="analysis-result fade-in-up">
                <div className="result-card">
                  <h3 className="card-title">Phase 1: Chromatic Mapping</h3>
                  <div className="palette-grid">
                    {(result.analysis?.phase1?.powerPalette || []).map((hex, index) => (
                      <div key={`${hex}-${index}`} className="color-item">
                        <div className="swatch" style={{ background: hex }} />
                        <span className="hex">{hex}</span>
                      </div>
                    ))}
                  </div>
                  <p className="analysis-text"><strong>Undertone:</strong> {result.analysis?.phase1?.undertone}</p>
                  <p className="analysis-text"><strong>Contrast Ratio:</strong> {result.analysis?.phase1?.contrastRatio}</p>
                  <p className="analysis-text">{result.analysis?.phase1?.colorSummary}</p>
                </div>

                <div className="result-card">
                  <h3 className="card-title">Phase 2: Silhouette Gap</h3>
                  <div className="stats-mini-grid">
                    <div className="stat-item">
                      <label>Proportions</label>
                      <span>{result.analysis?.phase2?.proportions}</span>
                    </div>
                    <div className="stat-item">
                      <label>Alignment</label>
                      <span>{result.analysis?.phase2?.shoulderHipAlignment}</span>
                    </div>
                  </div>
                  <p className="analysis-text">{result.analysis?.phase2?.volumeAnalysis}</p>
                  <p className="analysis-text"><strong>Frame Advice:</strong> {result.analysis?.phase2?.frameAdvice}</p>
                  <p className="analysis-text"><strong>Hemline Adjustment:</strong> {result.analysis?.phase2?.hemlineAdvice}</p>
                </div>

                <div className="result-card">
                  <h3 className="card-title">Phase 3: Structural Engineering</h3>
                  <p className="analysis-text"><strong>Face Shape:</strong> {result.analysis?.phase3?.faceShape}</p>
                  <div className="tag-cloud">
                    {(result.analysis?.phase3?.hairstyles || []).map((item, index) => (
                      <span key={`${item}-${index}`} className="tag-luxe">{item}</span>
                    ))}
                  </div>
                  <p className="analysis-text"><strong>Hair & Beard Specs:</strong> {result.analysis?.phase3?.groomingSpecs}</p>
                  <p className="analysis-text"><strong>Biological Goals:</strong> {(result.analysis?.phase3?.muscleFocus || []).join(', ')}</p>
                  <p className="analysis-text">{result.analysis?.phase3?.biologicalGoals}</p>
                </div>

                <div className="result-card">
                  <h3 className="card-title">Phase 4: Missing Link</h3>
                  <div className="links-grid">
                    <div className="link-col">
                      <label>Hardware</label>
                      <ul>{(result.analysis?.phase4?.hardware || []).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
                    </div>
                    <div className="link-col">
                      <label>Footwear</label>
                      <ul>{(result.analysis?.phase4?.footwear || []).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
                    </div>
                  </div>
                  <p className="analysis-text">{result.analysis?.phase4?.missingLinkSummary}</p>
                </div>

                <div className="result-card">
                  <h3 className="card-title">Outfit Suggestions Based On This Analysis</h3>
                  <div className="architect-suggestion-grid">
                    {(result.outfitSuggestions || []).map((item, index) => (
                      <article key={`${item.name}-${index}`} className="architect-suggestion-card">
                        <div className="architect-suggestion-image">
                          <img src={item.fallbackImageUrl} alt={item.name} />
                        </div>
                        <div className="architect-suggestion-copy">
                          <span className="tag-luxe">{item.category}</span>
                          <h4>{item.name}</h4>
                          <p>{item.reason}</p>
                          <p className="architect-upgrade-line">{item.styleUpgrade}</p>
                          <div className="architect-suggestion-actions">
                            <span className="discover-store-chip-price">Approx. {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(item.estimatedPrice || 0)}</span>
                            <button className="premium-button-secondary" onClick={() => navigate('/discover')}>
                              View in Discover
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="summary-card">
                  <h4>Architect's Summary</h4>
                  <p>{result.analysis?.summary}</p>
                </div>
              </div>
            )}

            {error && <div className="error-box">{error}</div>}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
