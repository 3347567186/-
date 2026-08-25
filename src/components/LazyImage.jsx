import { useState, useRef, useEffect } from 'react'

const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#161e22" width="400" height="400"/></svg>`
  )

export function LazyImage({ src, alt, className = '', style = {}, fallback = '/media/hero-pattern-detail.jpg', aspectRatio, ...rest }) {
  const [currentSrc, setCurrentSrc] = useState(PLACEHOLDER)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const imgRef = useRef(null)
  const observerRef = useRef(null)
  const triedRef = useRef(false)

  useEffect(() => {
    const el = imgRef.current
    if (!el) return

    // If already in viewport or no observer needed, start loading immediately
    const startLoading = () => {
      if (triedRef.current) return
      triedRef.current = true

      const img = new Image()
      img.onload = () => {
        setCurrentSrc(img.src)
        setLoaded(true)
      }
      img.onerror = () => {
        setCurrentSrc(fallback)
        setError(true)
        setLoaded(true)
      }
      img.src = src
    }

    // Also start loading if the element is already visible
    const rect = el.getBoundingClientRect()
    const isVisible = rect.top < window.innerHeight + 200 && rect.bottom > -200
    if (isVisible) {
      startLoading()
      return
    }

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startLoading()
          observerRef.current?.unobserve(el)
        }
      },
      { rootMargin: '200px 0px' }
    )

    observerRef.current.observe(el)
    return () => observerRef.current?.disconnect()
  }, [src, fallback])

  return (
    <div
      className={`lazy-image-wrap ${className}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#101419',
        aspectRatio: aspectRatio || 'auto',
        ...style,
      }}
    >
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        className={`lazy-image ${loaded ? 'lazy-image--loaded' : ''} ${error ? 'lazy-image--error' : ''}`}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: loaded && !error ? 1 : 0.3,
          transition: 'opacity 400ms ease, filter 400ms ease',
          filter: loaded && !error ? 'none' : 'blur(8px)',
        }}
        {...rest}
      />
    </div>
  )
}
