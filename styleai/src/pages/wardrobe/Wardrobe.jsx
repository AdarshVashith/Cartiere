import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import MainLayout from '../../components/MainLayout';
import ClothCard from './components/ClothCard';
import UploadClothModal from './components/UploadClothModal';
import TryOnModal from './components/TryOnModal';
import './Wardrobe.css';

export default function Wardrobe() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [wardrobe, setWardrobe] = useState([])
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showTryOn, setShowTryOn] = useState(false)
  const [selectedCloth, setSelectedCloth] = useState(null)
  const [filterCategory, setFilterCategory] = useState('All')
  const [error, setError] = useState(null)
  const [seedingLoading, setSeedingLoading] = useState(false)

  const categories = [
    'All', 'Top', 'Bottom', 'Dress', 
    'Jacket', 'Shoes', 'Accessory'
  ]

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u)
      else navigate('/login')
    })
    return () => unsub()
  }, [navigate])

  // Fetch wardrobe and avatar
  useEffect(() => {
    if (!user) return
    fetchData()
  }, [user])

  const fetchData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      if (userDoc.exists()) {
        const userData = userDoc.data()
        setAvatarUrl(userData.avatarUrl)
      }

      const wardrobeSnap = await getDocs(
        collection(db, 'users', user.uid, 'wardrobe')
      )
      const items = wardrobeSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
      setWardrobe(items)
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  // ... (rest of handles kept same) ...

  const handleSaveCloth = async (clothData) => {
    try {
      const docRef = await addDoc(
        collection(db, 'users', user.uid, 'wardrobe'),
        clothData
      )
      setWardrobe(prev => [...prev, { id: docRef.id, ...clothData }])
      setShowUploadModal(false)
    } catch (err) {
      setError('Failed to save cloth: ' + err.message)
    }
  }

  const handleWorn = async (clothId) => {
    try {
      const cloth = wardrobe.find(c => c.id === clothId)
      if (!cloth) return
      const newWearCount = (cloth.wearCount || 0) + 1
      const today = new Date().toISOString()
      await updateDoc(
        doc(db, 'users', user.uid, 'wardrobe', clothId),
        {
          wearCount: newWearCount,
          lastWorn: today,
          wearHistory: [...(cloth.wearHistory || []), today]
        }
      )
      setWardrobe(prev => prev.map(c =>
        c.id === clothId
          ? { ...c, wearCount: newWearCount, lastWorn: today, wearHistory: [...(c.wearHistory || []), today] }
          : c
      ))
    } catch (err) {
      setError('Failed to update wear count: ' + err.message)
    }
  }

  const handleDeleteCloth = async (clothId) => {
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'wardrobe', clothId))
      setWardrobe(prev => prev.filter(c => c.id !== clothId))
    } catch (err) {
      setError('Failed to delete item: ' + err.message)
    }
  }

  const handleToggleFreeze = async (clothId, isFrozen) => {
    try {
      await updateDoc(
        doc(db, 'users', user.uid, 'wardrobe', clothId),
        { isFrozen }
      )
      setWardrobe(prev => prev.map(c =>
        c.id === clothId ? { ...c, isFrozen } : c
      ))
    } catch (err) {
      setError('Failed to update status: ' + err.message)
    }
  }

  const handleTryOn = (cloth) => {
    setSelectedCloth(cloth)
    setShowTryOn(true)
  }

  const seedWardrobe = async () => {
    setSeedingLoading(true)
    try {
      setFilterCategory('All')
      setError(null)
      const existing = await getDocs(
        collection(db, 'users', user.uid, 'wardrobe')
      )
      const deletePromises = existing.docs.map(d =>
        deleteDoc(doc(db, 'users', user.uid, 'wardrobe', d.id))
      )
      await Promise.all(deletePromises)
      setWardrobe([])

      const sampleClothes = [
        {
          name: 'Classic White Oxford Shirt',
          category: 'Top',
          color: 'White',
          occasion: 'Formal, Work',
          brand: 'Uniqlo',
          imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Navy Blue Casual T-Shirt',
          category: 'Top',
          color: 'Navy Blue',
          occasion: 'Casual, Travel',
          brand: 'H&M',
          imageUrl: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Grey Melange Round Neck Tee',
          category: 'Top',
          color: 'Grey',
          occasion: 'Casual, Home, Gym',
          brand: 'Puma',
          imageUrl: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Black Graphic Print T-Shirt',
          category: 'Top',
          color: 'Black',
          occasion: 'Casual, Party, Date Night',
          brand: 'Zara',
          imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Light Blue Linen Shirt',
          category: 'Top',
          color: 'Light Blue',
          occasion: 'Casual, Travel, Date Night',
          brand: 'Marks & Spencer',
          imageUrl: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Dark Blue Slim Fit Jeans',
          category: 'Bottom',
          color: 'Dark Blue',
          occasion: 'Casual, Date Night, Travel',
          brand: "Levi's 511",
          imageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Beige Slim Chino Pants',
          category: 'Bottom',
          color: 'Beige',
          occasion: 'Work, Formal, Casual',
          brand: 'Gap',
          imageUrl: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Olive Green Cargo Pants',
          category: 'Bottom',
          color: 'Olive Green',
          occasion: 'Casual, Travel, Festival',
          brand: 'H&M',
          imageUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Black Formal Trousers',
          category: 'Bottom',
          color: 'Black',
          occasion: 'Formal, Work, Party',
          brand: 'Raymond',
          imageUrl: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Grey Jogger Sweatpants',
          category: 'Bottom',
          color: 'Grey',
          occasion: 'Home, Gym, Casual',
          brand: 'Nike',
          imageUrl: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Black Slim Fit Blazer',
          category: 'Jacket',
          color: 'Black',
          occasion: 'Formal, Work, Party, Date Night',
          brand: 'Zara',
          imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Light Blue Denim Jacket',
          category: 'Jacket',
          color: 'Light Blue',
          occasion: 'Casual, Travel, Festival',
          brand: "Levi's",
          imageUrl: 'https://images.unsplash.com/photo-1601333144130-8cbb312386b6?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'White Leather Sneakers',
          category: 'Shoes',
          color: 'White',
          occasion: 'Casual, Date Night, Travel',
          brand: 'Nike Air Force',
          imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Black Oxford Formal Shoes',
          category: 'Shoes',
          color: 'Black',
          occasion: 'Formal, Work, Party',
          brand: 'Clarks',
          imageUrl: 'https://images.unsplash.com/photo-1449505278894-297fdb3edbc1?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        },
        {
          name: 'Brown Casual Loafers',
          category: 'Shoes',
          color: 'Brown',
          occasion: 'Casual, Work, Date Night',
          brand: 'Hush Puppies',
          imageUrl: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=400&fit=crop',
          wearCount: 0, wearHistory: [], addedAt: new Date().toISOString()
        }
      ]

      const addPromises = sampleClothes.map(async (cloth) => {
        const docRef = await addDoc(
          collection(db, 'users', user.uid, 'wardrobe'),
          cloth
        )
        return { id: docRef.id, ...cloth }
      })

      await Promise.all(addPromises)
      await fetchData()
    } catch (err) {
      setError('Seed failed: ' + err.message)
    } finally {
      setSeedingLoading(false)
    }
  }

  const filteredWardrobe = filterCategory === 'All'
    ? wardrobe
    : wardrobe.filter(c => c.category === filterCategory)

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="premium-loader"></div>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="wardrobe-content-wrap">
        <header className="wardrobe-header fade-in-down">
          <div className="wardrobe-title-section">
            <h1 className="premium-title">My Wardrobe</h1>
            <p className="premium-subtitle">Manage and curate your digital closet</p>
          </div>
          <div className="wardrobe-header-actions">
            <button
              onClick={seedWardrobe}
              disabled={seedingLoading}
              className="premium-button-secondary"
            >
              {seedingLoading ? '...' : '✦ Samples'}
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="premium-button-primary"
            >
              + Add Item
            </button>
          </div>
        </header>

      {/* Wear Cycle Tracker */}
      <section className="wear-cycle-section fade-in-up" style={{ animationDelay: '0.1s' }}>
        <div className="wear-cycle-header">
          <h3 className="gen-section-title" style={{ border: 'none', padding: 0, margin: 0 }}>Wear Cycle Analysis</h3>
          <span className="pill-small" style={{ background: 'var(--mauve-soft)', color: 'var(--mauve)' }}>Active Cycle</span>
        </div>
        <div className="wear-cycle-stats">
          <div className="stat-card-mini">
            <span className="stat-lbl">Total Wears</span>
            <span className="stat-val">{wardrobe.reduce((acc, curr) => acc + (curr.wearCount || 0), 0)}</span>
          </div>
          <div className="stat-card-mini">
            <span className="stat-lbl">Frozen Items</span>
            <span className="stat-val">{wardrobe.filter(i => i.isFrozen).length}</span>
          </div>
          <div className="stat-card-mini">
            <span className="stat-lbl">Utilization</span>
            <span className="stat-val">
              {wardrobe.length > 0 
                ? Math.round((wardrobe.filter(i => (i.wearCount || 0) > 0).length / wardrobe.length) * 100) 
                : 0}%
            </span>
          </div>
        </div>
      </section>

      <div className="wardrobe-main-flex">
        {/* Wardrobe grid */}
        <div className="wardrobe-grid-wrap fade-in-up" style={{ animationDelay: '0.3s' }}>
          {filteredWardrobe.length === 0 ? (
            <div className="empty-state-wardrobe">
              <div className="empty-icon">👕</div>
              <p className="empty-title">Your wardrobe is looking a bit quiet</p>
              <p className="empty-text">Add your clothes manually or load our premium samples to get started.</p>
            </div>
          ) : (
            <div className="wardrobe-grid-premium">
              {filteredWardrobe.map(cloth => (
                <ClothCard
                  key={cloth.id}
                  cloth={cloth}
                  onTryOn={handleTryOn}
                  onWorn={handleWorn}
                  onDelete={handleDeleteCloth}
                  onToggleFreeze={handleToggleFreeze}
                />
              ))}
            </div>
          )}
        </div>

        {/* Category filter Sidebar (Vertical Right) */}
        <aside className="wardrobe-sidebar-right fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h4 className="sidebar-title">Categories</h4>
          <div className="filter-vertical-list">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`filter-pill-vertical ${filterCategory === cat ? 'active' : ''}`}
              >
                {cat}
                <span className="cat-count">
                  {cat === 'All' ? wardrobe.length : wardrobe.filter(i => i.category === cat).length}
                </span>
              </button>
            ))}
          </div>
          
          <div className="sidebar-decor">
            <p>CURATED SELECTION</p>
            <div className="decor-line"></div>
          </div>
        </aside>
      </div>

      {/* Modals */}
      {showUploadModal && (
        <UploadClothModal
          onClose={() => setShowUploadModal(false)}
          onSave={handleSaveCloth}
        />
      )}

      {showTryOn && selectedCloth && avatarUrl && (
        <TryOnModal
          avatarUrl={avatarUrl}
          selectedCloth={selectedCloth}
          wardrobe={wardrobe}
          onClose={() => {
            setShowTryOn(false)
            setSelectedCloth(null)
          }}
          onDelete={handleDeleteCloth}
        />
      )}
      </div>
    </MainLayout>
  )
}
