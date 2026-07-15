import { useState, type ReactNode } from 'react'
import { DreProvider, useDre } from './context/DreContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DashboardPage } from './pages/DashboardPage'
import { DrePage } from './pages/DrePage'
import { OrcamentoPage } from './pages/OrcamentoPage'
import { CaixaPage } from './pages/CaixaPage'
import { ConfiabilidadePage } from './pages/ConfiabilidadePage'
import { LancamentosPage } from './pages/LancamentosPage'
import { Usuarios } from './pages/Usuarios'
import { Login } from './pages/Login'
import { rotuloPapel, podeAdministrar } from './lib/permissoes'
import {
  IconInicio,
  IconDre,
  IconOrcamento,
  IconCaixa,
  IconConfiabilidade,
  IconLancamentos,
  IconUsuarios,
  IconSair,
} from './components/icons'

type Rota = 'dashboard' | 'dre' | 'orcamento' | 'caixa' | 'confiabilidade' | 'lancamentos' | 'usuarios'

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

const NAV: { rota: Rota; label: string; Icone: (p: { size?: number }) => ReactNode; adminOnly?: boolean }[] = [
  { rota: 'dashboard', label: 'Início', Icone: IconInicio },
  { rota: 'dre', label: 'DRE', Icone: IconDre },
  { rota: 'orcamento', label: 'Orçamento', Icone: IconOrcamento },
  { rota: 'caixa', label: 'Fluxo de caixa', Icone: IconCaixa },
  { rota: 'confiabilidade', label: 'Confiabilidade', Icone: IconConfiabilidade },
  { rota: 'lancamentos', label: 'Lançamentos', Icone: IconLancamentos },
  { rota: 'usuarios', label: 'Usuários', Icone: IconUsuarios, adminOnly: true },
]

function AppAutenticado() {
  const { usuario, sair } = useAuth()
  const [rota, setRota] = useState<Rota>('dashboard')
  const ehAdmin = podeAdministrar(usuario?.papel)
  const rotaEfetiva: Rota = !ehAdmin && rota === 'usuarios' ? 'dashboard' : rota

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-16 flex-col bg-sidebar text-white lg:w-60">
        {/* Logo + nome do produto */}
        <div className="flex h-24 flex-col items-center justify-center gap-1.5 border-b border-white/10 px-3">
          <img src="/gp-mark-white.png" alt="Grupo Parceiro" className="h-8 w-auto lg:hidden" />
          <img
            src="/gp-logo-white.png"
            alt="Grupo Parceiro Agronegócios"
            className="hidden h-12 w-auto lg:block"
          />
          <span className="hidden font-head text-[11px] font-semibold uppercase tracking-[0.32em] text-gold-soft lg:block">
            GPResults
          </span>
        </div>

        {/* Navegação */}
        <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
          {NAV.filter((n) => !n.adminOnly || ehAdmin).map(({ rota: r, label, Icone }) => {
            const ativo = rotaEfetiva === r
            return (
              <button
                key={r}
                onClick={() => setRota(r)}
                title={label}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  ativo ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'
                }`}
              >
                {ativo && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-gold" />
                )}
                <span className={ativo ? 'text-gold-soft' : ''}>
                  <Icone size={20} />
                </span>
                <span className="hidden lg:inline">{label}</span>
              </button>
            )
          })}
        </nav>

        {/* Rodapé: sync + usuário */}
        <div className="border-t border-white/10 px-2 py-3">
          <div className="px-1 pb-2">
            <IndicadorSync />
          </div>
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/20 font-head text-sm font-semibold text-gold-soft">
              {usuario?.usuario?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="hidden min-w-0 flex-1 leading-tight lg:block">
              <div className="truncate text-xs font-semibold text-white">{usuario?.usuario}</div>
              <div className="truncate text-[11px] text-white/45">
                {usuario ? rotuloPapel[usuario.papel] : ''}
              </div>
            </div>
            <button
              onClick={sair}
              title="Sair"
              className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <IconSair size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="ml-16 lg:ml-60">
        <main key={rotaEfetiva} className="animate-fade">
          {rotaEfetiva === 'dashboard' && <DashboardPage />}
          {rotaEfetiva === 'dre' && <DrePage />}
          {rotaEfetiva === 'orcamento' && <OrcamentoPage />}
          {rotaEfetiva === 'caixa' && <CaixaPage />}
          {rotaEfetiva === 'confiabilidade' && <ConfiabilidadePage />}
          {rotaEfetiva === 'lancamentos' && <LancamentosPage />}
          {rotaEfetiva === 'usuarios' && <Usuarios />}
        </main>
      </div>
    </div>
  )
}

function IndicadorSync() {
  const { statusSync, erroSync, ressincronizar } = useDre()
  const mapa: Record<typeof statusSync, { texto: string; cor: string; pisca?: boolean }> = {
    carregando: { texto: 'Carregando…', cor: 'bg-white/40', pisca: true },
    salvando: { texto: 'Salvando…', cor: 'bg-gold', pisca: true },
    sincronizado: { texto: 'Salvo na nuvem', cor: 'bg-lime' },
    erro: { texto: 'Falha ao salvar', cor: 'bg-danger' },
    offline: { texto: 'Offline', cor: 'bg-white/30' },
  }
  const s = mapa[statusSync]
  const clicavel = statusSync === 'erro' || statusSync === 'offline'
  return (
    <button
      onClick={() => clicavel && ressincronizar()}
      disabled={!clicavel}
      title={erroSync ?? s.texto}
      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-[11px] font-medium text-white/45"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${s.cor} ${s.pisca ? 'animate-pulse' : ''}`} />
      <span className="hidden truncate lg:inline">{s.texto}</span>
    </button>
  )
}
