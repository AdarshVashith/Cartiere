import { useState } from 'react'
import { uploadToCloudinary } from '../../../utils/cloudinary'
import { generateCleanGarmentImage } from '../../../utils/geminiVto'

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL && !window.location.hostname.includes('vercel.app'))
  ? import.meta.env.VITE_BACKEND_URL 
  : (import.meta.env.PROD ? '' : 'http://127.0.0.1:3001')

export default function UploadClothModal({ onClose, onSave }) {
  const [step, setStep] = useState('upload')
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [detectedDetails, setDetectedDetails] = useState(null)
  const [editableDetails, setEditableDetails] = useState(null)
  const [selectedResult, setSelectedResult] = useState(null)
  const [removedBgUrl, setRemovedBgUrl] = useState(null)
  const [clothName, setClothName] = useState('')
  const [clothCategory, setClothCategory] = useState('Top')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const categories = [
    'Top', 'Bottom', 'Dress', 'Jacket', 
    'Shoes', 'Accessory', 'Suit', 'Sportswear'
  ]

  const activeDetails = editableDetails || detectedDetails

  const analysisEntries = activeDetails?.analysis
    ? [
        ['Suggested Category', activeDetails.suggestedCategory],
        ['Dominant Color', activeDetails.analysis.dominantColor],
        ['Secondary Colors', activeDetails.analysis.secondaryColors?.join(', ')],
        ['Pattern', activeDetails.analysis.pattern],
        ['Material', activeDetails.analysis.material],
        ['Texture', activeDetails.analysis.texture],
        ['Fit', activeDetails.analysis.fit],
        ['Silhouette', activeDetails.analysis.silhouette],
        ['Sleeve Length', activeDetails.analysis.sleeveLength],
        ['Neckline / Collar', activeDetails.analysis.necklineOrCollar],
        ['Hem Details', activeDetails.analysis.hemDetails],
        ['Closure', activeDetails.analysis.closure],
        ['Hardware', activeDetails.analysis.hardware],
        ['Pockets', activeDetails.analysis.pockets],
        ['Stitching', activeDetails.analysis.stitching],
        ['Embellishments', activeDetails.analysis.embellishments],
        ['Season', activeDetails.analysis.season],
        ['Occasions', activeDetails.analysis.occasion?.join(', ')],
        ['Gender Presentation', activeDetails.analysis.genderPresentation],
        ['Confidence Notes', activeDetails.analysis.confidenceNotes]
      ].filter(([, value]) => value && String(value).trim())
    : []

  const updateEditableField = (key, value) => {
    setEditableDetails(prev => ({
      ...(prev || {}),
      [key]: value
    }))
  }

  const updateEditableAnalysisField = (key, value) => {
    setEditableDetails(prev => ({
      ...(prev || {}),
      analysis: {
        ...(prev?.analysis || {}),
        [key]: value
      }
    }))
  }

  // Step 1 — Upload photo to Cloudinary first
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setLoading(true)
    setError(null)
    
    try {
      const url = await uploadToCloudinary(file, 'styleai/cloth-search')
      setUploadedImageUrl(url)
      console.log('Cloth photo uploaded:', url)
      
      // Step 2 — Run visual search
      await runVisualSearch(url)
      
    } catch (err) {
      setError('Upload failed: ' + err.message)
      setLoading(false)
    }
  }

  // Step 2 — Visual search with Google Lens
  const runVisualSearch = async (imageUrl) => {
    try {
      setStep('searching')
      
      const response = await fetch(
        `${BACKEND_URL}/api/visual-search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl })
        }
      )
      
      const data = await response.json()
      if (!data.success) throw new Error(data.error)
      
      setSearchResults(data.results)
      setDetectedDetails(data.details)
      setEditableDetails(data.details)
      setStep('select')
      setLoading(false)
      
    } catch (err) {
      setError('Visual search failed: ' + err.message)
      setLoading(false)
      setStep('upload')
    }
  }

  // Step 3 — Generate high-fidelity clean shot/outfit via Gemini
  const handleSelectResult = async (result = {}, asOutfit = false) => {
    setSelectedResult(result)
    setLoading(true)
    setError(null)
    setStep('generating-clean-shot')
    
    try {
      const garmentDesc = activeDetails?.reconstructionPrompt || activeDetails?.summary || activeDetails?.garment || 'fashion garment';
      
      let finalImgUrl = null;

      if (asOutfit) {
        // Full outfit generation via Pollinations (faster for complex scenes)
        const outfitPrompt = `Complete stylish outfit including ${garmentDesc}, on a professional fashion model, cinematic lighting, 8k resolution, fashion catalog style`;
        finalImgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(outfitPrompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 9999)}`;
      } else {
        console.log('Regenerating cloth-only garment via Gemini Image Generation...');
        const generatedImage = await generateCleanGarmentImage(uploadedImageUrl, garmentDesc);
        const generatedImageUrl = await uploadToCloudinary(generatedImage, 'styleai/wardrobe-generated')
        const removeBgResponse = await fetch(`${BACKEND_URL}/api/remove-bg`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: generatedImageUrl })
        })
        const removeBgData = await removeBgResponse.json()
        finalImgUrl = removeBgData?.success ? removeBgData.dataUrl : generatedImageUrl
      }
      
      const cloudinaryUrl = await uploadToCloudinary(finalImgUrl, 'styleai/wardrobe')
      setRemovedBgUrl(cloudinaryUrl)

      if (activeDetails) {
        setClothName(activeDetails.garment || 'Detected Garment')
        if (categories.includes(activeDetails.suggestedCategory)) {
          setClothCategory(activeDetails.suggestedCategory)
        }
      }

      setStep('details')
      setLoading(false)
      
    } catch (err) {
      console.error('Generation failed:', err)
      setError('Could not generate styling. Using original search result.')
      setRemovedBgUrl(result.imageUrl)
      setStep('details')
      setLoading(false)
    }
  }

  // Step 4 — Save to Firestore
  const handleSave = () => {
    if (!clothName.trim()) {
      setError('Please enter a name for this cloth')
      return
    }
    
    onSave({
      name: clothName,
      category: clothCategory,
      imageUrl: removedBgUrl,
      originalImageUrl: uploadedImageUrl,
      detectedDetails: activeDetails,
      searchQuery: activeDetails?.query || '',
      color: activeDetails?.color || activeDetails?.analysis?.dominantColor || '',
      wearCount: 0,
      wearHistory: [],
      addedAt: new Date().toISOString(),
      lastWorn: null
    })
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 3000
    }}>
      <div className="premium-modal-content" style={{
        background: 'white',
        borderRadius: '32px',
        padding: '32px',
        width: 'min(560px, 95%)',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 40px 100px rgba(0,0,0,0.3)',
        border: '1px solid rgba(0,0,0,0.05)',
        position: 'relative'
      }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 className="premium-title" style={{ fontSize: '24px', margin: 0 }}>Add New Item</h2>
          <button className="close-modal" onClick={onClose}>×</button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '16px', borderRadius: '16px', marginBottom: '24px', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {/* Step 1 — Upload */}
        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4">
            <div 
              style={{
                width: '100%',
                height: '240px',
                border: '2px dashed #E5E7EB',
                borderRadius: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#9CA3AF'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E7EB'}
              onClick={() => document.getElementById('cloth-upload').click()}
            >
              <div style={{ fontSize: '32px' }}>📸</div>
              <p style={{ color: '#6B7280', fontSize: '14px', fontWeight: '500' }}>
                Tap to upload garment photo
              </p>
              <p style={{ color: '#9CA3AF', fontSize: '12px' }}>
                JPG, PNG up to 10MB
              </p>
            </div>
            <input
              id="cloth-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>
        )}

        {/* Step 2 — Searching */}
        {step === 'searching' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="premium-loader"></div>
            <p className="premium-subtitle" style={{ fontSize: '15px' }}>
              Identifying garment details...
            </p>
          </div>
        )}

        {/* Step 3 — Select result */}
        {step === 'select' && (
          <div>
            {activeDetails && (
              <div style={{ marginBottom: '24px', padding: '16px', background: '#F8F1F3', borderRadius: '20px', border: '1px solid rgba(120, 72, 84, 0.1)' }}>
                <p style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--color-mauve)', marginBottom: '12px', letterSpacing: '0.1em' }}>
                  Step 1: Detailed Cloth Analysis
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {activeDetails.brand && <span className="pill-small">🏷️ {activeDetails.brand}</span>}
                  {activeDetails.garment && <span className="pill-small">👗 {activeDetails.garment}</span>}
                  {activeDetails.suggestedCategory && <span className="pill-small">🗂️ {activeDetails.suggestedCategory}</span>}
                  {(activeDetails.color || activeDetails.analysis?.dominantColor) && <span className="pill-small">🎨 {activeDetails.color || activeDetails.analysis?.dominantColor}</span>}
                </div>
                {activeDetails.summary && (
                  <p style={{ margin: '14px 0 0', fontSize: '13px', lineHeight: 1.6, color: '#4B5563' }}>
                    {activeDetails.summary}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-4" style={{ marginBottom: '24px' }}>
              <div className="form-field">
                <label>Detected Garment Name</label>
                <input
                  type="text"
                  value={activeDetails?.garment || ''}
                  onChange={e => updateEditableField('garment', e.target.value)}
                  placeholder="e.g. Navy blue knit polo shirt"
                />
              </div>

              <div className="form-field">
                <label>Analysis Summary</label>
                <textarea
                  value={activeDetails?.summary || ''}
                  onChange={e => {
                    updateEditableField('summary', e.target.value)
                    updateEditableField('reconstructionPrompt', e.target.value)
                  }}
                  placeholder="Edit the overall cloth analysis before generation"
                  rows={5}
                />
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px'
              }}>
                <div className="form-field">
                  <label>Suggested Category</label>
                  <select
                    value={activeDetails?.suggestedCategory || 'Top'}
                    onChange={e => updateEditableField('suggestedCategory', e.target.value)}
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Dominant Color</label>
                  <input
                    type="text"
                    value={activeDetails?.analysis?.dominantColor || ''}
                    onChange={e => updateEditableAnalysisField('dominantColor', e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Pattern</label>
                  <input
                    type="text"
                    value={activeDetails?.analysis?.pattern || ''}
                    onChange={e => updateEditableAnalysisField('pattern', e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Material</label>
                  <input
                    type="text"
                    value={activeDetails?.analysis?.material || ''}
                    onChange={e => updateEditableAnalysisField('material', e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Texture</label>
                  <input
                    type="text"
                    value={activeDetails?.analysis?.texture || ''}
                    onChange={e => updateEditableAnalysisField('texture', e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Fit / Silhouette</label>
                  <input
                    type="text"
                    value={[activeDetails?.analysis?.fit, activeDetails?.analysis?.silhouette].filter(Boolean).join(', ')}
                    onChange={e => {
                      updateEditableAnalysisField('fit', e.target.value)
                      updateEditableAnalysisField('silhouette', e.target.value)
                    }}
                  />
                </div>

                <div className="form-field">
                  <label>Collar / Neckline</label>
                  <input
                    type="text"
                    value={activeDetails?.analysis?.necklineOrCollar || ''}
                    onChange={e => updateEditableAnalysisField('necklineOrCollar', e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Sleeve Length</label>
                  <input
                    type="text"
                    value={activeDetails?.analysis?.sleeveLength || ''}
                    onChange={e => updateEditableAnalysisField('sleeveLength', e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Closure / Hardware</label>
                  <input
                    type="text"
                    value={[activeDetails?.analysis?.closure, activeDetails?.analysis?.hardware].filter(Boolean).join(', ')}
                    onChange={e => {
                      updateEditableAnalysisField('closure', e.target.value)
                      updateEditableAnalysisField('hardware', e.target.value)
                    }}
                  />
                </div>

                <div className="form-field">
                  <label>Hem / Pockets / Stitching</label>
                  <input
                    type="text"
                    value={[
                      activeDetails?.analysis?.hemDetails,
                      activeDetails?.analysis?.pockets,
                      activeDetails?.analysis?.stitching
                    ].filter(Boolean).join(', ')}
                    onChange={e => {
                      updateEditableAnalysisField('hemDetails', e.target.value)
                      updateEditableAnalysisField('pockets', e.target.value)
                      updateEditableAnalysisField('stitching', e.target.value)
                    }}
                  />
                </div>
              </div>

              {analysisEntries.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '10px'
                }}>
                  {analysisEntries.map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #EEE7EA',
                        borderRadius: '16px',
                        padding: '12px 14px'
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9C7B84', fontWeight: 800 }}>
                        {label}
                      </p>
                      <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#1F2937', lineHeight: 1.45 }}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => setStep('upload')}
                className="premium-button-secondary"
                style={{ flex: 1, padding: '12px' }}
              >
                Upload Different
              </button>
              <button
                onClick={() => handleSelectResult({}, false)}
                className="premium-button-primary"
                style={{ flex: 1.5, padding: '12px' }}
              >
                ✦ Generate Cloth Image
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Generating Clean Shot */}
        {step === 'generating-clean-shot' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="premium-loader"></div>
            <p className="premium-subtitle" style={{ fontSize: '15px' }}>
              Step 2: Generating cloth-only image...
            </p>
            <p style={{ fontSize: '12px', color: '#9CA3AF' }}>Gemini is rebuilding the garment, then isolating it from the background</p>
          </div>
        )}

        {/* Step 5 — Enter details */}
        {step === 'details' && (
          <div className="flex flex-col gap-6">
            {removedBgUrl && (
              <div style={{ display: 'flex', justifyContent: 'center', background: '#F9FAFB', borderRadius: '24px', padding: '24px' }}>
                <img
                  src={removedBgUrl}
                  alt="Cloth preview"
                  style={{ height: '200px', objectContain: 'contain' }}
                />
              </div>
            )}
            
            <div className="form-field">
              <label>Cloth Name</label>
              <input
                type="text"
                value={clothName}
                onChange={e => setClothName(e.target.value)}
                placeholder="e.g. Vintage Leather Biker Jacket"
              />
            </div>
            
            <div className="form-field">
              <label>Category</label>
              <select
                value={clothCategory}
                onChange={e => setClothCategory(e.target.value)}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#6B7280' }}>
                Step 3: Category is auto-detected, but you can change it before saving.
              </p>
            </div>
            
            <button
              onClick={handleSave}
              className="premium-button-primary"
              style={{ width: '100%', padding: '16px' }}
            >
              Add to Wardrobe
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
