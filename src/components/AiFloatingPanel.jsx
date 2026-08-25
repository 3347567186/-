import { useRef } from 'react'

export function AiFloatingPanel({
  aiResult,
  floatingPos,
  floatingWH,
  floatingLocked,
  showAiSummary,
  floatingPosRef,
  floatingWHRef,
  onSetPosition,
  onSetSize,
  onToggleLock,
  onToggleSummary,
  onSaveAsset,
  onPreviewImage,
}) {
  const floatingDragRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })

  const startFloatingDrag = (e) => {
    if (floatingLocked) return
    floatingDragRef.current = true
    dragStartRef.current = {
      x: e.clientX - floatingPosRef.current.x,
      y: e.clientY - floatingPosRef.current.y,
    }
    const onMove = (ev) => {
      if (!floatingDragRef.current) return
      onSetPosition({
        x: ev.clientX - dragStartRef.current.x,
        y: ev.clientY - dragStartRef.current.y,
      })
    }
    const onUp = () => {
      floatingDragRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const startResize = (e) => {
    if (floatingLocked) return
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startW = floatingWHRef.current.w
    const startH = floatingWHRef.current.h
    const onMove = (ev) => {
      onSetSize({
        w: Math.max(220, startW + (ev.clientX - startX)),
        h: Math.max(180, startH + (ev.clientY - startY)),
      })
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (!aiResult?.images?.length) return null

  return (
    <div
      className="ai-floating-panel"
      style={{
        animation: 'floatIn 400ms cubic-bezier(0.22, 1, 0.36, 1) both',
        left: floatingPos.x,
        top: floatingPos.y,
        width: floatingWH.w,
        height: floatingWH.h,
      }}
    >
      <div className="ai-floating-panel__backdrop" />
      <div
        className="ai-floating-panel__header"
        style={{ cursor: floatingLocked ? 'default' : 'grab' }}
        onMouseDown={startFloatingDrag}
      >
        <span className="ai-floating-panel__title">AI 生成预览</span>
        <button
          type="button"
          onClick={onToggleLock}
          className={`ai-floating-panel__lock-btn${floatingLocked ? ' ai-floating-panel__lock-btn--locked' : ''}`}
        >
          {floatingLocked ? '已固定' : '解放'}
        </button>
      </div>

      <div className="ai-floating-panel__toolbar">
        <button
          type="button"
          onClick={onToggleSummary}
          className={`ai-floating-panel__toggle-btn${showAiSummary ? ' ai-floating-panel__toggle-btn--active' : ''}`}
        >
          {showAiSummary ? '收起摘要' : 'AI 结果摘要'}
        </button>
      </div>

      <div className="ai-floating-panel__body">
        {showAiSummary && aiResult ? (
          <div className="ai-floating-panel__summary">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>提供方：</span>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{aiResult.provider}</span>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: '12px', lineHeight: '1.5', color: 'var(--text)' }}>{aiResult.summary}</p>
            {aiResult.creation?.concept ? (
              <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block', marginBottom: '2px' }}>创作概念</span>
                <p style={{ margin: 0, fontSize: '11px', lineHeight: '1.4', color: 'rgba(255,255,255,0.6)' }}>{aiResult.creation.concept}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="ai-floating-panel__image-grid">
            {aiResult.images.map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                className="ai-floating-panel__image"
                onDoubleClick={() => onPreviewImage(url)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="ai-floating-panel__footer">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() =>
            onSaveAsset({
              title: aiResult.creation?.title,
              category: aiResult.creation?.category,
              image: aiResult.images?.[0],
              source: aiResult.images?.length ? '智能生成图片' : '智能整合方案',
              tags: aiResult.creation?.tags,
              note: aiResult.creation?.concept,
              confidence: aiResult.creation?.confidence,
            })
          }
          style={{ flex: 1, fontSize: '12px' }}
        >
          保存为数据库样本
        </button>
      </div>

      <div
        onMouseDown={startResize}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: '20px',
          height: '20px',
          cursor: 'nwse-resize',
          zIndex: 1,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ position: 'absolute', right: 4, bottom: 4 }}>
          <line x1="9" y1="12" x2="12" y2="9" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
          <line x1="5" y1="12" x2="12" y2="5" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  )
}
