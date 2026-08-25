import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { gsap } from 'gsap'
import { BentoCardGrid, ParticleCard } from '../MagicBento'
import { geneGroups } from '../data/constants'
import { useScrollReveal, useStaggeredReveal } from '../hooks/useScrollReveal'
import { ProductCard } from './ProductCard'

const aiTagPool = {
  shape: ['鱼纹', '云纹', '水波纹', '螺旋纹', '菱形纹', '藤蔓纹'],
  color: ['银白', '黛黑', '绛红', '米白', '青绿', '赭黄'],
  craft: ['盘金绣', '锁边针', '平针', '叠绣', '贴布绣', '珠绣'],
  meaning: ['纳福', '团圆', '祈愿', '迁徙', '生命树', '丰收'],
  use: ['胸针', '围巾', '抱枕', '屏风', '手机包', '礼盒'],
}

const uniqueTags = (tags) => [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]

export function MagicBentoGrid({ selection, onSelect, matchedProducts, prompt, assets, onSaveAiAsset }) {
  
// Clipboard helpers — work on HTTP (non-secure context) via execCommand fallback
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise((resolve, reject) => {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand("copy")
      document.body.removeChild(textarea)
      resolve()
    } catch (err) {
      document.body.removeChild(textarea)
      reject(err)
    }
  })
}

async function readFromClipboard() {
  if (navigator.clipboard && navigator.clipboard.readText) {
    return navigator.clipboard.readText()
  }
  // Fallback: use browser prompt on HTTP
  const text = window.prompt("请在此粘贴文本内容（Ctrl+V 后回车）：")
  if (text === null) throw new Error("用户取消")
  return text
}
const hasMatches = matchedProducts.length > 0
  const displayedProducts = hasMatches ? matchedProducts : assets.filter((a) => a.category !== '设备' && a.category !== '纹样库')
  const [aiQuery, setAiQuery] = useState('')
  const [aiMode, setAiMode] = useState('search-create')
  const [aiResult, setAiResult] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  // Load persisted gene tags from localStorage so AI-added tags survive refresh
function loadGeneTags() {
  try { return JSON.parse(localStorage.getItem("zhenyun-gene-tags") || "{}") } catch { return {} }
}
function saveGeneTags(tags) {
  try { localStorage.setItem("zhenyun-gene-tags", JSON.stringify(tags)) } catch {}
}
const [customGeneTags, setCustomGeneTags] = useState(loadGeneTags)
  const [manualGeneInputs, setManualGeneInputs] = useState({})

