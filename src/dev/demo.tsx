// Modo de VERIFICAÇÃO LOCAL — só em desenvolvimento (import.meta.env.DEV).
//
// Mocka a autenticação e semeia um cenário no localStorage para conferir a UI
// sem backend nem login. Ative com `?demo` rodando `npm run dev`. É carregado
// por import dinâmico sob o guard `import.meta.env.DEV` no main.tsx, então NUNCA
// entra no bundle de produção.
import { useState } from 'react'
import { AuthContext, type UsuarioLogado } from '../context/AuthContext'
import { DreProvider } from '../context/DreContext'
import { OrcamentoPage } from '../pages/OrcamentoPage'
import { DrePage } from '../pages/DrePage'

const KEY = 'grupo-parceiro-dre:v1'

// Cenário: soja com sazonalidade (fev/mar), milho pontual, sacas realizadas em
// fevereiro e um orçamento de soja (sacas × preço) para exercitar meta×realizado.
const estado = {
  lancamentos: [
    { id: 's1', data: '2026-02-10', contaSafragold: '3.1.01', historico: 'Venda soja', valor: 600_000 },
    { id: 's2', data: '2026-03-10', contaSafragold: '3.1.01', historico: 'Venda soja', valor: 400_000 },
    { id: 'c1', data: '2026-02-15', contaSafragold: '4.1.01', historico: 'Compra soja', valor: 300_000 },
    { id: 'm1', data: '2026-05-10', contaSafragold: '3.1.02', historico: 'Venda milho', valor: 200_000 },
  ],
  classificacoes: [],
  orcamentos: [
    {
      competencia: '2026-02',
      valores: { '3.1.01': 480_000 },
      sacas: { '3.1.01': 4000 },
      precoSaca: { '3.1.01': 120 },
      origem: 'manual',
      atualizadoEm: '2026-02-01T00:00:00.000Z',
      status: 'aprovado',
      aprovadoPor: 'Demo',
      aprovadoEm: '2026-02-01T00:00:00.000Z',
    },
  ],
  sacas: { '2026-02': { soja: 5200 } },
}
localStorage.setItem(KEY, JSON.stringify(estado))

const usuario: UsuarioLogado = { id: 'demo', usuario: 'Demo', papel: 'socio' }
const auth = {
  usuario,
  precisaSetup: false,
  carregando: false,
  entrar: async () => {},
  configurarAdmin: async () => {},
  sair: async () => {},
}

const abas = [
  { rota: 'orcamento', label: 'Orçamento' },
  { rota: 'dre', label: 'DRE' },
] as const

export function DemoApp() {
  const [rota, setRota] = useState<'orcamento' | 'dre'>('orcamento')
  return (
    <AuthContext.Provider value={auth}>
      <DreProvider>
        <div className="min-h-screen">
          <div className="flex items-center gap-2 border-b border-line bg-cream/60 px-4 py-2">
            <span className="mr-2 text-[11px] font-semibold uppercase tracking-wider text-danger">
              DEMO local
            </span>
            {abas.map((a) => (
              <button
                key={a.rota}
                onClick={() => setRota(a.rota)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  rota === a.rota ? 'bg-green text-white' : 'text-muted hover:bg-green/10'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          {rota === 'orcamento' ? <OrcamentoPage /> : <DrePage />}
        </div>
      </DreProvider>
    </AuthContext.Provider>
  )
}
