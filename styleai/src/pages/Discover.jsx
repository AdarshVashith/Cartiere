import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase/firebase'
import { saveToWishlist } from './Wishlist'
import callBackend from '../utils/apiClient'
import MainLayout from '../components/MainLayout';
import { runFrontendVTO } from '../utils/geminiVto';

function buildDiscoverCacheKey(userId, wardrobe, profile) {
  const wardrobeSignature = wardrobe
    .map((item) => `${item.name || ''}|${item.category || ''}|${item.color || ''}`)
    .sort()
    .join('||')
  const profileSignature = [
    profile.gender || '',
    profile.bodyType || '',
    profile.skinTone || '',
    profile.age || ''
  ].join('|')
  return `discover-cache:${userId}:${wardrobeSignature}:${profileSignature}`
}

export default function Discover() {
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL && !window.location.hostname.includes('vercel.app') 
    ? import.meta.env.VITE_BACKEND_URL 
    : ''
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filterCategory, setFilterCategory] = useState('All')
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const [savingId, setSavingId] = useState('')
  const [tryOnItem, setTryOnItem] = useState(null)
  const [tryOnLoading, setTryOnLoading] = useState(false)
  const [tryOnResult, setTryOnResult] = useState(null)
  const [tryOnError, setTryOnError] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)

  const fetchRecommendations = async (firebaseUser) => {
    if (!firebaseUser) return
    setError('')
    try {
      const [profileSnap, wardrobeSnap] = await Promise.all([
        getDoc(doc(db, 'users', firebaseUser.uid)),
        getDocs(collection(db, 'users', firebaseUser.uid, 'wardrobe'))
      ])
      if (!profileSnap.exists()) throw new Error('Profile not found.')
      const wardrobe = wardrobeSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const profile = profileSnap.data()
      setAvatarUrl(profile.avatarUrl || null)
      
      const discoverPayload = {
        wardrobe: wardrobe.map(i => ({ id: i.id, name: i.name, category: i.category, color: i.color })),
        profile: { gender: profile.gender, bodyType: profile.bodyType, skinTone: profile.skinTone, age: profile.age }
      }

      const cacheKey = buildDiscoverCacheKey(firebaseUser.uid, discoverPayload.wardrobe, discoverPayload.profile)
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        setItems(JSON.parse(cached))
        setLoading(false)
        setRefreshing(true)
      }

      const data = await callBackend('/api/discover-items', discoverPayload)
      const nextItems = Array.isArray(data.items) ? data.items : []
      setItems(nextItems)
      localStorage.setItem(cacheKey, JSON.stringify(nextItems))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) { navigate('/login'); return }
      setUser(u)
      await fetchRecommendations(u)
    })
    return () => unsubscribe()
  }, [navigate])

  const handleSaveToWishlist = async (item) => {
    if (!user || savingId === item.name) return
    try {
      setSavingId(item.name)
      await saveToWishlist(user.uid, {
        title: item.name,
        imageUrl: item.imageUrl || item.productImageUrl || '',
        link: item.link || item.productLink || '',
        source: 'Discover',
        category: item.category || 'Accessory',
        brand: item.brand || ''
      })
    } catch (err) {
      setError('Could not save to wishlist.')
    } finally {
      setSavingId('')
    }
  }

  const handleTryOn = async (itemOverride = null) => {
    if (tryOnLoading) return; // Prevent double clicks
    const activeItem = itemOverride || tryOnItem
    if (!activeItem) return;
    
    if (!avatarUrl) {
      setTryOnError('Please create your AI Avatar first to use Virtual Try-On.');
      return;
    }

    setTryOnLoading(true)
    setTryOnResult(null)
    setTryOnError('')
    try {
      const vtoImageUrl = await runFrontendVTO(
        avatarUrl,
        activeItem.productImageUrl || activeItem.imageUrl,
        activeItem.category,
        activeItem.name
      )
      setTryOnResult(vtoImageUrl)
    } catch (err) {
      console.error('TryOn error:', err)
      setTryOnError(err.message || 'Failed to generate try-on')
    } finally {
      setTryOnLoading(false)
    }
  }

  const filteredItems = filterCategory === 'All' ? items : items.filter(i => i.category === filterCategory)

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="premium-loader"></div>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="discover-content-wrap">
        <header className="top-header fade-in-down">
          <div className="greeting-text">
            <h1 className="premium-title">Discover</h1>
            <p className="premium-subtitle">AI-curated recommendations for your unique style</p>
          </div>
        </header>

        <div className="filter-scroll-wrap fade-in-up" style={{ animationDelay: '0.1s' }}>
          {['All', 'Shirt', 'Pant', 'Jacket', 'Shoes', 'Accessory'].map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`filter-pill ${filterCategory === cat ? 'active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {error && (
          <div className="error-banner fade-in">
            {error} <button onClick={() => fetchRecommendations(user)} className="retry-btn">Retry</button>
          </div>
        )}

        <div className="discover-grid-wrap fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="wardrobe-grid-premium">
            {filteredItems.map((item, index) => (
              <article key={index} className="cloth-card-premium">
                <div className="card-img-wrap">
                  <img src={item.productImageUrl || item.imageUrl} alt={item.name} />
                  <div className="card-badge badge-cat" style={{ background: 'var(--teal)', color: 'white' }}>
                    {item.matchScore}% Match
                  </div>
                  <button
                    onClick={() => handleSaveToWishlist(item)}
                    className="card-badge badge-worn"
                    style={{ background: 'white', color: 'var(--mauve)', cursor: 'pointer', border: 'none' }}
                  >
                    {savingId === item.name ? '...' : '♡'}
                  </button>
                </div>
                <div className="card-info">
                  <h4 className="cloth-name" style={{ fontSize: '16px' }}>{item.name}</h4>
                  <p className="cloth-meta" style={{ height: '40px', overflow: 'hidden' }}>{item.reason}</p>
                  <div className="card-actions">
                    <button 
                      onClick={() => window.open(item.productLink || item.link, '_blank')}
                      className="action-btn btn-worn"
                    >
                      Shop · ${item.estimatedPrice}
                    </button>
                    <button 
                      onClick={() => { setTryOnItem(item); handleTryOn(item) }}
                      className="action-btn btn-try"
                    >
                      Try On
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {tryOnItem && (
          <div className="premium-modal-overlay fade-in" onClick={() => setTryOnItem(null)}>
            <div className="premium-modal-content split-view" onClick={e => e.stopPropagation()}>
              <header className="modal-header">
                <div className="modal-header-info">
                  <h2 className="premium-title" style={{ fontSize: '20px' }}>Virtual Fitting Room</h2>
                  <p className="premium-subtitle" style={{ margin: 0 }}>Visualizing {tryOnItem.name}</p>
                </div>
                <button className="close-modal" onClick={() => setTryOnItem(null)}>×</button>
              </header>
              
              <div className="modal-split-body">
                {/* Left side: Product Details */}
                <div className="modal-side product-context">
                  <div className="context-img">
                    <img src={tryOnItem.productImageUrl || tryOnItem.imageUrl} alt={tryOnItem.name} />
                  </div>
                  <div className="context-info">
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>{tryOnItem.name}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--mauve)', opacity: 0.8, lineHeight: '1.5' }}>{tryOnItem.reason}</p>
                    <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <span className="pill-small">${tryOnItem.estimatedPrice}</span>
                      <span className="pill-small">{tryOnItem.category}</span>
                    </div>
                  </div>
                </div>

                {/* Right side: Try-On Result */}
                <div className="modal-side tryon-stage">
                  {tryOnLoading ? (
                    <div className="tryon-loading-state">
                      <div className="premium-loader"></div>
                      <p className="premium-subtitle" style={{ marginTop: '16px' }}>Dressing your avatar...</p>
                    </div>
                  ) : tryOnResult ? (
                    <div className="tryon-result-stage">
                      <img src={tryOnResult} alt="Result" className="result-img" />
                      <div className="result-actions">
                        <button className="premium-button-primary" onClick={() => {
                           const a = document.createElement('a'); a.href = tryOnResult; a.download = 'style-mate-outfit.png'; a.click();
                        }}>Download Look</button>
                      </div>
                    </div>
                  ) : (
                    <div className="tryon-error">
                      <p>{tryOnError || "Ready to generate your look."}</p>
                      {tryOnError.includes('Avatar') ? (
                        <button className="premium-button-primary" style={{ marginTop: '12px' }} onClick={() => navigate('/generate-model')}>Create Avatar</button>
                      ) : (
                        <button className="premium-button-primary" style={{ marginTop: '12px' }} onClick={() => handleTryOn()}>Retry Generation</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
