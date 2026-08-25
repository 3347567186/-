export function PendingReview({ pendingAssets, activePendingId, onSetActive, onConfirm, onClear, onRemove, isOrganizing, learningHints }) {
  if (!pendingAssets.length) return null
  const activeAsset = pendingAssets.find((a) => a.id === activePendingId) || pendingAssets[0]
  const tagSuggestions = learningHints?.tagSuggestions || []

  return (
    <div className="accordion-item pending-auto">
      <div className="accordion-header static">
        <span className="accordion-title">待确认入库</span>
        <span className="accordion-meta">{pendingAssets.length} 张</span>
      </div>
      <div className="accordion-body">
        <div className="pending-review">
          <div className="pending-head">
            <strong>待确认入库：{pendingAssets.length} 张</strong>
            <button type="button" onClick={onClear}>清空</button>
          </div>
          {tagSuggestions.length ? (
            <div className="pending-suggestions">
              <strong>Plus 建议可加入五维板块的标签</strong>
              <div className="tags">
                {tagSuggestions.map((item) => (
                  <span key={`${item.dimension}-${item.label}`} title={item.reason}>
                    {item.dimension} · {item.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {activeAsset && (
            <div className="pending-stage">
              <img
                src={activeAsset.image || '/media/hero-pattern-detail.jpg'}
                alt={activeAsset.title}
                onError={(e) => { e.currentTarget.src = '/media/hero-pattern-detail.jpg' }}
              />
              <div>
                <span>{activeAsset.category}</span>
                <h4>{activeAsset.title}</h4>
                <p>{activeAsset.note}</p>
                <div className="tags">
                  {(activeAsset.tags || []).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <button type="button" onClick={() => onRemove(activeAsset.id)}>
                  删除这张候选
                </button>
              </div>
            </div>
          )}
          {pendingAssets.length > 1 && (
            <div className="pending-strip">
              {pendingAssets.map((asset) => (
                <button
                  className={activeAsset?.id === asset.id ? 'pending-thumb active' : 'pending-thumb'}
                  key={asset.id}
                  type="button"
                  onClick={() => onSetActive(asset.id)}
                >
                  <img
                    src={asset.image || '/media/hero-pattern-detail.jpg'}
                    alt={asset.title}
                    onError={(e) => { e.currentTarget.src = '/media/hero-pattern-detail.jpg' }}
                  />
                </button>
              ))}
            </div>
          )}
          <div className="pending-actions">
            <button type="button" onClick={onConfirm} disabled={isOrganizing}>
              {isOrganizing ? 'AI 整理中...' : '确认入库并整理'}
            </button>
            <button type="button" onClick={onClear}>取消</button>
          </div>
        </div>
      </div>
    </div>
  )
}
