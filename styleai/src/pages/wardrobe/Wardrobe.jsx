import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import MainLayout from '../../components/MainLayout';
import ClothCard from './components/ClothCard';
import UploadClothModal from './components/UploadClothModal';
import TryOnModal from './components/TryOnModal';
import { getDiscoverProfileState, mergeDiscoverState, splitPreferenceInput, writeLocalDiscoverState } from '../../utils/discoverAccess';
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
  const [wearCycleOpen, setWearCycleOpen] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [discoverSettings, setDiscoverSettings] = useState({
    isWardrobeComplete: false,
    styleInterestsInput: '',
    lifestyleNeedsInput: '',
    targetAesthetic: 'Quiet Luxury'
  })
  const [savingDiscoverSettings, setSavingDiscoverSettings] = useState(false)

  const categories = [
    'All', 'Wear Cycle', 'Top', 'Bottom', 'Dress', 
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
    const localDiscoverState = mergeDiscoverState({}, user?.uid)
    setDiscoverSettings({
      isWardrobeComplete: localDiscoverState.isWardrobeComplete,
      styleInterestsInput: localDiscoverState.styleInterests.join(', '),
      lifestyleNeedsInput: localDiscoverState.lifestyleNeeds.join(', '),
      targetAesthetic: localDiscoverState.targetAesthetic || 'Quiet Luxury'
    })

    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      if (userDoc.exists()) {
        const userData = userDoc.data()
        setAvatarUrl(userData.avatarUrl)
        const discoverState = mergeDiscoverState(userData, user.uid)
        setDiscoverSettings({
          isWardrobeComplete: discoverState.isWardrobeComplete,
          styleInterestsInput: discoverState.styleInterests.join(', '),
          lifestyleNeedsInput: discoverState.lifestyleNeeds.join(', '),
          targetAesthetic: discoverState.targetAesthetic || 'Quiet Luxury'
        })
      }

    } catch (err) {
      setError(err.message)
    }

    try {
      const wardrobeSnap = await getDocs(
        collection(db, 'users', user.uid, 'wardrobe')
      )
      const items = wardrobeSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
      setWardrobe(items)
    } catch (err) {
      setError((current) => current || err.message)
    }

    setLoading(false)
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

  const handleDiscoverSettingsChange = (field, value) => {
    setDiscoverSettings((current) => ({
      ...current,
      [field]: value
    }))
  }

  const saveDiscoverSettings = async () => {
    if (!user) return
    setSavingDiscoverSettings(true)
    setError(null)

    const nextState = {
      isWardrobeComplete: discoverSettings.isWardrobeComplete,
      styleInterests: splitPreferenceInput(discoverSettings.styleInterestsInput),
      lifestyleNeeds: splitPreferenceInput(discoverSettings.lifestyleNeedsInput),
      targetAesthetic: discoverSettings.targetAesthetic
    }

    try {
      writeLocalDiscoverState(user.uid, nextState)
      await setDoc(
        doc(db, 'users', user.uid),
        nextState,
        { merge: true }
      )
    } catch (err) {
      setError('Saved locally. Firebase profile sync is blocked: ' + err.message)
    } finally {
      setSavingDiscoverSettings(false)
    }

    if (nextState.isWardrobeComplete) {
      navigate('/discover')
    }
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
    : filterCategory === 'Wear Cycle'
      ? [...wardrobe].sort((a, b) => (b.wearCount || 0) - (a.wearCount || 0))
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
              className="premium-button-secondary samples-btn"
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

      <div className="wardrobe-dashboard-layout">
        <div className="wardrobe-primary-column">
          <section className={`wear-cycle-section fade-in-up ${wearCycleOpen ? 'wc-open' : ''}`} style={{ animationDelay: '0.1s' }}>
            <div className="wear-cycle-header" onClick={() => setWearCycleOpen(prev => !prev)}>
              <div className="wear-cycle-header-copy">
                <p className="wear-cycle-kicker">Wardrobe Health</p>
                <h3 className="wear-cycle-title">Wear Cycle Analysis</h3>
                <p className="wear-cycle-summary wc-desktop-only">
                  A clean snapshot of how actively your collection is being worn, rotated, and temporarily held back.
                </p>
              </div>
              <span className="wear-cycle-status wc-desktop-only">Active Cycle</span>
              <span className="wc-toggle-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
            <div className="wear-cycle-body">
              <div className="wear-cycle-stats">
                <div className="stat-card-mini">
                  <span className="stat-lbl">Total Items</span>
                  <span className="stat-val">{wardrobe.length}</span>
                  <span className="stat-meta">Items in your digital closet</span>
                </div>
                <div className="stat-card-mini">
                  <span className="stat-lbl">Total Wears</span>
                  <span className="stat-val">{wardrobe.reduce((acc, curr) => acc + (curr.wearCount || 0), 0)}</span>
                  <span className="stat-meta">Across the full wardrobe rotation</span>
                </div>
                <div className="stat-card-mini">
                  <span className="stat-lbl">Frozen Items</span>
                  <span className="stat-val">{wardrobe.filter(i => i.isFrozen).length}</span>
                  <span className="stat-meta">Items excluded from styling</span>
                </div>
                <div className="stat-card-mini">
                  <span className="stat-lbl">Utilization</span>
                  <span className="stat-val">
                    {wardrobe.length > 0 
                      ? Math.round((wardrobe.filter(i => (i.wearCount || 0) > 0).length / wardrobe.length) * 100) 
                      : 0}%
                  </span>
                  <span className="stat-meta">Items that entered active rotation</span>
                </div>
                <div className="stat-card-mini">
                  <span className="stat-lbl">Avg Wears</span>
                  <span className="stat-val">
                    {wardrobe.length > 0 
                      ? (wardrobe.reduce((acc, curr) => acc + (curr.wearCount || 0), 0) / wardrobe.length).toFixed(1) 
                      : 0}
                  </span>
                  <span className="stat-meta">Average wears per item</span>
                </div>
                <div className="stat-card-mini">
                  <span className="stat-lbl">Most Worn</span>
                  <span className="stat-val stat-val-text">
                    {wardrobe.length > 0 
                      ? (wardrobe.reduce((best, curr) => (curr.wearCount || 0) > (best.wearCount || 0) ? curr : best, wardrobe[0])?.name || '—').split(' ').slice(0, 3).join(' ')
                      : '—'}
                  </span>
                  <span className="stat-meta">
                    {wardrobe.length > 0 
                      ? `${wardrobe.reduce((best, curr) => (curr.wearCount || 0) > (best.wearCount || 0) ? curr : best, wardrobe[0])?.wearCount || 0} wears`
                      : 'No data yet'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className={`discover-readiness-panel fade-in-up ${discoverOpen ? 'dr-open' : ''}`} style={{ animationDelay: '0.16s' }}>
            <div className="discover-readiness-header" onClick={() => setDiscoverOpen(prev => !prev)}>
              <div className="discover-readiness-copy">
                <p className="wear-cycle-kicker">Discover Readiness</p>
                <h3 className="wear-cycle-title">Unlock smarter recommendations</h3>
                <p className="wear-cycle-summary dr-desktop-only">
                  Confirm when this is your full wardrobe and add your lifestyle interests so Discover only activates once Cartieré has the right context.
                </p>
              </div>
              <span className="dr-toggle-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>

            <div className="discover-readiness-body">
              <div className="discover-readiness-grid">
                <label className={`wardrobe-complete-toggle ${discoverSettings.isWardrobeComplete ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={discoverSettings.isWardrobeComplete}
                    onChange={(event) => handleDiscoverSettingsChange('isWardrobeComplete', event.target.checked)}
                  />
                  <span className="wardrobe-complete-indicator" />
                  <span className="wardrobe-complete-copy">
                    <strong>This is my full wardrobe</strong>
                    <small>Discover stays locked until you confirm your wardrobe is complete.</small>
                  </span>
                </label>

                <div className="discover-settings-form">
                  <label className="discover-settings-field">
                    <span>Field of Interest</span>
                    <input
                      type="text"
                      value={discoverSettings.styleInterestsInput}
                      onChange={(event) => handleDiscoverSettingsChange('styleInterestsInput', event.target.value)}
                      placeholder="Workwear, date night, streetwear, gym, travel"
                    />
                  </label>

                  <label className="discover-settings-field">
                    <span>Clothing Needs</span>
                    <input
                      type="text"
                      value={discoverSettings.lifestyleNeedsInput}
                      onChange={(event) => handleDiscoverSettingsChange('lifestyleNeedsInput', event.target.value)}
                      placeholder="Office meetings, weddings, daily casual, airport looks"
                    />
                  </label>

                  <label className="discover-settings-field">
                    <span>Target Aesthetic</span>
                    <select
                      value={discoverSettings.targetAesthetic}
                      onChange={(event) => handleDiscoverSettingsChange('targetAesthetic', event.target.value)}
                    >
                      <option>Quiet Luxury</option>
                      <option>Industrial Techwear</option>
                      <option>Scandi-Minimalism</option>
                      <option>Old Money</option>
                      <option>Avant-Garde</option>
                      <option>Streetwear</option>
                    </select>
                  </label>

                  <div className="discover-settings-actions">
                    <button
                      type="button"
                      className="premium-button-primary"
                      onClick={saveDiscoverSettings}
                      disabled={savingDiscoverSettings}
                    >
                      {savingDiscoverSettings ? 'Saving...' : 'Save Discover Settings'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

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
        </div>

        <aside className="wardrobe-sidebar-right fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="sidebar-connector-line" />
          <div className="sidebar-header-block">
            <p className="sidebar-kicker">Live Archive</p>
            <h4 className="sidebar-title">Archive</h4>
            <p className="sidebar-copy">Filter the collection by category or jump into wear-cycle sorting.</p>
          </div>
          <div className="filter-vertical-list">
            {categories.map(cat => {
              const icons = {
                'All': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
                'Wear Cycle': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="m22 10-3-3 3-3"/></svg>,
                'Top': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>,
                'Bottom': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2v20l4-2 4 2V2"/><path d="M6 2h8"/><path d="M6 10h8"/></svg>,
                'Dress': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 2c0 .5.5 1 1 1h2c.5 0 1-.5 1-1"/><path d="M14 3v1l6 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8l6-4V3"/></svg>,
                'Jacket': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 3h16l2 11v7h-6v-5l-4-2-4 2v5H2v-7L4 3z"/><path d="M12 3v18"/></svg>,
                'Shoes': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18"/><path d="M3 12s0-6 9-6 9 6 9 6"/><path d="M12 6v12"/><path d="M3 12v6h18v-6"/></svg>,
                'Accessory': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
              }
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`filter-pill-vertical ${filterCategory === cat ? 'active' : ''}`}
                >
                  <span className="cat-icon">{icons[cat] || icons['All']}</span>
                  <span className="cat-label">{cat}</span>
                  <span className="cat-count">
                    {cat === 'All' || cat === 'Wear Cycle' ? wardrobe.length : wardrobe.filter(i => i.category === cat).length}
                  </span>
                </button>
              )
            })}
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
