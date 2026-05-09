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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '24px',
          padding: '24px',
          width: '100%',
          maxWidth: '980px',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          gap: '24px'
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
                AI try on
              </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                Gemini is generating a styled preview of this garment on your 2D avatar.
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#666',
                padding: '4px 8px'
              }}
            >
              x
            </button>
          </div>

          <div
            style={{
              position: 'relative',
              minHeight: '700px',
              borderRadius: '16px',
              background: '#f9f9f9',
              border: '1px solid #eee',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {resultImageUrl && !loading && (
              <img
                src={resultImageUrl}
                alt={`Try-on result for ${currentCloth?.name || 'selected outfit'}`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block'
                }}
              />
            )}

            {loading && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '14px',
                  background: 'rgba(255,255,255,0.88)',
                  zIndex: 10
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    border: '3px solid #eee',
                    borderTopColor: '#F97316',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }}
                />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                    Wrapping garment on your avatar
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#6b7280' }}>
                    This can take around 20 to 60 seconds.
                  </p>
                </div>
              </div>
            )}

            {!resultImageUrl && !loading && !error && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                Select an outfit to generate a try-on result.
              </div>
            )}
          </div>

          {error && (
            <div
              style={{
                background: '#fef2f2',
                color: '#dc2626',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>{error}</span>
              {error.includes('Avatar') && (
                <button
                  onClick={() => navigate('/generate-model')}
                  style={{
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}
                >
                  Create Avatar
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={renderTryOn}
              disabled={!currentCloth || loading}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                background: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                color: '#374151',
                opacity: loading ? 0.7 : 1
              }}
            >
              Regenerate
            </button>
            <button
              onClick={saveAsPhoto}
              disabled={!resultImageUrl || loading}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                border: 'none',
                background: '#111827',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: resultImageUrl && !loading ? 'pointer' : 'not-allowed',
                opacity: resultImageUrl && !loading ? 1 : 0.7
              }}
            >
              Save as photo
            </button>
            <button
              onClick={handleSaveToWishlist}
              disabled={!currentCloth || wishlistSaving}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                background: wishlistSaved ? '#f0fdf4' : 'white',
                color: wishlistSaved ? '#16a34a' : '#6b7280',
                fontSize: '14px',
                fontWeight: '600',
                cursor: currentCloth && !wishlistSaving ? 'pointer' : 'not-allowed',
                opacity: currentCloth ? 1 : 0.5,
                transition: 'all 0.2s'
              }}
            >
              {wishlistSaved ? '✓ Saved to Wishlist' : wishlistSaving ? 'Saving…' : '♡ Save to Wishlist'}
            </button>
          </div>
        </div>

        <div
          style={{
            width: '200px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <p
            style={{
              fontSize: '13px',
              fontWeight: '600',
              color: '#374151',
              margin: 0
            }}
          >
            Select outfit
          </p>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              overflowY: 'auto',
              maxHeight: '500px'
            }}
          >
            {wardrobe.length === 0 && (
              <p style={{ fontSize: '12px', color: '#9ca3af' }}>
                No clothes in wardrobe yet
              </p>
            )}
            {wardrobe.map(cloth => (
              <div
                key={cloth.id}
                style={{ position: 'relative' }}
              >
                <div
                  onClick={() => setCurrentCloth(cloth)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: currentCloth?.id === cloth.id
                      ? '2px solid #F97316'
                      : '2px solid transparent',
                    background: '#f9f9f9',
                    transition: 'border-color 0.2s'
                  }}
                >
                  <img
                    src={cloth.imageUrl}
                    alt={cloth.name}
                    style={{
                      width: '100%',
                      height: '110px',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                    crossOrigin="anonymous"
                  />
                  <p
                    style={{
                      fontSize: '11px',
                      color: '#6b7280',
                      padding: '6px 8px',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {cloth.name}
                  </p>
                </div>
                {/* Side Remove Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Remove this item from your wardrobe?')) {
                      onDelete(cloth.id);
                      if (currentCloth?.id === cloth.id) setCurrentCloth(null);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: 'rgba(255,255,255,0.9)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ef4444',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    zIndex: 20
                  }}
                  title="Remove from wardrobe"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
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
