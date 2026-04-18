import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './globals.css'
import App from './App'
import { initAuth, installFetchInterceptor } from './lib/auth'

async function bootstrap() {
  await initAuth()
  installFetchInterceptor()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  )

  // Fade out the instant HTML/CSS splash once React has hydrated the shell.
  // One more rAF so the first frame is painted before we start the transition.
  const splash = document.getElementById('specrails-splash')
  if (splash) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        splash.classList.add('is-hidden')
        // Remove from DOM after the CSS transition completes (220ms).
        setTimeout(() => splash.remove(), 300)
      })
    })
  }
}

bootstrap()
