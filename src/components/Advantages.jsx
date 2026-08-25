import { useState } from 'react'
import { advantages } from '../data/constants'
import { SectionHead } from './SectionHead'
import { useScrollReveal, useStaggeredReveal } from '../hooks/useScrollReveal'

export function Advantages() {
  const [headRef, headVisible] = useScrollReveal({ threshold: 0.15 })
  const [gridRef, , getCardStyle] = useStaggeredReveal({
    count: advantages.length,
    staggerMs: 80,
    threshold: 0.1,
  })
  const [expanded, setExpanded] = useState(new Set())

  const toggleCard = (index) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  return (
    <section id="advantages" className="section advantages-section">
      <div className="shell">
        <div
          ref={headRef}
          style={{
            opacity: headVisible ? 1 : 0,
            transform: headVisible ? 'translateY(0)' : 'translateY(28px)',
            transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1), transform 700ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <SectionHead
            kicker="设备优势"
            title={
              <>
                <span style={{ color: 'var(--muted)' }}>从可看到</span>
                <span style={{ color: 'var(--gold)' }}>可持续复制</span>
              </>
            }
            text="优势 = 硬件稳定性 × 针法数据库 × 文化标注 × AI 生成流程"
          />
        </div>
        <div className="advantage-grid" ref={gridRef}>
          {advantages.map((item, index) => {
            const isOpen = expanded.has(index)
            return (
              <article
                className={`advantage-card${isOpen ? ' advantage-card--open' : ''}`}
                key={item.title}
                style={getCardStyle(index)}
                onClick={() => toggleCard(index)}
              >
                <div className="advantage-card__preview">
                  <span>{item.metric}</span>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
                <div className={`advantage-card__details${isOpen ? ' advantage-card__details--open' : ''}`}>
                  <ul>
                    {item.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
                <button className="advantage-card__toggle" aria-label={isOpen ? '收起' : '展开详情'}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={`chevron${isOpen ? ' chevron--up' : ''}`}>
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
