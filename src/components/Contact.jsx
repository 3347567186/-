import { useState, useEffect, useRef } from 'react'
import { useScrollReveal } from '../hooks/useScrollReveal'

const videoList = [
  { src: '/media/video-1.mp4', poster: '/media/hero-pattern-detail.jpg', label: '纹样生成展示' },
  { src: '/media/video-2.mp4', poster: '/media/hero-machine-demo.jpg', label: '针法工艺适配' },
  { src: '/media/video-3.mp4', poster: '/media/embroidered-panel.jpg', label: '文创产品实拍' },
  { src: '/media/video-4.mp4', poster: '/media/gene-map.jpg', label: '基因图谱展示' },
  { src: '/media/video-6.mp4', poster: '/media/research-gallery.jpg', label: '产品转化案例' },
  { src: '/media/video-7.mp4', poster: '/media/ethnic-textile.jpg', label: '工艺细节展示' },
]

export function Contact() {
  const [ref, visible] = useScrollReveal({ threshold: 0.12 })
  const [active, setActive] = useState(0)
  const videoRefs = useRef([])
  const timerRef = useRef(null)
  const touchStartX = useRef(0)
  const swiped = useRef(false)

  useEffect(() => {
    if (!visible) return
    timerRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % videoList.length)
    }, 4000)
    return () => clearInterval(timerRef.current)
  }, [visible])

  useEffect(() => {
    videoRefs.current.forEach((el, i) => {
      if (!el) return
      if (i === active) {
        el.play().catch(() => {})
      } else {
        el.pause()
        el.currentTime = 0
      }
    })
    clearInterval(timerRef.current)
    if (visible) {
      timerRef.current = setInterval(() => {
        setActive((prev) => (prev + 1) % videoList.length)
      }, 4000)
    }
  }, [active, visible])

  const fadeUp = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(32px)',
    transition: 'opacity 700ms cubic-bezier(0.22, 1, 0.36, 1), transform 800ms cubic-bezier(0.22, 1, 0.36, 1)',
  }

  return (
    <section id="contact" className="contact-section" ref={ref} style={fadeUp}>
      <div className="shell contact-layout">
        <div>
          <h2 data-reveal data-reveal-delay="200">一起把民族刺绣从图案收藏，推进到智能设计与稳定制造</h2>
          <p data-reveal data-reveal-delay="300">
            面向非遗工坊、民族服饰企业、文旅文创团队、职业院校实训基地和设备渠道伙伴，
            提供样机展示、纹样入库、AI 设计打样、工艺参数服务与文创产品转化合作。
          </p>
        </div>
        <div className="contact-card">
          <div className="contact-card__header">
            <span>针韵智绣</span>
            <p>贵州 · 民族文创 · 智能绣花装备</p>
          </div>
          <div className="contact-card__carousel">
            <div
              className="contact-card__carousel-stage"
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; swiped.current = false }}
              onTouchEnd={(e) => {
                const diff = touchStartX.current - e.changedTouches[0].clientX
                if (Math.abs(diff) > 50) {
                  swiped.current = true
                  setActive((prev) =>
                    diff > 0
                      ? (prev + 1) % videoList.length
                      : (prev - 1 + videoList.length) % videoList.length
                  )
                }
              }}
              onClick={() => {
                if (swiped.current) { swiped.current = false; return }
                setActive((prev) => (prev + 1) % videoList.length)
              }}
            >
              {videoList.map((item, i) => (
                <div
                  key={i}
                  className={`contact-card__carousel-slide${i === active ? ' active' : ''}`}
                >
                  <video
                    ref={(el) => (videoRefs.current[i] = el)}
                    src={item.src}
                    poster={item.poster}
                    muted loop playsInline
                  />
                  <span className="contact-card__carousel-label">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="contact-card__carousel-dots">
              {videoList.map((_, i) => (
                <button
                  key={i}
                  className={`contact-card__carousel-dot${i === active ? ' active' : ''}`}
                  onClick={() => setActive(i)}
                  aria-label={`切换到第 ${i + 1} 个视频`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
