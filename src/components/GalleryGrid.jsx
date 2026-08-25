import { LazyImage } from './LazyImage'

export function GalleryGrid({ assets, selectedIds, onToggleSelect, onLearn, onDeleteSingle, showGallery, onToggleGallery }) {
  return (
    <div className="accordion-item">
      <button className="accordion-header" onClick={onToggleGallery}>
        <span className="accordion-title">数据库</span>
        <span className="accordion-meta">{assets.length} 张</span>
        <span className={'accordion-arrow' + (showGallery ? ' open' : '')} />
      </button>
      {showGallery && (
        <div className="accordion-body">
          {assets.length ? (
            <div className="database-main">
              {assets.map((asset) => (
              <article className="asset-card" key={asset.id}>
                <label className="asset-select">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(asset.id)}
                    onChange={() => onToggleSelect(asset.id)}
                  />
                  <span>选择</span>
                </label>
                <LazyImage src={asset.image || '/media/hero-pattern-detail.jpg'} alt={asset.title} />
                <div className="asset-body">
                  <div className="asset-meta">
                    <span>{asset.category}</span>
                    <span>{asset.confidence}%</span>
                  </div>
                  <h3>{asset.title}</h3>
                  <p>{asset.note}</p>
                  <div className="tags">
                    {asset.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="asset-footer">
                    <span>{asset.source} · 学习 {asset.learned} 次</span>
                    <div className="asset-footer-actions">
                      <button type="button" onClick={() => onLearn(asset.id)}>学习一次</button>
                      <button type="button" className="danger-action" onClick={() => onDeleteSingle(asset.id, asset.title)}>删除</button>
                    </div>
                  </div>
                </div>
              </article>
              ))}
            </div>
          ) : (
            <div className="database-empty" role="status">
              <strong>当前筛选没有匹配图片</strong>
              <p>换一个关键词或分类，或者使用上方的 AI 自学习补充候选素材。</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
