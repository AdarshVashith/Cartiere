import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, doc, deleteDoc, addDoc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/firebase'
import { BottomTabNav } from '../components/TabNav'

// ── Exported helper so TryOnModal can call this ────────────────────────────
export async function saveToWishlist(userId, item) {
  const { addDoc, collection } = await import('firebase/firestore')
  const { db } = await import('../firebase/firebase')
  return addDoc(collection(db, 'users', userId, 'wishlist'), {
    ...item,
    addedAt: new Date().toISOString()
  })
}

import MainLayout from '../components/MainLayout';
import { runFrontendVTO } from '../utils/geminiVto';
import './Wishlist.css';

function Wishlist() {
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL && !window.location.hostname.includes('vercel.app') 
    ? import.meta.env.VITE_BACKEND_URL 
    : ''
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [wishlist, setWishlist] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [tryOnItem, setTryOnItem] = useState(null)
  const [tryOnLoading, setTryOnLoading] = useState(false)
  const [tryOnResult, setTryOnResult] = useState(null)
  const [tryOnError, setTryOnError] = useState('')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) navigate('/login')
      else setUser(u)
    })
    return () => unsub()
  }, [navigate])

  useEffect(() => {
    if (!user) return
    const fetchWishlist = async () => {
      try {
        const [wishlistSnap, profileSnap] = await Promise.all([
          getDocs(collection(db, 'users', user.uid, 'wishlist')),
          getDoc(doc(db, 'users', user.uid))
        ])
        if (profileSnap.exists()) {
          setAvatarUrl(profileSnap.data().avatarUrl || null)
        }
        setWishlist(wishlistSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (err) {
        setError('Failed to load wishlist.')
      } finally {
        setLoading(false)
      }
    }
    fetchWishlist()
  }, [user])

  const handleRemove = async (id) => {
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'wishlist', id))
      setWishlist(prev => prev.filter(w => w.id !== id))
    } catch (err) {
      console.error('Remove error:', err)
    }
  }

  const handleTryOn = async (itemOverride = null) => {
    const activeItem = itemOverride || tryOnItem
    if (!activeItem?.imageUrl) return;

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
        activeItem.imageUrl,
        activeItem.category || 'Top',
        activeItem.title || 'Wishlist item'
      );
      setTryOnResult(vtoImageUrl);
    } catch (err) {
      console.error('TryOn error:', err);
      setTryOnError(err.message || 'Failed to generate try-on');
    } finally {
      setTryOnLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="premium-loader"></div>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="wishlist-content-wrap">
        <header className="wishlist-header fade-in-down">
          <div className="wishlist-title-section">
            <h1 className="premium-title">Wishlist</h1>
            <p className="premium-subtitle">{wishlist.length} curated pieces awaiting your decision</p>
          </div>
        </header>

        {wishlist.length === 0 ? (
          <div className="empty-state-wardrobe fade-in-up">
            <div className="empty-icon">🛍️</div>
            <p className="empty-title">Your wishlist is empty</p>
            <p className="empty-text">Discover new pieces and save them here to visualize your future wardrobe.</p>
            <button
              onClick={() => navigate('/discover')}
              className="premium-button-primary"
              style={{ marginTop: '24px' }}
            >
              Discover Items
            </button>
          </div>
        ) : (
          <div className="wardrobe-grid-premium fade-in-up" style={{ animationDelay: '0.1s' }}>
            {wishlist.map(item => (
              <article key={item.id} className="cloth-card-premium">
                <div className="card-img-wrap">
                  <img src={item.imageUrl} alt={item.title} />
                  <div className="card-badge badge-cat">{item.source || 'Wishlist'}</div>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="card-delete-btn"
                  >
                    ×
                  </button>
                </div>
                <div className="card-info">
                  <h4 className="cloth-name">{item.title}</h4>
                  <p className="cloth-meta">{item.brand || 'Luxury Selection'}</p>
                  <div className="card-actions">
                    <button 
                      onClick={() => item.link && window.open(item.link, '_blank')}
                      className="action-btn btn-worn"
                    >
                      Shop
                    </button>
                    <button 
                      onClick={() => { setTryOnItem(item); handleTryOn(item) }}
                      className="action-btn btn-try"
                    >
                      Try On ✦
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {tryOnItem && (
          <div className="premium-modal-overlay fade-in" onClick={() => setTryOnItem(null)}>
            <div className="premium-modal-content split-view" onClick={e => e.stopPropagation()}>
              <header className="modal-header">
                <div className="modal-header-info">
                  <h2 className="premium-title" style={{ fontSize: '20px' }}>Virtual Fitting Room</h2>
                  <p className="premium-subtitle" style={{ margin: 0 }}>Visualizing {tryOnItem.title}</p>
                </div>
                <button className="close-modal" onClick={() => setTryOnItem(null)}>×</button>
              </header>
              
              <div className="modal-split-body">
                <div className="modal-side product-context">
                  <div className="context-img">
                    <img src={tryOnItem.imageUrl} alt={tryOnItem.title} />
                  </div>
                  <div className="context-info">
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>{tryOnItem.title}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--mauve)', opacity: 0.8 }}>{tryOnItem.brand || 'Luxury Selection'}</p>
                    <div style={{ marginTop: '16px' }}>
                       <span className="pill-small">{tryOnItem.category || 'Accessory'}</span>
                    </div>
                  </div>
                </div>

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
                        <button className="premium-button-primary" style={{ width: '100%' }} onClick={() => {
                           const a = document.createElement('a'); a.href = tryOnResult; a.download = 'wishlist-outfit.png'; a.click();
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

export default Wishlist
