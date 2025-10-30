'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Check localStorage for saved theme
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.setAttribute('data-theme', savedTheme)
    } else {
      // Default to dark mode
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
  }

  // Prevent hydration mismatch
  if (!mounted) {
    return <div className="h-10 w-32"></div>
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
      </span>
      <label className="toggle-switch">
        <input
          type="checkbox"
          checked={theme === 'light'}
          onChange={toggleTheme}
          aria-label="Toggle theme"
        />
        <span className="toggle-slider"></span>
      </label>
    </div>
  )
}
