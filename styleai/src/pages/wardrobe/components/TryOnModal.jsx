import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../../../firebase/firebase'
import { runFrontendVTO } from '../../../utils/geminiVto'
import { saveToWishlist } from '../../Wishlist'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL && !window.location.hostname.includes('vercel.app') 
  ? import.meta.env.VITE_BACKEND_URL 
  : ''

export default function TryOnModal({
  avatarUrl,
  selectedCloth,
  wardrobe,
  onClose,
  onDelete
}) {
  const navigate = useNavigate();
  const [currentCloth, setCurrentCloth] = useState(selectedCloth)
  const [resultImageUrl, setResultImageUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [wishlistSaved, setWishlistSaved] = useState(false)
  const [wishlistSaving, setWishlistSaving] = useState(false)

  useEffect(() => {
    setCurrentCloth(selectedCloth)
  }, [selectedCloth])

  useEffect(() => {
    if (currentCloth && avatarUrl) {
      renderTryOn()
    }
  }, [currentCloth, avatarUrl])

  const renderTryOn = async () => {
    if (!currentCloth) return;

    if (!avatarUrl) {
      setError('Please create your AI Avatar first to use Virtual Try-On.');
      return;
    }

    setLoading(true)
    setError(null)
    setResultImageUrl(null)

    try {
      const vtoImageUrl = await runFrontendVTO(
        avatarUrl,
        currentCloth.imageUrl,
        currentCloth.category,
        currentCloth.name
      );
      setResultImageUrl(vtoImageUrl);
    } catch (renderError) {
      console.error(renderError)
      setError(renderError.message || 'Could not generate try-on preview')
    } finally {
      setLoading(false)
    }
  }

  const saveAsPhoto = async () => {
    if (!resultImageUrl) return

    try {
      const response = await fetch(resultImageUrl)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.download = `styleai-outfit-${Date.now()}.png`
      link.href = blobUrl
      link.click()

      URL.revokeObjectURL(blobUrl)
    } catch (saveError) {
      console.error(saveError)
      setError('Could not save try-on image')
    }
  }

  const handleSaveToWishlist = async () => {
    const user = auth.currentUser
    if (!user || !currentCloth) return
    setWishlistSaving(true)
    try {
      await saveToWishlist(user.uid, {
        title: currentCloth.name,
        imageUrl: currentCloth.imageUrl,
        link: currentCloth.link || '',
        source: 'My Wardrobe',
        category: currentCloth.category
      })
      setWishlistSaved(true)
      setTimeout(() => setWishlistSaved(false), 2500)
    } catch (err) {
      console.error('Save to wishlist error:', err)
    } finally {
      setWishlistSaving(false)
    }
  }

  return (
    <div className="premium-modal-overlay fade-in" onClick={onClose}>
      <div className="premium-modal-content split-view tryon-split-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-main-stage">
          <header className="modal-header">
            <div className="modal-header-info">
              <h2 className="premium-title" style={{ fontSize: '20px' }}>Virtual Fitting Room</h2>
              <p className="premium-subtitle" style={{ margin: 0 }}>Gemini AI is styling your avatar</p>
            </div>
            <button className="close-modal" onClick={onClose}>×</button>
          </header>

          <div className="tryon-stage-container">
            {resultImageUrl && !loading && (
              <div className="tryon-result-wrap">
                <img
                  src={resultImageUrl}
                  alt={`Try-on result`}
                  className="result-img"
                />
              </div>
            )}

            {loading && (
              <div className="tryon-loading-overlay">
                <div className="premium-loader"></div>
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Wrapping garment...
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    This can take 20-60 seconds.
                  </p>
                </div>
              </div>
            )}

            {!resultImageUrl && !loading && !error && (
              <div className="tryon-empty-state">
                <p>Select an outfit to begin the magic.</p>
              </div>
            )}

            {error && (
              <div className="tryon-error-banner">
                <span>{error}</span>
                {error.includes('Avatar') && (
                  <button onClick={() => navigate('/generate-model')} className="premium-button-primary" style={{ padding: '8px 16px', fontSize: '12px' }}>
                    Create Avatar
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="tryon-main-actions">
            <button onClick={renderTryOn} disabled={!currentCloth || loading} className="premium-button-secondary" style={{ flex: 1 }}>
              Regenerate
            </button>
            <button onClick={saveAsPhoto} disabled={!resultImageUrl || loading} className="premium-button-primary" style={{ flex: 1 }}>
              Download Look
            </button>
            <button onClick={handleSaveToWishlist} disabled={!currentCloth || wishlistSaving} className="premium-button-secondary" style={{ width: '100%', marginTop: '8px', color: wishlistSaved ? 'var(--color-success)' : 'inherit' }}>
              {wishlistSaved ? '✓ Saved' : wishlistSaving ? 'Saving…' : '♡ Add to Wishlist'}
            </button>
          </div>
        </div>

        <aside className="modal-sidebar-wardrobe">
          <p className="sidebar-label">Your Wardrobe</p>
          <div className="wardrobe-scroll-list">
            {wardrobe.map(cloth => (
              <div
                key={cloth.id}
                className={`sidebar-cloth-item ${currentCloth?.id === cloth.id ? 'active' : ''}`}
                onClick={() => setCurrentCloth(cloth)}
              >
                <img src={cloth.imageUrl} alt={cloth.name} />
                <p className="sidebar-cloth-name">{cloth.name}</p>
                <button
                  className="sidebar-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Remove item?')) {
                      onDelete(cloth.id);
                      if (currentCloth?.id === cloth.id) setCurrentCloth(null);
                    }
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>

      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
