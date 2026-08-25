import { geneGroups } from '../data/constants'

export function ProductCard({ product, compact }) {
  const dimMap = Object.fromEntries(
    geneGroups.flatMap((g) => g.options.map((opt) => [opt, g.key])),
  )
  const tags = product.tags || []
  const displayTags = tags.map((tag) => {
    const dim = dimMap[tag]
    return dim ? `${dim}:${tag}` : tag
  })

  if (compact) {
    return (
      <article className="product-card product-card--compact">
        <img src={product.image} alt={product.title} />
        <div className="product-body">
          <h4>{product.title}</h4>
        </div>
      </article>
    )
  }

  return (
    <article className="product-card">
      <img src={product.image} alt={product.title} />
      <div className="product-body">
        <span className="status">{product.status || product.category}</span>
        <h4>{product.title}</h4>
        <div className="tags">
          {displayTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
    </article>
  )
}