// Persist gene tags whenever they change
const setPersistedGeneTags = (updater) => {
  setCustomGeneTags((current) => {
    const next = typeof updater === "function" ? updater(current) : updater
    saveGeneTags(next)
    return next
  })
}
  const [, setAiTaggingGroup] = useState('')
  const hasAiResult = Boolean(aiResult?.images?.length || aiResult?.summary || aiResult?.creation?.concept)
  const aiPreviewImages = aiResult?.images?.length ? aiResult.images : ['/media/hero-pattern-detail.jpg']
  const [showAllProducts, setShowAllProducts] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const scrollbarWidth = useRef(0)
  const overlayRef = useRef(null)
  const overlayPanelRef = useRef(null)

  useLayoutEffect(() => {
    if (!showAllProducts) return
    const panel = overlayPanelRef.current
    const overlay = overlayRef.current
    if (panel) {
      gsap.fromTo(panel,
        { scale: 0.85, y: 30, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.7, ease: 'elastic.out(1, 0.35)' }
      )
    }
    if (overlay) {
      gsap.fromTo(overlay,
        { opacity: 0 },
        { opacity: 1, duration: 0.35, ease: 'power2.out' }
      )
    }
  }, [showAllProducts])

  useEffect(() => {
    const locked = Boolean(previewImage || showAllProducts)
    if (locked) {
      scrollbarWidth.current = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      document.body.style.paddingRight = `${scrollbarWidth.current}px`
    } else {
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
    }
    return () => {
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
    }
  }, [previewImage, showAllProducts])


  const runAiAgent = async () => {
    setAiLoading(true)
    setAiError('')
    try {
      const response = await fetch('/api/ai/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: aiQuery,
          mode: aiMode,
          selection,
          prompt,
          database: assets.map(({ id, title, category, source, tags, note, confidence }) => ({
            id, title, category, source, tags, note, confidence,
          })),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'AI 请求失败')
      setAiResult(data)
    } catch (error) {
      setAiError(error.message)
    } finally {
      setAiLoading(false)
    }
  }

  const getGeneOptions = (group) => uniqueTags([...(group.options || []), ...(customGeneTags[group.id] || [])])

  const addGeneTags = (groupId, tags) => {
    setPersistedGeneTags((current) => {
      const group = geneGroups.find((item) => item.id === groupId)
      const existing = [...(group?.options || []), ...(current[groupId] || [])]
      const nextTags = uniqueTags(tags).filter((tag) => !existing.includes(tag))
      if (!nextTags.length) return current
      return { ...current, [groupId]: [...(current[groupId] || []), ...nextTags] }
    })
  }

  const removeGeneTag = (groupId, tag) => {
    setPersistedGeneTags((current) => {
      const group = geneGroups.find((item) => item.id === groupId)
      const baseOptions = group?.options || []
      const extras = (current[groupId] || []).filter((t) => !baseOptions.includes(t) && t !== tag)
      return extras.length ? { ...current, [groupId]: extras } : (() => { const next = { ...current }; delete next[groupId]; return next })()
    })
  }

  const addManualGeneTag = (groupId) => {
    const value = manualGeneInputs[groupId]?.trim()
    if (!value) return
    addGeneTags(groupId, [value])
    onSelect(groupId, value)
    setManualGeneInputs((current) => ({ ...current, [groupId]: '' }))
  }

  const addAiGeneTags = (group) => {
    setAiTaggingGroup(group.id)
    window.setTimeout(() => {
      const tagDimensionMap = geneGroups.reduce((map, item) => {
        item.options.forEach((option) => { map[option] = item.id })
        const suggested = aiTagPool[item.id] || []
        suggested.forEach((option) => { map[option] = item.id })
        return map
      }, {})
      const fromAssets = assets
        .flatMap((asset) => [
          ...(Array.isArray(asset[group.id]) ? asset[group.id] : []),
          ...(asset.tags || []).filter((tag) => tagDimensionMap[tag] === group.id),
        ])
        .filter((tag) => !getGeneOptions(group).includes(tag))

      const pool = [...(aiTagPool[group.id] || [])].sort(() => Math.random() - 0.5)
      const candidates = uniqueTags([...fromAssets, ...pool])
      const nextTags = candidates.slice(0, 3)
      addGeneTags(group.id, nextTags)
      setAiTaggingGroup('')
    }, 280)
  }

  const [sectionRef] = useScrollReveal({ threshold: 0.05 })
  const [geneGridRef, genesVisible] = useStaggeredReveal({ count: 5, staggerMs: 70 })

  return (
    <section id="gene-map" className="section gene-section bento-section-page" style={{ position: 'relative' }} ref={sectionRef}>
      <div className="shell">
        <div className="section-head section-head--compact">
          <p className="eyebrow" data-reveal data-reveal-delay="100">基因图谱 · 智能设计</p>
          <h2 className="gene-section-title" data-reveal data-reveal-delay="200">
            <span style={{ color: '#3d8b5e' }}>形</span><span className="gene-dot-sep">·</span>
            <span style={{ color: '#3b5e8c' }}>色</span><span className="gene-dot-sep">·</span>
            <span style={{ color: '#c9943d' }}>工</span><span className="gene-dot-sep">·</span>
            <span style={{ color: '#b84a3a' }}>意</span><span className="gene-dot-sep">·</span>
            <span style={{ color: '#8a7a60' }}>用</span>
            <span className="gene-multiply">×</span>
            <span style={{ color: 'var(--gold)' }}>绣</span>
          </h2>
          <p className="gene-section-desc" data-reveal data-reveal-delay="300">五维基因定义每件纹样的形态骨架与文化语义，AI 以此为基，将其转写为可直接检索、智能生成、上机绣作的完整设计方案。</p>
        </div>
      </div>
      <BentoCardGrid>
        <ParticleCard
          className="magic-bento-card magic-bento-card--border-glow gene-control-card"
          style={{ '--glow-color': '211, 178, 106', aspectRatio: 'auto' }}
          glowColor="211, 178, 106" enableTilt={false} clickEffect={false} enableMagnetism={false}
        >
          <div className="magic-bento-card__watermark" aria-hidden="true">绣</div>
          <div className="magic-bento-card__header">
            <div className="magic-bento-card__label">文化基因</div>
            <button className="ai-tag-all-btn" type="button" onClick={() => geneGroups.forEach((g) => addAiGeneTags(g))} title="一键为全部五个维度AI拓展标签">
              AI拓展全部
            </button>
            <button className="ai-clear-btn" type="button" onClick={() => { setPersistedGeneTags({}); setAiTaggingGroup(""); localStorage.removeItem("zhenyun-gene-tags") }} title="清除所有自定义标签">
              清除标签
            </button>
          </div>
          <div className="magic-bento-card__content gene-control-card__content">
            <div ref={geneGridRef} className="gene-grid-compact" style={{ flex: 1 }}>
              {geneGroups.map((g, i) => (
                <article
                  className="gene-cell"
                  key={g.id}
                  data-dim={g.id}
                  style={{
                    opacity: genesVisible ? 1 : 0,
                    transform: genesVisible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
                    transition: `opacity 500ms cubic-bezier(0.22, 1, 0.36, 1), transform 600ms cubic-bezier(0.22, 1, 0.36, 1)`,
                    transitionDelay: genesVisible ? `${i * 70}ms` : '0ms',
                  }}
                >
                  <div className="gene-cell-head">
                    <span>{g.key}</span>
                    <div>
                      <strong>{g.label}</strong>
                      <small>{g.description}</small>
                    </div>
                  </div>
                  <div className="chip-row">
                    {getGeneOptions(g).map((option) => (
                      <button
                        className={selection[g.id] === option ? 'chip chip-active' : 'chip'}
                        key={option}
                        type="button"
                        onClick={() => onSelect(g.id, option)}
                      >
                        {option}{(g.options || []).includes(option) ? "" : (
                          <span className="chip-remove" title="删除此标签" onClick={(e) => { e.stopPropagation(); removeGeneTag(g.id, option) }}>&#x2715;</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="gene-tag-editor">
                    <input
                      value={manualGeneInputs[g.id] || ""}
                      onChange={(event) => setManualGeneInputs((current) => ({ ...current, [g.id]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          addManualGeneTag(g.id)
                        }
                      }}
                      placeholder="回车添加标签"
                    />
                                    </div>
                </article>
              ))}
            </div>
          </div>
        </ParticleCard>
        <ParticleCard
          className="magic-bento-card magic-bento-card--border-glow semantic-card"
          style={{ '--glow-color': '211, 178, 106', aspectRatio: 'auto' }}
          glowColor="211, 178, 106" enableTilt={false} clickEffect={false} enableMagnetism={false}
        >
          <div className="magic-bento-card__watermark" aria-hidden="true">AI</div>
          <div className="magic-bento-card__header">
            <div className="magic-bento-card__label">AI 检索语义</div>
          </div>
          <div className="magic-bento-card__content semantic-card__content">
            <div className="gene-summary" style={{ marginBottom: '10px' }}>
              {geneGroups.map((group) => (
                <span className="gene-tag" key={group.id} data-dim={group.id}>
                  <span className="gene-tag-key">{group.key}</span>
                  <span className="gene-tag-val">{selection[group.id]}</span>
                </span>
              ))}
            </div>
            <div className="semantic-prompt">
              <p className="prompt" style={{ margin: 0, fontSize: '12px' }}>
                {prompt}
              </p>
              <button
                className="copy-prompt-btn"
                type="button"
                onClick={(e) => { e.stopPropagation(); copyToClipboard(prompt) }}
                title="复制提示词"
              >
                复制
              </button>
            </div>
          </div>
        </ParticleCard>
        <ParticleCard
          className="magic-bento-card magic-bento-card--border-glow"
          style={{ '--glow-color': '211, 178, 106', aspectRatio: 'auto' }}
          glowColor="211, 178, 106" enableTilt={false} clickEffect={false} enableMagnetism={false}
        >
          <div className="magic-bento-card__watermark" aria-hidden="true" style={{ fontSize: '5em' }}>创</div>
          <div className="magic-bento-card__header" style={{ marginBottom: '4px' }}>
            <div className="magic-bento-card__label">智能学习与创作</div>
          </div>
          <div className="magic-bento-card__content" style={{ flex: 1, fontSize: '12px', minHeight: 0 }}>
            <h4 className="bento-card-sub">自动读取本地数据库，完成相关图片归类、搜索、整合与新纹样生成</h4>
            <div className="agent-workbench" style={{ gap: '6px' }}>
              <div className="agent-input" style={{ padding: '8px 10px' }}>
                <div className="agent-textarea-wrap">
                  <textarea
                    value={aiQuery}
                    onChange={(event) => setAiQuery(event.target.value)}
                    rows={2}
                    placeholder="输入搜索意图，如：苗绣蝴蝶纹文创包…"
                    style={{ fontSize: '11px', padding: '8px', paddingBottom: '36px' }}
                  />
                  <button className="clear-btn" type="button" onClick={() => setAiQuery("")} title="清空">
                    &#x2715;
                  </button>
                  <button className="paste-btn" type="button" onClick={async () => {
                    const text = await readFromClipboard()
                    if (text) setAiQuery(text)
                  }} title="从剪贴板粘贴文本">
                    粘贴
                  </button>
                </div>
                <div className="agent-controls" style={{ marginTop: '6px', gap: '6px' }}>
                  <select value={aiMode} onChange={(event) => setAiMode(event.target.value)}>
                    <option value="search-create">搜索 + 创作</option>
                    <option value="search-only">仅搜索参考</option>
                    <option value="create-only">仅结合创作</option>
                  </select>
                  <button className="btn btn-primary" type="button" onClick={runAiAgent} disabled={aiLoading}>
                    {aiLoading ? '生成中...' : '自动学习生成'}
                  </button>
                </div>
                {aiError ? <p className="agent-error">{aiError}</p> : null}
              </div>
            </div>
          </div>
        </ParticleCard>
        <ParticleCard
          className="magic-bento-card magic-bento-card--border-glow"
          style={{ '--glow-color': '211, 178, 106', aspectRatio: 'auto' }}
          glowColor="211, 178, 106" enableTilt={false} clickEffect={false} enableMagnetism={false}
        >
          <div className="magic-bento-card__content" style={{ overflow: 'auto' }}>
            <p className="bento-db-title">在线数据库</p>
            <span className="bento-db-count">
              {hasMatches ? `${matchedProducts.length} 个精确匹配样本` : '无精确匹配，展示候选样本'}
            </span>
            <div className="bento-product-mini-grid">
              {displayedProducts.slice(0, 2).map((product) => (
                <ProductCard key={product.id} product={product} compact />
              ))}
            </div>
            {displayedProducts.length > 2 && (
              <button type="button" className="bento-expand-btn" onClick={() => setShowAllProducts(true)}>
                展开全部 {displayedProducts.length} 张
              </button>
            )}
            {showAllProducts && createPortal(
              <div className="fullscreen-overlay" ref={overlayRef} onClick={() => setShowAllProducts(false)}>
                <div className="fullscreen-overlay__panel" ref={el => { overlayPanelRef.current = el }} onClick={(e) => e.stopPropagation()}>
                  <div className="fullscreen-overlay__header">
                    <h3 style={{ margin: 0, fontSize: '20px' }}>数据库</h3>
                    <button type="button" className="fullscreen-overlay__close" onClick={() => setShowAllProducts(false)}>
                      关闭
                    </button>
                  </div>
                  <div className="bento-overlay-grid">
                    {displayedProducts.map((product) => (
                      <ProductCard key={product.id} product={product} compact />
                    ))}
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
        </ParticleCard>
        <ParticleCard
          className="magic-bento-card magic-bento-card--border-glow"
          style={{ '--glow-color': '211, 178, 106', aspectRatio: 'auto' }}
          glowColor="211, 178, 106" enableTilt={false} clickEffect={false} enableMagnetism={false}
        >
          <div className="magic-bento-card__content" style={{ overflow: 'auto' }}>
            <p className="bento-db-title">AI 生成预览</p>
            {hasAiResult ? (
              <>
                <div className="bento-ai-preview-grid">
                  {aiPreviewImages.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={aiResult?.images?.length ? `AI 生成 ${i + 1}` : 'AI 文本方案占位图'}
                      className="bento-ai-preview-img"
                      onClick={() => setPreviewImage(url)}
                    />
                  ))}
                </div>
                {!aiResult?.images?.length && (
                  <p className="bento-ai-preview-notice">当前服务未配置图像生成密钥，已先返回可保存的文本方案。</p>
                )}
                {aiResult.summary && (
                  <p className="bento-ai-preview-summary">{aiResult.summary}</p>
                )}
                {aiResult.creation?.concept && (
                  <p className="bento-ai-preview-concept">{aiResult.creation.concept}</p>
                )}
                <button
                  className="bento-save-btn"
                  type="button"
                  onClick={() => onSaveAiAsset({
                    title: aiResult.creation?.title,
                    category: aiResult.creation?.category,
                    image: aiResult.images?.[0],
                    source: aiResult.images?.length ? '智能生成图片' : '智能整合方案',
                    tags: aiResult.creation?.tags,
                    note: aiResult.creation?.concept,
                    confidence: aiResult.creation?.confidence,
                  })}
                >
                  保存为数据库样本
                </button>
              </>
            ) : (
              <div className="bento-ai-preview-empty">
                <span className="bento-ai-preview-empty-icon">✨</span>
                <p>点击上方"自动学习生成"按钮，AI 生成的纹样预览将显示在此处</p>
              </div>
            )}
          </div>
        </ParticleCard>
      </BentoCardGrid>

      {previewImage && createPortal(
        <div className="preview-overlay" onClick={() => setPreviewImage(null)} onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
          <div className="preview-panel" onClick={(e) => e.stopPropagation()}>
            <div className="preview-panel__head">
              <span>AI 生成预览</span>
              <button className="preview-panel__close" onClick={() => setPreviewImage(null)}>关闭</button>
            </div>
            <img src={previewImage} alt="AI 生成预览" className="preview-panel__image" />
          </div>
        </div>,
        document.body
      )}
    </section>
  )
}
