import { useEffect, useRef, useState } from 'react'

/**
 * Scroll-triggered reveal hook — returns a ref and an `isVisible` boolean.
 * `isVisible` toggles true/false as the element enters/leaves the viewport,
 * so animations replay every time the user scrolls back to the section.
 */
export function useScrollReveal({ threshold = 0.12, rootMargin = '0px 0px -40px 0px' } = {}) {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
      },
      { threshold, rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  return [ref, isVisible]
}

/**
 * Staggered children reveal — returns [containerRef, isVisible, getChildStyle(index)].
 * `isVisible` toggles true/false as the container enters/leaves the viewport,
 * so the staggered animation replays each time.
 */
export function useStaggeredReveal({ staggerMs = 60, threshold = 0.08 } = {}) {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
      },
      { threshold, rootMargin: '0px 0px -60px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  const getChildStyle = (index) => ({
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(24px)',
    transition: `opacity 500ms cubic-bezier(0.22, 1, 0.36, 1), transform 600ms cubic-bezier(0.22, 1, 0.36, 1)`,
    transitionDelay: isVisible ? `${index * staggerMs}ms` : '0ms',
  })

  return [ref, isVisible, getChildStyle]
}
