import { useState } from 'react'
import { DreProvider, useDre } from './context/DreContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DrePage } from './pages/DrePage'
import { OrcamentoPage } from './pages/OrcamentoPage'
import { LancamentosPage } from './pages/LancamentosPage'
import { Usuarios } from './pages/Usuarios'
import { Login } from './pages/Login'
import { LogoP, Wordmark } from './components/Logo'

type Rota = 'dre' | 'orcamento' | 'lancamentos' | 'usuarios'

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
      <div className="flex min-h-screen items-center justify-center text-slateblue">Carregando…</div>
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
  const [rota, setRota] = useState<Rota>('dre')
  const ehAdmin = usuario?.papel === 'admin'

  // Só admin acessa a gestão de usuários (defesa extra além do menu).
  const rotaEfetiva: Rota = !ehAdmin && rota === 'usuarios' ? 'dre' : rota

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-cyan/15 bg-navy/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <button className="flex items-center gap-2.5" onClick={() => setRota('dre')}>
            <LogoP size={26} />
            <Wordmark size={16} />
            <span className="ml-2 hidden text-xs font-medium uppercase tracking-[0.2em] text-slateblue sm:inline">
              DRE · Grupo Parceiro
            </span>
          </button>
          <div className="flex items-center gap-3">
            <IndicadorSync />
            <nav className="flex gap-1">
              <BotaoNav ativo={rotaEfetiva === 'dre'} onClick={() => setRota('dre')}>
                DRE
              </BotaoNav>
              <BotaoNav ativo={rotaEfetiva === 'orcamento'} onClick={() => setRota('orcamento')}>
                Orçamento
              </BotaoNav>
              <BotaoNav
                ativo={rotaEfetiva === 'lancamentos'}
                onClick={() => setRota('lancamentos')}
              >
                Lançamentos
              </BotaoNav>
              {ehAdmin && (
                <BotaoNav ativo={rotaEfetiva === 'usuarios'} onClick={() => setRota('usuarios')}>
                  Usuários
                </BotaoNav>
              )}
            </nav>
            <div className="flex items-center gap-2 border-l border-cyan/15 pl-3">
              <span className="hidden text-right text-xs leading-tight sm:block">
                <span className="block font-semibold text-white">{usuario?.usuario}</span>
                <span className="block text-faint">
                  {usuario?.papel === 'admin' ? 'Administrador' : 'Sócio / leitura'}
                </span>
              </span>
              <button
                onClick={sair}
                className="rounded-lg border border-cyan/20 px-2.5 py-1 text-xs font-semibold text-slateblue transition hover:text-white"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      {rotaEfetiva === 'dre' && <DrePage />}
      {rotaEfetiva === 'orcamento' && <OrcamentoPage />}
      {rotaEfetiva === 'lancamentos' && <LancamentosPage />}
      {rotaEfetiva === 'usuarios' && <Usuarios />}
    </>
  )
}

function IndicadorSync() {
  const { statusSync, erroSync, ressincronizar } = useDre()
  const mapa: Record<typeof statusSync, { texto: string; cor: string; pisca?: boolean }> = {
    carregando: { texto: 'Carregando…', cor: 'bg-slateblue', pisca: true },
    salvando: { texto: 'Salvando…', cor: 'bg-amber-400', pisca: true },
    sincronizado: { texto: 'Salvo na nuvem', cor: 'bg-cyan' },
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
      className={`flex items-center gap-1.5 rounded-full border border-cyan/15 px-2.5 py-1 text-xs font-medium text-slateblue ${
        clicavel ? 'cursor-pointer hover:text-white' : 'cursor-default'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${s.cor} ${s.pisca ? 'animate-pulse' : ''}`} />
      <span className="hidden sm:inline">{s.texto}</span>
      {clicavel && <span className="hidden text-faint sm:inline">· tentar de novo</span>}
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
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        ativo ? 'bg-cyan/15 text-cyan' : 'text-slateblue hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
