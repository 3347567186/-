import { useMemo, useRef, useState, useEffect } from 'react'
import { Metric } from './Metric'
import { AssetToolbar } from './AssetToolbar'
import { PendingReview } from './PendingReview'
import { GalleryGrid } from './GalleryGrid'
import { IntakeForm } from './IntakeForm'
import { classifyImageAsset, organizeAssetList, normalizeUrl, isPhotoFile } from '../utils/asset-utils'
import { autoIntakePool, products, projectCategories } from '../data/constants'

function useDebounce(value, delay = 150) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export function Projects({ assets, setAssets }) {
  const [activeCategory, setActiveCategory] = useState('全部')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 150)
  const [selectedIds, setSelectedIds] = useState([])
  const [pendingAssets, setPendingAssets] = useState([])
  const [activePendingId, setActivePendingId] = useState('')
  const [isLearning, setIsLearning] = useState(false)
  const [isOrganizing, setIsOrganizing] = useState(false)
  const [aiSearchAnalysis, setAiSearchAnalysis] = useState('')
  const [aiLearningHints, setAiLearningHints] = useState({ queries: [], tagSuggestions: [] })
  const folderInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [importStatus, setImportStatus] = useState('')
  const [form, setForm] = useState({
    title: '',
    category: '文创产品',
    image: '/media/hero-pattern-detail.jpg',
    tags: '蝴蝶纹,靛蓝,包边针,文创包',
  })

  const filteredAssets = useMemo(() => {
    const keyword = debouncedQuery.trim().toLowerCase()
    return assets
      .filter((asset) => activeCategory === '全部' || asset.category === activeCategory)
      .filter((asset) => {
        if (!keyword) return true
        return [asset.title, asset.category, asset.source, asset.note, ...asset.tags]
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      })
      .sort((a, b) => b.learned - a.learned || b.confidence - a.confidence)
  }, [activeCategory, assets, debouncedQuery])

  const stats = {
    total: assets.length,
    learned: assets.reduce((sum, asset) => sum + asset.learned, 0),
    confidence: Math.round(
      assets.reduce((sum, asset) => sum + asset.confidence, 0) / Math.max(assets.length, 1),
    ),
  }

  const learnAsset = (assetId) => {
    setAssets((current) =>
      current.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              learned: asset.learned + 1,
              confidence: Math.min(asset.confidence + 2, 99),
            }
          : asset,
      ),
    )
  }

  const [showGallery, setShowGallery] = useState(false)
  const [showIntake, setShowIntake] = useState(false)

  const requestAssetOrganization = async (targetAssets) => {
    const response = await fetch('/api/ai/organize-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        learningHints: aiLearningHints,
        assets: targetAssets.map(({ id, title, category, image, source, tags, note, confidence, learned, suggestedTags }) => ({
          id,
          title,
          category,
          image,
          source,
          tags,
          suggestedTags,
          note,
          confidence,
          learned,
        })),
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'AI自动整理失败')
    return Array.isArray(data.assets) ? data.assets : targetAssets
  }

  const autoOrganize = async () => {
    setIsOrganizing(true)
    try {
      const tagRes = await fetch('/api/ai/tag-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets }),
      })
      const tagData = await tagRes.json()
      const tagged = Array.isArray(tagData.assets) ? tagData.assets : assets
      const organized = await requestAssetOrganization(tagged)
      setAssets(organized)
    } catch {
      setAssets((current) => organizeAssetList(current))
    } finally {
      setIsOrganizing(false)
      setActiveCategory('全部')
      setQuery('')
    }
  }

  const autoLearn = async () => {
    setIsLearning(true)
    setAiSearchAnalysis('')
    const seenUrls = [
      ...assets.map((a) => a.originalImage || a.image || ''),
      ...pendingAssets.map((a) => a.originalImage || a.image || ''),
    ].filter(Boolean)
    const seenTitles = [
      ...assets.map((a) => a.title || ''),
      ...pendingAssets.map((a) => a.title || ''),
    ].filter(Boolean)
    try {
      const response = await fetch('/api/ai/crawl-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query || '苗绣 实物 传统刺绣 作品 实拍',
          database: assets.map(({ id, title, category, image, source, tags, note }) => ({
            id,
            title,
            category,
            image,
            source,
            tags,
            note,
          })),
          seenUrls,
          seenTitles,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'AI自学习失败')
      const raw = Array.isArray(data.assets) ? data.assets : []
      const confirmedUrls = new Set([...assets, ...pendingAssets].map((a) => normalizeUrl(a.image)).filter(Boolean))
      let candidates = organizeAssetList(raw).filter((c) => {
        const url = normalizeUrl(c.image)
        return !confirmedUrls.has(url)
      })
      if (!candidates.length) {
        candidates = organizeAssetList(raw)
      }
      setPendingAssets(candidates)
      setActivePendingId(candidates[0]?.id || '')
      setAiLearningHints({
        queries: Array.isArray(data.queries) ? data.queries : [],
        tagSuggestions: Array.isArray(data.tagSuggestions) ? data.tagSuggestions : [],
      })
      if (data.aiAnalysis) setAiSearchAnalysis(data.aiAnalysis)
    } catch {
      const crawledQueue = autoIntakePool.map((asset) =>
        classifyImageAsset({
          name: `${asset.title} ${asset.note} ${asset.tags.join(' ')}`,
          image: asset.image,
          source: 'AI自动爬取',
        }),
      )
      const crawledProducts = products.map((product) =>
        classifyImageAsset({
          name: `${product.title} ${product.summary} ${product.shape.join(' ')} ${product.use.join(' ')}`,
          image: product.image,
          source: 'AI自动爬取',
        }),
      )
      const catchConfirmedUrls = new Set([...assets, ...pendingAssets].map((a) => normalizeUrl(a.image)).filter(Boolean))
      let candidates = organizeAssetList([...crawledQueue, ...crawledProducts]).filter((c) => {
        const url = normalizeUrl(c.image)
        return !catchConfirmedUrls.has(url)
      })
      if (!candidates.length) {
        candidates = organizeAssetList([...crawledQueue, ...crawledProducts])
      }
      candidates = candidates.slice(0, 8)
      setPendingAssets(candidates)
      setActivePendingId(candidates[0]?.id || '')
      setAiLearningHints({ queries: [], tagSuggestions: [] })
    } finally {
      setIsLearning(false)
    }
  }

  const confirmPendingAssets = async () => {
    if (!pendingAssets.length) return
    setIsOrganizing(true)
    try {
      const merged = organizeAssetList([...pendingAssets, ...assets])
      setAssets(merged)
      let tagged = merged
      try {
        const tagRes = await fetch('/api/ai/tag-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: merged }),
        })
        const tagData = await tagRes.json()
        if (tagRes.ok) tagged = Array.isArray(tagData.assets) ? tagData.assets : merged
      } catch {
        // Tagging is an enhancement; keep the confirmed local merge if the AI service is unavailable.
      }
      const organized = await requestAssetOrganization(tagged)
      const finalSeenImages = new Set()
      const finalSeenTitles = new Set()
      const finalized = organized.filter((a) => {
        const ik = String(a.image || '').trim()
        const tk = String(a.title || '').trim().toLowerCase()
        if ((ik && finalSeenImages.has(ik)) || (tk && finalSeenTitles.has(tk))) return false
        if (ik) finalSeenImages.add(ik)
        if (tk) finalSeenTitles.add(tk)
        return true
      })
      setAssets(finalized)
    } catch {
      setAssets((current) => organizeAssetList(current))
    } finally {
      setIsOrganizing(false)
      setPendingAssets([])
      setActivePendingId('')
      setAiLearningHints({ queries: [], tagSuggestions: [] })
      setActiveCategory('全部')
      setQuery('')
    }
  }

  const clearPendingAssets = () => {
    setPendingAssets([])
    setActivePendingId('')
    setAiLearningHints({ queries: [], tagSuggestions: [] })
  }

  const removePendingAsset = (assetId) => {
    setPendingAssets((current) => {
      const next = current.filter((asset) => asset.id !== assetId)
      if (activePendingId === assetId) setActivePendingId(next[0]?.id || '')
      return next
    })
  }

  const importFolderImages = async (event) => {
    const pickedFiles = Array.from(event.target.files || [])
    const files = pickedFiles.filter(isPhotoFile)
    setImportStatus(`读取到 ${pickedFiles.length} 个文件，其中 ${files.length} 个照片文件。`)

    if (!files.length) {
      event.target.value = ''
      return
    }

    try {
      const selectedFiles = files.slice(0, 80)
      const importedAssets = []
      const BATCH_SIZE = 5
      for (let i = 0; i < selectedFiles.length; i += BATCH_SIZE) {
        const batch = selectedFiles.slice(i, i + BATCH_SIZE)
        setImportStatus(`正在导入 ${Math.min(i + BATCH_SIZE, selectedFiles.length)}/${selectedFiles.length}...`)
        const results = await Promise.all(batch.map((file) => uploadLocalPhoto(file)))
        for (let j = 0; j < results.length; j++) {
          const file = batch[j]
          const uploaded = results[j]
          importedAssets.push(classifyImageAsset({
            name: file.webkitRelativePath || file.name,
            image: uploaded.url,
            source: '本地图片导入',
          }))
        }
      }

      try {
        const organized = await requestAssetOrganization(importedAssets)
        setAssets((current) => organizeAssetList([...organized, ...current]))
      } catch {
        setAssets((current) => organizeAssetList([...importedAssets, ...current]))
      }
      setActiveCategory('全部')
      setQuery('')
      setShowGallery(true)
      setImportStatus(`已导入 ${importedAssets.length} 张照片。${files.length > selectedFiles.length ? `本次先处理前 ${selectedFiles.length} 张，剩余照片可分批导入。` : ''}`)
    } catch (error) {
      setImportStatus(`导入失败：${error.message || '请重试或减少一次选择的图片数量。'}`)
    } finally {
      event.target.value = ''
    }
  }

  const uploadLocalPhoto = async (file) => {
    const formData = new FormData()
    formData.append('file', file, file.name)
    const response = await fetch('/api/assets/upload', {
      method: 'POST',
      body: formData,
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '图片上传失败')
    return data.file
  }

  const toggleAssetSelection = (assetId) => {
    setSelectedIds((current) =>
      current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId],
    )
  }

  const selectVisibleAssets = () => {
    setSelectedIds(filteredAssets.map((asset) => asset.id))
  }

  const clearSelection = () => {
    setSelectedIds([])
  }

  const syncDeleteToServer = async (deletedIds) => {
    try {
      await fetch("/api/assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deletedIds }),
      })
    } catch {
      // silent — local state already reflects deletion
    }
  }

  const deleteSingleAsset = (assetId, assetTitle) => {
    if (!window.confirm(`确认删除 "${assetTitle}"？\n删除后图片及其关联数据将不可恢复。`)) return
    setAssets((current) => current.filter((asset) => asset.id !== assetId))
    setSelectedIds((current) => current.filter((id) => id !== assetId))
    syncDeleteToServer([assetId])
  }

  const deleteSelectedAssets = () => {
    if (!selectedIds.length) return
    const titles = selectedIds.map((id) => {
      const found = assets.find((a) => a.id === id)
      return found ? found.title : id
    })
    if (!window.confirm(`确认批量删除 ${selectedIds.length} 张图片？\n\n${titles.slice(0, 3).join(", ")}${titles.length > 3 ? ` 等 ${titles.length} 张` : ""}\n\n删除后不可恢复。`)) return
    const deletedIds = [...selectedIds]
    setAssets((current) => current.filter((asset) => !deletedIds.includes(asset.id)))
    setSelectedIds([])
    syncDeleteToServer(deletedIds)
  }

  const addAsset = (event) => {
    event.preventDefault()
    const title = form.title.trim() || '新入库图片样本'
    const tags = form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    setAssets((current) => [
      {
        id: `asset-${Date.now()}`,
        title,
        category: form.category,
        image: form.image.trim() || '/media/hero-pattern-detail.jpg',
        source: '手动入库',
        capturedAt: new Date().toISOString().slice(0, 10),
        learned: 1,
        confidence: 68,
        tags: tags.length ? tags : ['待标注'],
        note: '新加入的图片样本，可继续通过学习反馈提高权重。',
      },
      ...current,
    ])
    setForm((current) => ({ ...current, title: '' }))
  }

  const [showBackToTop, setShowBackToTop] = useState(false)
  useEffect(() => {
    const el = document.getElementById("projects")
    if (!el) return
    const onScroll = () => { setShowBackToTop(window.scrollY > el.offsetTop + 400) }
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <>
    <section id="projects" className="section projects-section">
      <div className="shell">
        <div className="section-head projects-head">
          <p className="eyebrow" data-reveal data-reveal-delay="100">数据库</p>
          <h2 data-reveal data-reveal-delay="200"><span className="tone-cool">设备</span>、<span className="tone-warm">纹样</span>与<span className="tone-gold">文创</span><span> — 共同构成可学习的多图片数据库</span></h2>
          <p data-reveal data-reveal-delay="300">这里不再是单向的作品展示。每张图片都会被储存、分类、检索并自动采集；随着使用频次增长，系统会动态提升相关样本的匹配权重，让数据库越用越精准。</p>
        </div>

        <div className="project-database">

          <AssetToolbar
            query={query}
            setQuery={setQuery}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            projectCategories={projectCategories}
            onAutoLearn={autoLearn}
            onAutoOrganize={autoOrganize}
            isLearning={isLearning}
            isOrganizing={isOrganizing}
          />

          <div className="db-stats">
            <Metric value={String(stats.total).padStart(2, '0')} label="已入库图片" />
            <Metric value={String(stats.learned)} label="累计学习反馈" />
            <Metric value={`${stats.confidence}%`} label="平均识别置信度" />
          </div>

          <div className="batch-toolbar">
            <span>已选择 {selectedIds.length} 张</span>
            <button type="button" onClick={selectVisibleAssets}>
              全选当前结果
            </button>
            <button type="button" onClick={clearSelection}>
              取消选择
            </button>
            <button className="danger-action" type="button" onClick={deleteSelectedAssets}>
              批量删除
            </button>
          </div>

          <PendingReview
            pendingAssets={pendingAssets}
            activePendingId={activePendingId}
            onSetActive={setActivePendingId}
            onConfirm={confirmPendingAssets}
            onClear={clearPendingAssets}
            onRemove={removePendingAsset}
            isOrganizing={isOrganizing}
            learningHints={aiLearningHints}
          />

          <GalleryGrid
            assets={filteredAssets}
            selectedIds={selectedIds}
            onToggleSelect={toggleAssetSelection}
            onLearn={learnAsset}
            onDeleteSingle={deleteSingleAsset}
            showGallery={showGallery}
            onToggleGallery={() => setShowGallery((v) => !v)}
          />

          <IntakeForm
            form={form}
            setForm={setForm}
            projectCategories={projectCategories}
            onSubmit={addAsset}
            onFolderImport={importFolderImages}
            folderInputRef={folderInputRef}
            fileInputRef={fileInputRef}
            aiSearchAnalysis={aiSearchAnalysis}
            importStatus={importStatus}
            isOpen={showIntake}
            onToggle={() => setShowIntake(v => !v)}
          />

        </div>
      </div>
    </section>
    {showBackToTop && (
      <button className="back-to-top-btn" type="button" onClick={() => document.getElementById("projects").scrollIntoView({ behavior: "smooth" })} title="返回数据库工具栏">&#x2191; 返回顶部</button>
    )}
    </>
  )
}
