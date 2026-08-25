import { useEffect, useMemo, useState } from 'react'
import { products, projectAssetSeed } from './data/constants'
import { organizeAssetList } from './utils/asset-utils'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { MagicBentoGrid } from './components/MagicBentoGrid'
import { Projects } from './components/Projects'
import { Advantages } from './components/Advantages'
import { Contact } from './components/Contact'

const initialSelection = {
  shape: '蝴蝶纹',
  color: '靛蓝',
  craft: '包边针',
  meaning: '吉祥',
  use: '文创包',
}

const seedWithTags = [
  ...projectAssetSeed,
  ...products.map((p) => ({
    ...p,
    tags: [...new Set([...(p.tags || []), ...p.shape, ...p.color, ...p.craft, ...p.meaning, ...p.use])],
  })),
]

const persistableAssets = (list) =>
  (list || []).filter((asset) => !String(asset.image || '').startsWith('data:image/'))

function App() {
  const [selection, setSelection] = useState(initialSelection)
  const [isNavSticky, setIsNavSticky] = useState(false)
  const [assets, setAssets] = useState([])
  const [assetsLoaded, setAssetsLoaded] = useState(false)

  // Scroll handler
  useEffect(() => {
    const handleScroll = () => {
      setIsNavSticky(window.scrollY > window.innerHeight * 0.85)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.slice(1)
      if (!id) return

      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: 'start' })
      })
    }

    scrollToHash()
    window.addEventListener('hashchange', scrollToHash)
    return () => window.removeEventListener('hashchange', scrollToHash)
  }, [])

  // Intersection observer for reveal animations
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    if (!els.length) return
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed')
          } else {
            entry.target.classList.remove('revealed')
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [assets])

  // Load assets from server on mount, merge with seed data
  useEffect(() => {
    let cancelled = false

    async function loadFromServer() {
      try {
        const res = await fetch('/api/assets')
        const data = await res.json()
        if (cancelled) return
        const serverAssets = Array.isArray(data.assets) ? data.assets : []
        const merged = organizeAssetList([...seedWithTags, ...serverAssets])
        setAssets(merged)
        // Also cache locally for offline fallback
        localStorage.setItem('zhenyun-project-assets', JSON.stringify(persistableAssets(serverAssets)))
      } catch {
        // Server unavailable — fall back to localStorage
        if (cancelled) return
        try {
          const saved = localStorage.getItem('zhenyun-project-assets')
          const base = saved ? JSON.parse(saved) : []
          const normalized = base.map((a) => ({
            ...a,
            tags: [
              ...new Set([
                ...(a.tags || []),
                ...(a.shape || []),
                ...(a.color || []),
                ...(a.craft || []),
                ...(a.meaning || []),
                ...(a.use || []),
              ]),
            ],
          }))
          setAssets(organizeAssetList([...seedWithTags, ...persistableAssets(normalized)]))
        } catch {
          setAssets(organizeAssetList(seedWithTags))
        }
      } finally {
        if (!cancelled) setAssetsLoaded(true)
      }
    }

    loadFromServer()
    return () => { cancelled = true }
  }, [])

  // Sync assets to server when they change (aborts previous pending sync)
  useEffect(() => {
    if (!assetsLoaded || !assets.length) return
    const controller = new AbortController()
    const handler = async () => {
      try {
        await fetch('/api/assets/sync', {
          signal: controller.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: persistableAssets(assets) }),
        })
      } catch (e) {
        if (e.name === 'AbortError') return
        // Silent fail - next change will retry
      }
    }
    handler()
    return () => { controller.abort() }
  }, [assets, assetsLoaded])

  // Keep local cache
  useEffect(() => {
    if (!assetsLoaded) return
    try {
      localStorage.setItem('zhenyun-project-assets', JSON.stringify(persistableAssets(assets)))
    } catch {
      localStorage.removeItem('zhenyun-project-assets')
    }
  }, [assets, assetsLoaded])

  const matchedProducts = useMemo(() => {
    return assets.filter((asset) => {
      if (asset.category === '设备' || asset.category === '纹样库') return false
      return Object.entries(selection).every(([key, value]) => {
        if (Array.isArray(asset[key])) return asset[key].includes(value)
        return (asset.tags || []).includes(value)
      })
    })
  }, [selection, assets])

  const prompt = `苗绣刺绣风格，${selection.shape}，${selection.color}底色，${selection.color === '靛蓝' ? '暖红与明黄点缀' : '靛蓝压底与明黄点缀'}，${selection.craft}质感，${selection.meaning}寓意，适用于${selection.use}图案，中心构图，边缘清晰，适合机绣加工。`

  const handleSelect = (groupId, value) => {
    setSelection((current) => ({ ...current, [groupId]: value }))
  }

  const saveAiAsset = (asset) => {
    setAssets((current) => [
      {
        id: `ai-${Date.now()}`,
        title: asset.title || 'AI 创作整合方案',
        category: asset.category || '文创产品',
        image: asset.image || '/media/hero-pattern-detail.jpg',
        source: asset.source || '智能生成方案',
        capturedAt: new Date().toISOString().slice(0, 10),
        learned: 1,
        confidence: asset.confidence || 82,
        tags: asset.tags?.length ? asset.tags : Object.values(selection),
        note: asset.note || '由智能系统根据文化基因、数据库样本和相关检索线索生成的方案。',
      },
      ...current,
    ])
  }

  return (
    <>
      <a className="skip-link" href="#main-content">跳至正文</a>
      <Nav isSticky={isNavSticky} />
      <main id="main-content">
        <Hero />
        <MagicBentoGrid
          selection={selection}
          onSelect={handleSelect}
          matchedProducts={matchedProducts}
          prompt={prompt}
          assets={assets}
          onSaveAiAsset={saveAiAsset}
        />
        <Projects assets={assets} setAssets={setAssets} />
        <Advantages />
        <Contact />
      </main>
    </>
  )
}

export default App
