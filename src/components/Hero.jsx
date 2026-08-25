import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Metric } from './Metric'

gsap.registerPlugin(ScrollTrigger)

const heroVideos = [
  '/media/video-2.mp4',
  '/media/video-4.mp4',
  '/media/video-6.mp4',
  '/media/video-7.mp4',
]

export function Hero() {
  const heroRef = useRef(null)
  const videoRef = useRef(null)
  const megaRef = useRef(null)
  const copyRef = useRef(null)
  const actionsRef = useRef(null)
  const metricsRef = useRef(null)
  const toplineRef = useRef(null)
  const [videoIdx, setVideoIdx] = useState(() => Math.floor(Math.random() * heroVideos.length))

  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return

    // Parallax on video
    const video = videoRef.current
    if (video) {
      gsap.to(video, {
        y: 80,
        scale: 1.06,
        ease: 'none',
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: 'bottom top',
          scrub: 1.2,
        },
      })
    }

    // Hero shade subtle parallax
    const shade = hero.querySelector('.hero-shade')
    if (shade) {
      gsap.to(shade, {
        y: -30,
        opacity: 0.92,
        ease: 'none',
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: 'bottom top',
          scrub: 1,
        },
      })
    }

    const vidTimer = setInterval(() => {
      setVideoIdx((prev) => (prev + 1) % heroVideos.length)
    }, 180000)

    return () => {
      clearInterval(vidTimer)
      ScrollTrigger.getAll().forEach((st) => {
        if (st.trigger === hero || st.trigger?.closest('.hero')) {
          st.kill()
        }
      })
    }
  }, [])


  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

    // Topline stagger
    if (toplineRef.current) {
      const items = toplineRef.current.children
      tl.fromTo(
        items,
        { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.12 }
      )
    }

    // Mega heading character reveal
    if (megaRef.current) {
      const chars = megaRef.current.querySelectorAll('.hero-mega-char')
      tl.fromTo(
        chars,
        { opacity: 0, y: 80, rotateZ: 6 },
        {
          opacity: 1,
          y: 0,
          rotateZ: 0,
          duration: 0.7,
          stagger: 0.06,
          ease: 'back.out(1.4)',
        },
        '-=0.15'
      )
    }

    // Bottom grid entrance
    if (copyRef.current) {
      tl.fromTo(
        copyRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6 },
        '-=0.2'
      )
    }

    if (actionsRef.current) {
      tl.fromTo(
        actionsRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5 },
        '-=0.25'
      )
    }

    if (metricsRef.current) {
      const metrics = metricsRef.current.querySelectorAll('.metric')
      tl.fromTo(
        metrics,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.08 },
        '-=0.2'
      )
    }
  }, [])

  return (
    <section id="hero" className="hero" ref={heroRef}>
      <video
        key={videoIdx}
        ref={videoRef}
        className="hero-video"
        src={heroVideos[videoIdx]}
        poster="/media/hero-exhibition.jpg"
        autoPlay muted loop playsInline
      />
      <div className="hero-shade" />
      <div className="hero-content shell">
        <div className="hero-topline" ref={toplineRef}>
          <p className="eyebrow">民族刺绣 · 数字化传承 · 智能绣花装备</p>
          <span><span style={{ color: '#3d8b5e' }}>形</span> · <span style={{ color: '#3b5e8c' }}>色</span> · <span style={{ color: '#c9943d' }}>工</span> · <span style={{ color: '#b84a3a' }}>意</span> · <span style={{ color: '#8a7a60' }}>用</span></span>
        </div>
        <h1 className="hero-mega" ref={megaRef}>
          <span className="hero-mega-char" style={{ color: 'rgba(59, 94, 140, 0.75)' }}>针</span>
          <span className="hero-mega-char" style={{ color: 'rgba(184, 74, 58, 0.7)' }}>韵</span>
          <span className="hero-mega-char" style={{ color: 'rgba(201, 148, 61, 0.7)' }}>智</span>
          <span className="hero-mega-char" style={{ color: 'rgba(61, 139, 94, 0.7)' }}>绣</span>
        </h1>
        <div className="hero-bottom">
          <div className="hero-copy" ref={copyRef}>
            <strong>87+</strong>
            <span>智能纹样方案生成</span>
            <p>
              以高速独立压脚绣花装备为硬件核心，以文化基因图谱为数据底座，
              打通纹样采集、智能整理、工艺适配与文创产品转化的全链路。
            </p>
          </div>
          <div className="hero-actions" ref={actionsRef}>
            <a href="#gene-map" className="btn btn-primary">查看文化基因库</a>
            <a href="#projects" className="btn btn-secondary">浏览设备与作品</a>
          </div>
        </div>
        <div className="hero-metrics" ref={metricsRef} aria-label="项目关键数据">
          <Metric value="3000+" label="非遗图文采集" />
          <Metric value="17" label="可模仿针法" />
          <Metric value="100+" label="机械调试组装" />
          <Metric value="98%" label="手绣观感相似度" />
        </div>
      </div>
    </section>
  )
}


