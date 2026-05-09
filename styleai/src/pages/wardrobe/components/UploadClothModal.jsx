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
      // Use the full technical description (material/details) for the highest fidelity generation
      const garmentDesc = detectedDetails?.material || detectedDetails?.garment || 'fashion garment';
      
      let finalImgUrl = null;

      if (asOutfit) {
        // Full outfit generation via Pollinations (faster for complex scenes)
        const outfitPrompt = `Complete stylish outfit including ${garmentDesc}, on a professional fashion model, cinematic lighting, 8k resolution, fashion catalog style`;
        finalImgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(outfitPrompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 9999)}`;
      } else {
        // High-fidelity EXACT garment generation via Gemini
        console.log('Regenerating garment with Gemini Image Generation...');
        finalImgUrl = await generateCleanGarmentImage(uploadedImageUrl, garmentDesc);
      }
      
      const cloudinaryUrl = await uploadToCloudinary(finalImgUrl, 'styleai/wardrobe')
      setRemovedBgUrl(cloudinaryUrl)

      if (detectedDetails) {
        if (detectedDetails.brand && detectedDetails.garment) {
          setClothName(`${detectedDetails.brand} ${detectedDetails.garment}`)
        } else if (detectedDetails.garment) {
          setClothName(detectedDetails.garment)
        }
        
        const matchedCat = categories.find(c => 
          detectedDetails.garment?.toLowerCase().includes(c.toLowerCase())
        )
        if (matchedCat) setClothCategory(matchedCat)
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
      <div style={{
        background: 'white',
        borderRadius: '32px',
        padding: '32px',
        width: '100%',
        maxWidth: '560px',
        margin: '0 20px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 40px 100px rgba(0,0,0,0.3)',
        border: '1px solid rgba(0,0,0,0.05)'
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
            {detectedDetails && (
              <div style={{ marginBottom: '24px', padding: '16px', background: '#F8F1F3', borderRadius: '20px', border: '1px solid rgba(120, 72, 84, 0.1)' }}>
                <p style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--color-mauve)', marginBottom: '12px', letterSpacing: '0.1em' }}>
                  AI Analysis Results
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {detectedDetails.brand && <span className="pill-small">🏷️ {detectedDetails.brand}</span>}
                  {detectedDetails.garment && <span className="pill-small">👗 {detectedDetails.garment}</span>}
                  {detectedDetails.material && <span className="pill-small">🧵 {detectedDetails.material}</span>}
                </div>
              </div>
            )}

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
                ✦ Generate Outfit
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Generating Clean Shot */}
        {step === 'generating-clean-shot' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="premium-loader"></div>
            <p className="premium-subtitle" style={{ fontSize: '15px' }}>
              Generating professional studio shot...
            </p>
            <p style={{ fontSize: '12px', color: '#9CA3AF' }}>Creating model-less clean image</p>
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
