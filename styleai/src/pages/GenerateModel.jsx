import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, auth } from '../firebase/firebase'
import { useNavigate } from 'react-router-dom'
import { uploadToCloudinary } from '../utils/cloudinary'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL && !window.location.hostname.includes('vercel.app') 
  ? import.meta.env.VITE_BACKEND_URL 
  : ''

export default function GenerateModel() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [avatarBase64, setAvatarBase64] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('loading')
  const [loadingMessage, setLoadingMessage] = useState(
    'Creating your avatar... this takes 60-90 seconds'
  )

  // Wait for Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        console.log('User confirmed:', firebaseUser.uid)
        setUser(firebaseUser)
      } else {
        console.log('No user, redirecting to landing')
        navigate('/')
      }
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [navigate])

  // Fetch profile after user confirmed
  useEffect(() => {
    if (!user) return
    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (!userDoc.exists()) {
          throw new Error('Profile not found. Please complete onboarding first.')
        }
        const data = userDoc.data()
        console.log('Profile loaded:', data)

        if (!data.facePhotoUrl) {
          throw new Error('Face photo not found. Please redo face scan.')
        }

        setProfile({
          gender: data.gender || 'person',
          bodyType: data.bodyType || 'average',
          height: data.height || '170',
          weight: data.weight || '65',
          age: data.age || '20',
          skinTone: data.skinTone || '#f5c5a3',
          faceShape: data.faceShape || 'Oval',
          facePhotoUrl: data.facePhotoUrl
        })
        setProfileLoading(false)
        setStep('ready')
      } catch (err) {
        console.error('Profile error:', err)
        setError(err.message)
        setProfileLoading(false)
      }
    }
    fetchProfile()
  }, [user])

  // Helper: fetch an image URL and convert to base64
  const fetchImageAsBase64 = async (url) => {
    const res = await fetch(url)
    const blob = await res.blob()
    
    // Resize image to speed up upload and processing
    const img = await new Promise((resolve) => {
      const i = new Image()
      i.crossOrigin = "anonymous"
      i.onload = () => resolve(i)
      i.src = URL.createObjectURL(blob)
    })

    const canvas = document.createElement('canvas')
    const MAX_SIZE = 768
    let width = img.width
    let height = img.height

    if (width > height) {
      if (width > MAX_SIZE) {
        height *= MAX_SIZE / width
        width = MAX_SIZE
      }
    } else {
      if (height > MAX_SIZE) {
        width *= MAX_SIZE / height
        height = MAX_SIZE
      }
    }

    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, width, height)

    const b64WithPrefix = canvas.toDataURL('image/jpeg', 0.8)
    const b64 = b64WithPrefix.split(',')[1]
    return { base64: b64, mimeType: 'image/jpeg' }
  }

  const generateAvatar = async () => {
    setError(null)
    setGenerating(true)
    setStep('generating')
    setAvatarUrl(null)
    setLoadingMessage('Preparing your face photo...')

    const GEMINI_MODEL = 'gemini-2.5-flash-image';
    const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyDNsHj_YFjj3naCzxLagUU7IVMFV9fSbTw'

    try {
      if (!GEMINI_API_KEY || GEMINI_API_KEY.length < 10) {
        throw new Error('Valid Gemini API key not found. Please check your environment variables.');
      }
      // Step 1: Fetch user's face photo and convert to base64
      console.log('Fetching face photo:', profile.facePhotoUrl)
      const faceImage = await fetchImageAsBase64(profile.facePhotoUrl)
      console.log('Face photo loaded, mimeType:', faceImage.mimeType)

      setLoadingMessage('Sending your face to Gemini AI...')

      const prompt = `LITERAL BIOMETRIC REPRODUCTION - HEAD TO TOE.
1. FACE IDENTITY: This is a technical 1:1 mapping. Reproduce the EXACT facial features, structure, and identity of the person in the reference photo. ZERO beautification or averaging allowed.
2. FULL BODY VIEW: The image MUST show the entire person from the top of the head down to the shoes.
3. FEET & SHOES: The feet and stylish footwear must be clearly visible in the frame.
4. NO WHITE BORDERS: The studio background must fill the ENTIRE frame. Strictly NO white margins, NO top borders, and NO empty white space at the top of the image.
5. BODY CREDENTIALS:
   - Gender: ${profile.gender}
   - Build: ${profile.bodyType}
   - Height: ${profile.height}cm
   - Weight: ${profile.weight}kg
6. POSE: Standing perfectly straight, facing forward, arms at sides.
7. BACKGROUND: Neutral studio gray.

Ensure the entire body is centered and the face is unmistakably the same individual.`

      // Step 2: Send multimodal request (face photo + prompt) to Gemini
      let response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inlineData: {
                    mimeType: faceImage.mimeType,
                    data: faceImage.base64
                  }
                },
                { text: prompt }
              ]
            }],
            generationConfig: {
              responseModalities: ['IMAGE']
            }
          })
        }
      )

      setLoadingMessage('Gemini is crafting your personalized avatar...')

      if (!response.ok) {
        const errText = await response.text()
        console.error('Gemini error:', errText)
        throw new Error(`Gemini API returned status ${response.status}`)
      }

      const data = await response.json()

      // Step 3: Extract generated image from response
      let imageDataUrl = null
      const candidates = data?.candidates || []
      for (const candidate of candidates) {
        const parts = candidate?.content?.parts || []
        for (const part of parts) {
          if (part?.inlineData?.mimeType?.startsWith('image/')) {
            imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
            break
          }
        }
        if (imageDataUrl) break
      }

      if (!imageDataUrl) {
        throw new Error('Gemini did not return an image. Please try again.')
      }

      setAvatarUrl(imageDataUrl)
      setAvatarBase64(imageDataUrl)
      setGenerating(false)
      setStep('confirm')
      console.log('Avatar ready!')
    } catch (err) {
      console.error('Generation error:', err)
      setError(err.message)
      setGenerating(false)
      setStep('ready')
    }
  }


  const confirmAvatar = async () => {
    setUploading(true)
    setStep('uploading')

    try {
      // Upload to Cloudinary
      const cloudinaryUrl = await uploadToCloudinary(
        avatarBase64,
        'styleai/avatars'
      )
      console.log('Avatar uploaded to Cloudinary:', cloudinaryUrl)

      // Save URL to Firestore
      await setDoc(
        doc(db, 'users', user.uid),
        {
          avatarUrl: cloudinaryUrl,
          avatarGeneratedAt: new Date().toISOString()
        },
        { merge: true }
      )

      console.log('Avatar URL saved to Firestore')
      setStep('done')
      setTimeout(() => navigate('/home'), 2000)
    } catch (err) {
      console.error('Upload error:', err)
      setError(err.message)
      setUploading(false)
      setStep('confirm')
    }
  }

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-gray-200 
            border-t-orange-400 rounded-full animate-spin"/>
          <p className="text-gray-500 text-sm">Checking authentication...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FFFAF2] flex flex-col items-center py-12 px-6 font-['Outfit']">
      <div className="max-w-4xl w-full flex flex-col items-center">
        
        {/* Header Section */}
        <header className="text-center mb-12 fade-in-down">
          <p className="text-[11px] font-bold tracking-[0.4em] uppercase text-[#784854]/50 mb-3">AI Fashion Studio</p>
          <h1 className="text-5xl md:text-6xl font-['Cormorant_Garamond'] font-bold text-[#1A1A1A] mb-4">Your Digital Twin</h1>
          <p className="text-[#666] text-lg font-light max-w-lg mx-auto leading-relaxed">
            Synthesizing a high-fidelity 3D-aware avatar based on your unique biometric profile and physical credentials.
          </p>
        </header>

        <div className="w-full grid md:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Stats & Biometrics */}
          <div className="md:col-span-5 space-y-6 fade-in-up" style={{ animationDelay: '0.1s' }}>
            
            {/* Credentials Card */}
            <div className="bg-white rounded-[32px] p-8 shadow-[0_4px_20px_rgba(120,72,84,0.03)] border border-[#784854]/05">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#784854]/40 mb-6 border-b border-[#784854]/10 pb-4">Physical Credentials</h3>
              <div className="grid grid-cols-2 gap-y-8 gap-x-4">
                {[
                  { label: 'Gender', value: profile?.gender },
                  { label: 'Build', value: profile?.bodyType },
                  { label: 'Height', value: profile?.height + 'cm' },
                  { label: 'Weight', value: profile?.weight + 'kg' },
                  { label: 'Age', value: profile?.age + ' yrs' },
                  { label: 'Shape', value: profile?.faceShape },
                ].map((item, i) => (
                  <div key={i}>
                    <p className="text-[10px] font-bold uppercase text-[#784854]/30 mb-1">{item.label}</p>
                    <p className="font-semibold text-[#1A1A1A] text-base capitalize">{item.value || '—'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Reference Card */}
            <div className="bg-white rounded-[32px] p-6 shadow-[0_4px_20px_rgba(120,72,84,0.03)] border border-[#784854]/05 flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <img src={profile?.facePhotoUrl} alt="Reference" className="w-16 h-16 rounded-full object-cover grayscale-[0.3]" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#784854] rounded-full border-2 border-white flex items-center justify-center text-[8px] text-white">✓</div>
              </div>
              <div>
                <p className="font-bold text-[#1A1A1A] text-sm">Biometric Scan Active</p>
                <p className="text-[#666] text-xs leading-normal">Facial mapping coordinates verified for high-accuracy reconstruction.</p>
              </div>
            </div>
          </div>

          {/* Right Column: Generation Area */}
          <div className="md:col-span-7 fade-in-up" style={{ animationDelay: '0.2s' }}>
            
            {/* Action Area */}
            <div className="bg-white rounded-[40px] p-8 md:p-12 shadow-[0_20px_50px_rgba(120,72,84,0.05)] border border-[#784854]/05 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
              
              {step === 'ready' && !generating && (
                <div className="text-center">
                  <div className="w-20 h-20 bg-[#F9F6F7] rounded-full flex items-center justify-center mx-auto mb-8">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#784854" strokeWidth="1.5">
                      <path d="M12 4V20M20 12L4 12" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <h2 className="text-3xl font-['Cormorant_Garamond'] font-bold text-[#1A1A1A] mb-6">Ready for Synthesis</h2>
                  <button 
                    onClick={generateAvatar} 
                    className="px-12 py-5 rounded-2xl bg-[#1A1A1A] text-white font-bold text-lg hover:bg-[#784854] transition-all shadow-xl hover:shadow-[#784854]/20 active:scale-[0.98]"
                  >
                    Generate My Avatar
                  </button>
                </div>
              )}

              {generating && (
                <div className="flex flex-col items-center gap-8 text-center px-4">
                  <div className="premium-loader"></div>
                  <div>
                    <h3 className="text-2xl font-['Cormorant_Garamond'] font-bold text-[#1A1A1A] mb-2">{loadingMessage}</h3>
                    <p className="text-[#666] text-sm max-w-xs">Our AI is mapping your facial geometry onto a custom-built digital body.</p>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-bold tracking-[0.2em] uppercase text-[#784854]/30">
                    <span className="w-1 h-1 bg-[#784854]/30 rounded-full animate-ping"></span>
                    Neural Engine Active
                  </div>
                </div>
              )}

              {avatarUrl && step === 'confirm' && (
                <div className="w-full flex flex-col items-center">
                  <div className="relative group mb-8">
                    <img src={avatarUrl} alt="Generated Avatar" className="w-64 md:w-72 h-auto aspect-[2/3] object-cover rounded-[32px] shadow-2xl transition-transform duration-700 group-hover:scale-[1.02]" />
                    <div className="absolute inset-0 rounded-[32px] ring-1 ring-inset ring-black/10"></div>
                  </div>
                  <div className="flex flex-col md:flex-row gap-4 w-full">
                    <button onClick={generateAvatar} className="flex-1 py-4 rounded-xl border border-[#1A1A1A]/10 text-[#1A1A1A] font-bold text-sm hover:bg-gray-50 transition-all">Regenerate</button>
                    <button onClick={confirmAvatar} className="flex-[2] py-4 rounded-xl bg-[#1A1A1A] text-white font-bold text-sm hover:bg-[#784854] transition-all shadow-lg">Confirm Identity</button>
                  </div>
                </div>
              )}

              {step === 'uploading' && (
                <div className="flex flex-col items-center gap-6">
                  <div className="premium-loader"></div>
                  <p className="font-bold text-[#1A1A1A] animate-pulse">Syncing to cloud...</p>
                </div>
              )}

              {step === 'done' && (
                <div className="text-center scale-up">
                  <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8 text-3xl shadow-inner">✓</div>
                  <h2 className="text-4xl font-['Cormorant_Garamond'] font-bold text-[#1A1A1A] mb-4">Identity Secured</h2>
                  <p className="text-[#666] mb-8">Redirecting you to your personalized wardrobe experience.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-8 bg-red-50 text-red-700 px-8 py-4 rounded-2xl border border-red-100 font-medium text-sm fade-in">
            {error}
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleUp { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        
        .premium-loader {
          width: 56px;
          height: 56px;
          border: 2px solid #78485410;
          border-top: 2px solid #784854;
          border-radius: 50%;
          animation: spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .fade-in { animation: fadeIn 0.6s ease-out forwards; }
        .fade-in-up { animation: fadeIn 0.8s ease-out forwards; }
        .fade-in-down { animation: fadeIn 0.8s ease-out forwards; }
        .scale-up { animation: scaleUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }

        @media (max-width: 768px) {
          header h1 { font-size: 3rem; }
          .grid { gap: 1.5rem; }
        }
      `}</style>
    </div>
  )
}
