import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import { navItems } from '../data/constants'
import PillNav from './PillNav'
import './PillNav.css'

export function Nav({ isSticky }) {
  const [activeHref, setActiveHref] = useState('')
  const [navVisible, setNavVisible] = useState(true)
  const navRef = useRef(null)
  const prevSticky = useRef(false)
  const lastScrollY = useRef(0)
  const scrollTimer = useRef(null)

  useEffect(() => {
    const updateHash = () => setActiveHref(window.location.hash)
    updateHash()
    window.addEventListener('hashchange', updateHash)
    return () => window.removeEventListener('hashchange', updateHash)
  }, [])

  // Auto-hide nav on mobile when scrolling down, show on scroll up
  const handleScroll = useCallback(() => {
    // Only on mobile (< 761px)
    if (window.innerWidth >= 761) return

    const currentY = window.scrollY
    const delta = currentY - lastScrollY.current
    lastScrollY.current = currentY

    // Don't hide if at top of page
    if (currentY < 60) {
      setNavVisible(true)
      return
    }

    // Debounce rapid scroll events
    if (scrollTimer.current) clearTimeout(scrollTimer.current)

    if (delta > 8) {
      // Scrolling down — hide
      setNavVisible(false)
    } else if (delta < -8) {
      // Scrolling up — show
      setNavVisible(true)
    }

    // Re-show after 3s of no scroll
    scrollTimer.current = setTimeout(() => {
      if (window.scrollY > 60) setNavVisible(true)
    }, 3000)
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
    }
  }, [handleScroll])

  // Pause/resume auto-hide while user interacts with the nav toggle
  const toggleNav = useCallback(() => {
    setNavVisible((v) => !v)
  }, [])

  useEffect(() => {
    const el = navRef.current
    if (!el) return

    if (prevSticky.current !== isSticky) {
      prevSticky.current = isSticky
      gsap.killTweensOf(el)

      if (isSticky) {
        gsap.fromTo(
          el,
          { scale: 0.88, y: -20 },
          {
            scale: 1,
            y: 0,
            duration: 0.8,
            ease: 'elastic.out(1, 0.35)',
            overwrite: 'auto',
          },
        )
      } else {
        gsap.fromTo(
          el,
          { scale: 0.95, y: 10 },
          {
            scale: 1,
            y: 0,
            duration: 0.6,
            ease: 'back.out(2.5)',
            overwrite: 'auto',
          },
        )
      }
    }
  }, [isSticky])

  return (
    <header ref={navRef} className={`site-nav${isSticky ? ' sticky' : ''}${!navVisible ? ' nav-hidden' : ''}`}>
      <PillNav
        logo="/media/brand-logo.svg"
        logoAlt="针韵智绣"
        items={navItems}
        activeHref={activeHref}
        baseColor="rgba(13, 17, 21, 0.88)"
        pillColor="#d3b26a"
        pillTextColor="#15120b"
        hoveredPillTextColor="#d3b26a"
        initialLoadAnimation={false}
        navVisible={navVisible}
        onToggleNav={toggleNav}
      />
    </header>
  )
}
