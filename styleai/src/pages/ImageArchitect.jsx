import { useState } from 'react';
import MainLayout from '../components/MainLayout';
import './ImageArchitect.css';

const SYSTEM_PROMPT = `Role: Expert Image Architect and Biometric Stylist.
Objective: Deconstruct the user's uploaded image to identify aesthetic "leakage" and provide a technical roadmap to reach a [Target Aesthetic].

Phase 1: Chromatic & Skin Tone Mapping
- Color Sampling: Extract HEX codes of primary colors in current outfit.
- Undertone Analysis: Determine if Cool, Warm, or Neutral.
- Contrast Ratio: Evaluate contrast between skin/hair and clothing. Suggest "Power Palette" of 5 HEX codes.

Phase 2: Silhouette & Geometric Gap Analysis
- "Rule of Thirds" Check: Analyze vertical proportions (1:1 or 1:2). Suggest hemline adjustments.
- Volume Mapping: Identify where fabric is too "loud" or too "tight".
- Shoulder-to-Hip Alignment: Suggest specific cuts to achieve desired frame.

Phase 3: Grooming & Structural Engineering
- Cranial Geometry: Identify face shape.
- Hair & Beard Interpolation: 3 hairstyle names + Fade Level/Length.
- Biological Goals: 2-3 key muscle groups to develop for target fit.

Phase 4: The "Missing Link" List
- Hardware & Accessories: 3 metal finishes based on skin tone.
- Footwear Anchor: 2 shoe silhouettes.

Output: Return ONLY a valid JSON object with the following structure:
{
  "phase1": { "hexCodes": [], "undertone": "", "powerPalette": [] },
  "phase2": { "proportions": "", "hemlineAdvice": "", "volumeAnalysis": "", "frameAdvice": "" },
  "phase3": { "faceShape": "", "hairstyles": [], "groomingSpecs": "", "muscleFocus": [] },
  "phase4": { "hardware": [], "footwear": [] },
  "summary": ""
}`;

export default function ImageArchitect() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [targetAesthetic, setTargetAesthetic] = useState('Quiet Luxury');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const analyzeImage = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);

    try {
      // Convert image to base64
      const reader = new FileReader();
      reader.readAsDataURL(image);
      reader.onload = async () => {
        const base64Image = reader.result.split(',')[1];
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: `${SYSTEM_PROMPT}\n\nTarget Aesthetic: ${targetAesthetic}` },
                { inline_data: { mime_type: image.type, data: base64Image } }
              ]
            }],
            generationConfig: {
              response_mime_type: "application/json",
            }
          })
        });

        const data = await response.json();
        if (data.candidates && data.candidates[0].content.parts[0].text) {
          const jsonResponse = JSON.parse(data.candidates[0].content.parts[0].text);
          setResult(jsonResponse);
        } else {
          throw new Error('Failed to get analysis');
        }
        setLoading(false);
      };
    } catch (err) {
      console.error(err);
      setError('Analysis failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="architect-container">
        <header className="architect-header fade-in-down">
          <h1 className="premium-title">Image Architect</h1>
          <p className="premium-subtitle">Biometric analysis & aesthetic engineering</p>
        </header>

        <div className="architect-main-grid">
          <div className="upload-section fade-in-up">
            <div className={`preview-box ${!preview ? 'empty' : ''}`} onClick={() => document.getElementById('fileInput').click()}>
              {preview ? <img src={preview} alt="Preview" /> : <span>✦ Upload Full Body Shot</span>}
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

            <button 
              className="btn-generate-luxe" 
              onClick={analyzeImage} 
              disabled={!image || loading}
            >
              {loading ? 'Analyzing Geometry...' : 'Initiate Analysis ✦'}
            </button>
          </div>

          <div className="result-section">
            {!result && !loading && (
              <div className="empty-result fade-in">
                <p>Upload a photo to begin biometric deconstruction.</p>
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
                {/* Phase 1 */}
                <div className="result-card">
                  <h3 className="card-title">Phase 1: Chromatic Mapping</h3>
                  <div className="palette-grid">
                    {result.phase1.powerPalette.map((hex, i) => (
                      <div key={i} className="color-item">
                        <div className="swatch" style={{ background: hex }}></div>
                        <span className="hex">{hex}</span>
                      </div>
                    ))}
                  </div>
                  <p className="analysis-text"><strong>Undertone:</strong> {result.phase1.undertone}</p>
                </div>

                {/* Phase 2 */}
                <div className="result-card">
                  <h3 className="card-title">Phase 2: Silhouette Gap</h3>
                  <div className="stats-mini-grid">
                    <div className="stat-item">
                      <label>Proportions</label>
                      <span>{result.phase2.proportions}</span>
                    </div>
                  </div>
                  <p className="analysis-text">{result.phase2.frameAdvice}</p>
                  <p className="analysis-text"><em>Hemline Adjustment:</em> {result.phase2.hemlineAdvice}</p>
                </div>

                {/* Phase 3 */}
                <div className="result-card">
                  <h3 className="card-title">Phase 3: Structural Engineering</h3>
                  <p className="analysis-text"><strong>Face Shape:</strong> {result.phase3.faceShape}</p>
                  <div className="tag-cloud">
                    {result.phase3.hairstyles.map((h, i) => <span key={i} className="tag-luxe">{h}</span>)}
                  </div>
                  <p className="analysis-text"><strong>Biological Goals:</strong> {result.phase3.muscleFocus.join(', ')}</p>
                </div>

                {/* Phase 4 */}
                <div className="result-card">
                  <h3 className="card-title">Phase 4: The Missing Link</h3>
                  <div className="links-grid">
                    <div className="link-col">
                      <label>Hardware</label>
                      <ul>{result.phase4.hardware.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                    <div className="link-col">
                      <label>Footwear</label>
                      <ul>{result.phase4.footwear.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                  </div>
                </div>

                <div className="summary-card">
                  <h4>Architect's Summary</h4>
                  <p>{result.summary}</p>
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
