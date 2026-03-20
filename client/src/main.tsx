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
}

bootstrap()
