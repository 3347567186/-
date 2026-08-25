export function SectionHead({ kicker, title, text }) {
  return (
    <div className="section-head">
      <p className="eyebrow">
        {kicker && kicker.split('').map((ch, i) => (
          <span key={i} className="eyebrow-char" style={{ animationDelay: `${i * 60}ms` }}>{ch}</span>
        ))}
      </p>
      <h2 data-reveal data-reveal-delay="200">{title}</h2>
      <p data-reveal data-reveal-delay="300">{text}</p>
    </div>
  )
}
