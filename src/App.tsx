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

function AppAutenticado() {
  const { usuario, sair } = useAuth()
  const [rota, setRota] = useState<Rota>('dashboard')
  const ehAdmin = usuario?.papel === 'admin'
  const rotaEfetiva: Rota = !ehAdmin && rota === 'usuarios' ? 'dashboard' : rota

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-cream-2/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <button className="flex items-center" onClick={() => setRota('dashboard')}>
            <LogoHorizontal height={34} />
            <span className="ml-3 hidden border-l border-line pl-3 font-head text-xs font-semibold uppercase tracking-[0.22em] text-green sm:inline">
              DRE
            </span>
          </button>
          <div className="flex items-center gap-3">
            <IndicadorSync />
            <nav className="flex gap-1">
              <BotaoNav ativo={rotaEfetiva === 'dashboard'} onClick={() => setRota('dashboard')}>
                Início
              </BotaoNav>
              <BotaoNav ativo={rotaEfetiva === 'dre'} onClick={() => setRota('dre')}>
                DRE
              </BotaoNav>
              <BotaoNav ativo={rotaEfetiva === 'orcamento'} onClick={() => setRota('orcamento')}>
                Orçamento
              </BotaoNav>
              <BotaoNav ativo={rotaEfetiva === 'lancamentos'} onClick={() => setRota('lancamentos')}>
                Lançamentos
              </BotaoNav>
              {ehAdmin && (
                <BotaoNav ativo={rotaEfetiva === 'usuarios'} onClick={() => setRota('usuarios')}>
                  Usuários
                </BotaoNav>
              )}
            </nav>
            <div className="flex items-center gap-2 border-l border-line pl-3">
              <span className="hidden text-right text-xs leading-tight sm:block">
                <span className="block font-semibold text-ink">{usuario?.usuario}</span>
                <span className="block text-faint">{usuario ? rotuloPapel[usuario.papel] : ''}</span>
              </span>
              <button
                onClick={sair}
                className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted transition hover:border-green/40 hover:text-green"
              >
                Sair
              </button>
            </div>
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
    offline: { texto: 'Offline (só neste navegador)', cor: 'bg-faint' },
  }
  const s = mapa[statusSync]
  const clicavel = statusSync === 'erro' || statusSync === 'offline'
  return (
    <button
      onClick={() => clicavel && ressincronizar()}
      disabled={!clicavel}
      title={erroSync ?? undefined}
      className={`hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted md:flex ${
        clicavel ? 'cursor-pointer hover:text-ink' : 'cursor-default'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${s.cor} ${s.pisca ? 'animate-pulse' : ''}`} />
      <span>{s.texto}</span>
    </button>
  )
}

function BotaoNav({
  children,
  ativo,
  onClick,
}: {
  children: React.ReactNode
  ativo: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
        ativo ? 'bg-green text-white shadow-sm' : 'text-muted hover:bg-green/8 hover:text-green'
      }`}
    >
      {children}
    </button>
  )
}
