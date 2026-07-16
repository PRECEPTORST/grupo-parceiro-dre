import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const raiz = createRoot(document.getElementById('root')!)

// Modo de verificação local (só em dev): `?demo` mocka a auth e semeia dados
// para conferir a UI sem backend/login. Import dinâmico sob o guard DEV → não
// entra no bundle de produção.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
  import('./dev/demo').then(({ DemoApp }) => raiz.render(<StrictMode><DemoApp /></StrictMode>))
} else {
  raiz.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
