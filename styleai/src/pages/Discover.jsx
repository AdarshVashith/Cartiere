import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase/firebase'
import { saveToWishlist } from './Wishlist'
import callBackend from '../utils/apiClient'
import MainLayout from '../components/MainLayout';
import { runFrontendVTO } from '../utils/geminiVto';
import { mergeDiscoverState } from '../utils/discoverAccess';

function buildDiscoverCacheKey(userId, wardrobe, profile) {
  const wardrobeSignature = wardrobe
    .map((item) => `${item.name || ''}|${item.category || ''}|${item.color || ''}`)
    .sort()
    .join('||')
  const profileSignature = [
    profile.gender || '',
    profile.bodyType || '',
    profile.skinTone || '',
    profile.age || '',
    (profile.styleInterests || []).join(','),
    (profile.lifestyleNeeds || []).join(','),
    profile.targetAesthetic || '',
    profile.architectSummary || ''
  ].join('|')
  return `discover-cache:v4:${userId}:${wardrobeSignature}:${profileSignature}`
}

function formatInr(value) {
  const amount = Number(value) || 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount)
}

function getDiscoverImage(item) {
  return item.productImageUrl || item.imageUrl || item.fallbackImageUrl || ''
}

function handleDiscoverImageError(event, item) {
  const fallback = item.fallbackImageUrl || ''
  if (fallback && event.currentTarget.src !== fallback) {
    event.currentTarget.src = fallback
    return
  }

  event.currentTarget.src = `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
      <rect width="600" height="800" fill="#f7f2f3"/>
      <rect x="90" y="120" width="420" height="560" rx="28" fill="#ffffff" stroke="#e7d9dd"/>
      <text x="300" y="380" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#7a5f68">StyleMate</text>
      <text x="300" y="425" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#9b8a90">Image unavailable</text>
    </svg>
  `)}`
}

import './Discover.css';

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
  const [selectedItem, setSelectedItem] = useState(null)
  const [tryOnLoading, setTryOnLoading] = useState(false)
  const [tryOnResult, setTryOnResult] = useState(null)
  const [tryOnError, setTryOnError] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [maxBudget, setMaxBudget] = useState(5000)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [discoverProfile, setDiscoverProfile] = useState(null)
  const [discoverReady, setDiscoverReady] = useState(true)

  const fetchRecommendations = async (firebaseUser) => {
    if (!firebaseUser) return
    setError('')
    try {
      let profile = {}
      let wardrobe = []

      try {
        const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid))
        if (profileSnap.exists()) {
          profile = profileSnap.data()
        }
      } catch (readError) {
        console.warn('Discover profile fallback:', readError)
      }

      try {
        const wardrobeSnap = await getDocs(collection(db, 'users', firebaseUser.uid, 'wardrobe'))
        wardrobe = wardrobeSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      } catch (readError) {
        console.warn('Discover wardrobe fallback:', readError)
      }

      const discoverState = mergeDiscoverState(profile, firebaseUser.uid)
      setDiscoverProfile(profile)
      setDiscoverReady(discoverState.isWardrobeComplete)
      setAvatarUrl(profile.avatarUrl || null)

      if (!discoverState.isWardrobeComplete) {
        setItems([])
        setError('Confirm your full wardrobe in Wardrobe before Discover unlocks.')
        return
      }
      
      const discoverPayload = {
        wardrobe: wardrobe.map(i => ({ id: i.id, name: i.name, category: i.category, color: i.color })),
        profile: {
          gender: profile.gender,
          bodyType: profile.bodyType,
          skinTone: profile.skinTone,
          age: profile.age,
          name: profile.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'StyleMate user',
          job: profile.job || '',
          city: profile.city || '',
          styleInterests: discoverState.styleInterests,
          lifestyleNeeds: discoverState.lifestyleNeeds,
          targetAesthetic: discoverState.targetAesthetic,
          architectSummary: discoverState.architectSummary
        },
        maxBudget
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
  }, [navigate, maxBudget])

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
    if (tryOnLoading) return;
    const activeItem = itemOverride || tryOnItem || selectedItem
    if (!activeItem) return;
    
    if (!avatarUrl) {
      setTryOnError('Please create your AI Avatar first.');
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

  const filteredItems = (filterCategory === 'All' ? items : items.filter(i => i.category === filterCategory))
    .filter((item) => {
      const comparablePrice = Number(item.bestPrice || item.estimatedPrice || 0)
      return comparablePrice <= maxBudget
    })

  const openItemDetail = (item) => {
    setSelectedItem(item)
    setTryOnItem(item)
    setTryOnResult(null)
    setTryOnError('')
  }

  const closeItemDetail = () => {
    setSelectedItem(null)
    setTryOnItem(null)
    setTryOnResult(null)
    setTryOnError('')
  }

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
        <header className="discover-header fade-in-down">
          <div className="discover-title-section">
            <h1 className="premium-title">Discover</h1>
            <p className="premium-subtitle">AI-curated recommendations for your unique style</p>
          </div>
          <div className="header-actions">
             {refreshing && <span className="refresh-status">Updating...</span>}
          </div>
        </header>

        <div className="discover-subnav fade-in-up" style={{ animationDelay: '0.06s' }}>
          <button type="button" className="discover-subnav-pill active">Wardrobe Discover</button>
          <button type="button" className="discover-subnav-pill" onClick={() => navigate('/architect')}>
            Image Architect
          </button>
        </div>

        {!discoverReady && (
          <section className="discover-gate-card fade-in-up" style={{ animationDelay: '0.08s' }}>
            <div>
              <p className="discover-budget-kicker">Discover Locked</p>
              <h3 className="discover-budget-title">Confirm your full wardrobe to unlock recommendations</h3>
              <p className="premium-subtitle">
                StyleMate only opens Discover after you confirm this is your full wardrobe. That lets the model correctly detect gaps, interests, and missing outfit categories.
              </p>
              <div className="discover-gate-points">
                <span>Full wardrobe confirmation</span>
                <span>Interest-driven recommendations</span>
                <span>More accurate wardrobe gap detection</span>
              </div>
            </div>
            <button className="premium-button-primary" onClick={() => navigate('/wardrobe')}>
              Complete Wardrobe Setup
            </button>
          </section>
        )}

        {discoverReady && <div className="filter-scroll-wrap fade-in-up" style={{ animationDelay: '0.1s' }}>
          {['All', 'Shirt', 'Pant', 'Jacket', 'Shoes', 'Accessory'].map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`filter-pill ${filterCategory === cat ? 'active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>}

        {discoverReady && <section className={`discover-budget-bar fade-in-up ${budgetOpen ? 'budget-open' : ''}`} style={{ animationDelay: '0.12s' }}>
          <div className="discover-budget-header" onClick={() => setBudgetOpen(prev => !prev)}>
            <div>
              <p className="discover-budget-kicker">Budget Filter</p>
              <h3 className="discover-budget-title budget-desktop-only">Show only recommendations within your spending limit</h3>
              <h3 className="discover-budget-title budget-mobile-only">Budget: {formatInr(maxBudget)}</h3>
            </div>
            <div className="discover-budget-value budget-desktop-only">{formatInr(maxBudget)}</div>
            <span className="budget-toggle-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
          <div className="discover-budget-body">
            <input
              type="range"
              min="1000"
              max="20000"
              step="500"
              value={maxBudget}
              onChange={(e) => setMaxBudget(Number(e.target.value))}
              className="discover-budget-range"
            />
            <div className="discover-budget-presets">
              {[2000, 5000, 10000, 15000].map((budget) => (
                <button
                  key={budget}
                  type="button"
                  onClick={() => setMaxBudget(budget)}
                  className={`discover-budget-pill ${maxBudget === budget ? 'active' : ''}`}
                >
                  {formatInr(budget)}
                </button>
              ))}
            </div>
            {!!discoverProfile && (
              <div className="discover-context-strip">
                <span>{mergeDiscoverState(discoverProfile, user?.uid).styleInterests.join(' • ') || 'General style refinement'}</span>
                <span>{mergeDiscoverState(discoverProfile, user?.uid).lifestyleNeeds.join(' • ') || 'Daily wardrobe needs'}</span>
                <span>{mergeDiscoverState(discoverProfile, user?.uid).targetAesthetic || 'Quiet Luxury'}</span>
              </div>
            )}
          </div>
        </section>}

        {error && (
          <div className="error-banner fade-in">
            {error} <button onClick={() => fetchRecommendations(user)} className="retry-btn">Retry</button>
          </div>
        )}

        {discoverReady && <div className="discover-grid-wrap fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="wardrobe-grid-premium">
            {filteredItems.map((item, index) => (
              <article key={index} className="discover-card" onClick={() => openItemDetail(item)}>
                <div className="discover-img-wrap">
                  <img
                    src={getDiscoverImage(item)}
                    alt={item.name}
                    onError={(event) => handleDiscoverImageError(event, item)}
                  />
                  <div className="match-badge">
                    {item.matchScore}% Match
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSaveToWishlist(item)
                    }}
                    className="wishlist-btn"
                  >
                    {savingId === item.name ? '...' : '♡'}
                  </button>
                </div>
                <div className="discover-info">
                  <h4 className="item-name">{item.name}</h4>
                  <p className="item-reason">{item.reason}</p>
                  <div className="discover-meta-row">
                    <span className="discover-mini-pill">{item.category}</span>
                    <span className="discover-mini-pill">{item.confidence || item.matchScore}% confidence</span>
                  </div>
                   <div className="discover-store-chip-row">
                    {(item.stores || []).slice(0, 3).map((store, idx) => (
                      <a
                        key={`${store.store}-${idx}`}
                        href={store.link}
                        target="_blank"
                        rel="noreferrer"
                        className="discover-store-chip"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="discover-store-chip-name">{store.store}</span>
                        <span className="discover-store-chip-price">{store.price || 'View'}</span>
                      </a>
                    ))}
                  </div>
                  <div className="discover-actions">
                    <a 
                      href={item.productLink || item.link || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="discover-btn btn-shop"
                      style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.priceLabel || formatInr(item.estimatedPrice || 0)}
                    </a>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        openItemDetail(item)
                        handleTryOn(item)
                      }}
                      className="discover-btn btn-vto"
                    >
                      Try On ✦
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>}

        {selectedItem && (
          <div className="premium-modal-overlay fade-in" onClick={closeItemDetail}>
            <div className="premium-modal-content split-view" onClick={e => e.stopPropagation()}>
              <header className="modal-header">
                <div className="modal-header-info">
                  <h2 className="premium-title" style={{ fontSize: '20px' }}>{selectedItem.name}</h2>
                  <p className="premium-subtitle" style={{ margin: 0 }}>Why it was recommended and where to buy it</p>
                </div>
                <button className="close-modal" onClick={closeItemDetail}>×</button>
              </header>
              
              <div className="modal-split-body">
                <div className="modal-side product-context">
                  <div className="context-img">
                    <img
                      src={getDiscoverImage(selectedItem)}
                      alt={selectedItem.name}
                      onError={(event) => handleDiscoverImageError(event, selectedItem)}
                    />
                  </div>
                  <div className="context-info">
                    <div className="discover-detail-topline">
                      <span className="pill-small">{selectedItem.category}</span>
                      <span className="pill-small">{selectedItem.matchScore}% match</span>
                      <span className="pill-small">{selectedItem.confidence || selectedItem.matchScore}% confidence</span>
                    </div>
                    <h3 className="discover-detail-heading">Why this appears in Discover</h3>
                    <p className="discover-detail-copy">{selectedItem.reason}</p>

                    <div className="discover-detail-section">
                      <h4>Wardrobe Gap</h4>
                      <p>{selectedItem.wardrobeGap}</p>
                    </div>

                    <div className="discover-detail-section">
                      <h4>Style Benefit</h4>
                      <p>{selectedItem.styleBenefit}</p>
                    </div>

                    <div className="discover-detail-section">
                      <h4>Personality Match</h4>
                      <p>{selectedItem.personalityFit}</p>
                    </div>

                    <div className="discover-detail-section">
                      <h4>Styling Logic</h4>
                      <p>{selectedItem.outfitLogic}</p>
                    </div>

                    {!!selectedItem.pairWith?.length && (
                      <div className="discover-detail-section">
                        <h4>Pairs Well With</h4>
                        <div className="discover-chip-row">
                          {selectedItem.pairWith.map((pairing, idx) => (
                            <span key={`${pairing}-${idx}`} className="pill-small">{pairing}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {!!selectedItem.occasions?.length && (
                      <div className="discover-detail-section">
                        <h4>Best For</h4>
                        <div className="discover-chip-row">
                          {selectedItem.occasions.map((occasion, idx) => (
                            <span key={`${occasion}-${idx}`} className="pill-small">{occasion}</span>
                          ))}
                        </div>
                      </div>
                    )}

                     <div className="discover-detail-section">
                      <h4>Price Comparison</h4>
                      <div className="discover-store-list">
                        {(selectedItem.stores?.length ? selectedItem.stores : [{
                          store: selectedItem.productSource || 'Shop',
                          title: selectedItem.name,
                          link: selectedItem.productLink || selectedItem.link || '#',
                          price: selectedItem.priceLabel || formatInr(selectedItem.estimatedPrice || 0)
                        }]).map((store, idx) => (
                          <a
                            key={`${store.store}-${idx}`}
                            href={store.link}
                            target="_blank"
                            rel="noreferrer"
                            className="discover-store-card"
                          >
                            <div>
                              <p className="discover-store-name">{store.store}</p>
                              <p className="discover-store-title">{store.title}</p>
                              {store.delivery ? <p className="discover-store-delivery">{store.delivery}</p> : null}
                            </div>
                            <div className="discover-store-price-block">
                              <span className="discover-store-price">{store.price || 'View price'}</span>
                              <span className="discover-store-cta">Buy</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>

                    <div className="discover-detail-actions">
                      <button
                        onClick={() => handleSaveToWishlist(selectedItem)}
                        className="premium-button-secondary"
                      >
                        {savingId === selectedItem.name ? 'Saving...' : 'Save to Wishlist'}
                      </button>
                      <button
                        onClick={() => handleTryOn(selectedItem)}
                        className="premium-button-primary"
                      >
                        Try On This Look
                      </button>
                    </div>
                  </div>
                </div>

                <div className="modal-side tryon-stage">
                  {tryOnLoading ? (
                    <div className="tryon-loading-state">
                      <div className="premium-loader"></div>
                      <p className="premium-subtitle" style={{ marginTop: '16px' }}>Visualizing how this recommendation looks on you...</p>
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
                      <p>{tryOnError || "Open the styling preview to see how this recommendation enhances your wardrobe."}</p>
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
