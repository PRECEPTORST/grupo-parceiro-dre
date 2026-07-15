import { useState } from 'react'
import { DreProvider, useDre } from './context/DreContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DashboardPage } from './pages/DashboardPage'
import { DrePage } from './pages/DrePage'
import { OrcamentoPage } from './pages/OrcamentoPage'
import { LancamentosPage } from './pages/LancamentosPage'
import { Usuarios } from './pages/Usuarios'
import { Login } from './pages/Login'
import { LogoHorizontal } from './components/Logo'
import { rotuloPapel } from './lib/permissoes'

type Rota = 'dashboard' | 'dre' | 'orcamento' | 'lancamentos' | 'usuarios'

export default function App() {
  return (
    <AuthProvider>
      <Portao />
    </AuthProvider>
  )
}

function Portao() {
  const { usuario, carregando } = useAuth()
  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">Carregando…</div>
    )
  }
  if (!usuario) return <Login />
  return (
    <DreProvider>
      <AppAutenticado />
    </DreProvider>
  )
}

const NAV: { rota: Rota; label: string; adminOnly?: boolean }[] = [
  { rota: 'dashboard', label: 'Início' },
  { rota: 'dre', label: 'DRE' },
  { rota: 'orcamento', label: 'Orçamento' },
  { rota: 'lancamentos', label: 'Lançamentos' },
  { rota: 'usuarios', label: 'Usuários', adminOnly: true },
]

function AppAutenticado() {
  const { usuario, sair } = useAuth()
  const [rota, setRota] = useState<Rota>('dashboard')
  const ehAdmin = usuario?.papel === 'admin'
  const rotaEfetiva: Rota = !ehAdmin && rota === 'usuarios' ? 'dashboard' : rota

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-cream-2/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-8 py-4">
          <button onClick={() => setRota('dashboard')} className="shrink-0">
            <LogoHorizontal height={40} />
          </button>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV.filter((n) => !n.adminOnly || ehAdmin).map((n) => {
              const ativo = rotaEfetiva === n.rota
              return (
                <button
                  key={n.rota}
                  onClick={() => setRota(n.rota)}
                  className={`relative py-1 text-[13px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                    ativo ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {n.label}
                  {ativo && (
                    <span className="absolute -bottom-[17px] left-0 right-0 h-[2px] bg-gold" />
                  )}
                </button>
              )
            })}
          </nav>

          <div className="flex items-center gap-3">
            <IndicadorSync />
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-xs font-semibold text-ink">{usuario?.usuario}</div>
              <div className="text-[11px] text-faint">{usuario ? rotuloPapel[usuario.papel] : ''}</div>
            </div>
            <button
              onClick={sair}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-gold/50 hover:text-gold-deep"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main key={rotaEfetiva} className="animate-fade">
        {rotaEfetiva === 'dashboard' && <DashboardPage />}
        {rotaEfetiva === 'dre' && <DrePage />}
        {rotaEfetiva === 'orcamento' && <OrcamentoPage />}
        {rotaEfetiva === 'lancamentos' && <LancamentosPage />}
        {rotaEfetiva === 'usuarios' && <Usuarios />}
      </main>
    </div>
  )
}

function IndicadorSync() {
  const { statusSync, erroSync, ressincronizar } = useDre()
  const mapa: Record<typeof statusSync, { texto: string; cor: string; pisca?: boolean }> = {
    carregando: { texto: 'Carregando…', cor: 'bg-faint', pisca: true },
    salvando: { texto: 'Salvando…', cor: 'bg-gold', pisca: true },
    sincronizado: { texto: 'Salvo na nuvem', cor: 'bg-green' },
    erro: { texto: 'Falha ao salvar', cor: 'bg-danger' },
    offline: { texto: 'Offline', cor: 'bg-faint' },
  }
  const s = mapa[statusSync]
  const clicavel = statusSync === 'erro' || statusSync === 'offline'
  return (
    <button
      onClick={() => clicavel && ressincronizar()}
      disabled={!clicavel}
      title={erroSync ?? s.texto}
      className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted lg:flex"
    >
      <span className={`h-2 w-2 rounded-full ${s.cor} ${s.pisca ? 'animate-pulse' : ''}`} />
      <span>{s.texto}</span>
    </button>
  )
}
