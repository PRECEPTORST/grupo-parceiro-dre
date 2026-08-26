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
import { LancamentosPage } from '../pages/LancamentosPage'
import { ConfiabilidadePage } from '../pages/ConfiabilidadePage'

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
      valores: { '3.1.01': 480_000, '4.1.01': 400_000 },
      sacas: { '3.1.01': 4000 },
      precoSaca: { '3.1.01': 120 },
      margemSaca: { '3.1.01': 20 },
      origem: 'manual',
      atualizadoEm: '2026-02-01T00:00:00.000Z',
      status: 'aprovado',
      aprovadoPor: 'Demo',
      aprovadoEm: '2026-02-01T00:00:00.000Z',
    },
  ],
  sacas: { '2026-02': { soja: 5200 } },
  // Fatia da Enoki (fonte alternativa) — exercita o seletor de fonte, o selo de
  // status e o diagnóstico da carga sem precisar de rede.
  lancamentosEnoki: [
    { id: 'enoki-nf-1-1', data: '2026-02-05', contaSafragold: '3.1.01', historico: 'NF 900 · SOJA EM GRÃOS · CARGILL', valor: 640_000, origem: 'enoki' },
    { id: 'enoki-nf-2-1', data: '2026-02-20', contaSafragold: '3.1.02', historico: 'NF 901 · MILHO EM GRÃOS · PIF PAF', valor: 180_000, origem: 'enoki' },
    { id: 'enoki-p-10', data: '2026-02-06', contaSafragold: '4.1.01', historico: 'JOSE ROSA · Fat. NFe entrada', valor: 520_000, origem: 'enoki' },
    { id: 'enoki-p-11', data: '2026-02-18', contaSafragold: '4.1.10', historico: 'TRANSPORTES X · Frete', valor: 41_000, origem: 'enoki' },
    { id: 'enoki-p-12', data: '2026-02-22', contaSafragold: '3.2.06', historico: 'CLIENTE Y · devolução de venda', valor: 12_000, origem: 'enoki' },
    { id: 'enoki-p-13', data: '2026-02-25', contaSafragold: '5.1.01', historico: 'AGRO MAQ · imobilizado', valor: 30_000, origem: 'enoki' },
    { id: 'enoki-r-20', data: '2026-02-27', contaSafragold: '4.1.01', historico: 'JOSE ROSA · estorno de compra', valor: -25_000, origem: 'enoki' },
    // Mês PARCIAL (dados só até o dia 5) — exercita o aviso de cobertura.
    { id: 'enoki-nf-9-1', data: '2026-03-05', contaSafragold: '3.1.01', historico: 'NF 950 · SOJA EM GRÃOS · COFCO', valor: 61_000, origem: 'enoki' },
  ],
  sacasEnoki: { '2026-02': { soja: 4450, milho: 2250 } },
  // Volume comprado (informado — a API não traz) + estoque de abertura, para o
  // painel de custo médio móvel (item 3.2) ter o que calcular no demo.
  sacasCompradas: { '2026-02': { soja: 4000 }, '2026-03': { soja: 3000 }, '2026-05': { milho: 2500 } },
  estoqueAbertura: { soja: { sacas: 1200, valor: 150_000 } },
  regrasEnoki: [
    { chave: 'COPASA SANEAMENTO', conta: '4.3.09', confianca: 0.94, justificativa: 'Concessionária de água.', origem: 'ia' },
    { chave: 'TRANSPORTES SILVA', conta: '4.1.10', confianca: 0.62, justificativa: 'Frete, provavelmente de compra.', origem: 'ia' },
  ],
  enokiSync: {
    atualizadoEm: '2026-02-28T14:32:00.000Z',
    de: '2026-01-01',
    ate: '2026-02-28',
    registros: 2121,
    lancamentos: 7,
    homologacao: true,
    completo: true,
    residuos: [
      { chave: 'SICOOB - COOPERATIVA DE CREDITO', centroCusto: 'SEM CC', fluxo: 'saida' as const, quantidade: 38, valor: 812_000, amostras: ['Tarifa mensal de conta', 'Tarifa de TED'] },
      { chave: 'PREFEITURA MUNICIPAL', centroCusto: 'SEM CC', fluxo: 'saida' as const, quantidade: 6, valor: 141_000, amostras: ['ISS sobre serviço'] },
    ],
    gapContratos: {
      totalNf: 239_800_000,
      totalTitulo: 217_900_000,
      gapTotal: 21_900_000,
      gapPct: 9.1,
      razaoMediana: 0.9604,
      contratos: 232,
      distribuicao: { exato: 70, desconto_leve: 55, desconto_forte: 103, titulo_maior: 4 },
      estrutural: true,
      porCompetencia: {},
    },
    descartes: [
      { motivo: 'receita_vem_da_nf', quantidade: 4017, valor: 218_300_000 },
      { motivo: 'nf_transferencia', quantidade: 401, valor: 18_290_000 },
      { motivo: 'nf_cancelada', quantidade: 461, valor: 15_200_000 },
      { motivo: 'nf_remessa', quantidade: 67, valor: 21_100_000 },
    ],
  },
}
// `?demo=vazio` semeia o app SEM dados, para conferir a tela de primeiros passos.
const vazio = new URLSearchParams(location.search).get('demo') === 'vazio'
localStorage.setItem(
  KEY,
  JSON.stringify(vazio ? { lancamentos: [], classificacoes: [], orcamentos: [] } : estado),
)

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
  { rota: 'lancamentos', label: 'Lançamentos' },
  { rota: 'confiabilidade', label: 'Confiabilidade' },
] as const

export function DemoApp() {
  const [rota, setRota] = useState<'orcamento' | 'dre' | 'lancamentos' | 'confiabilidade'>('confiabilidade')
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
          {rota === 'orcamento' ? (
            <OrcamentoPage />
          ) : rota === 'lancamentos' ? (
            <LancamentosPage />
          ) : rota === 'confiabilidade' ? (
            <ConfiabilidadePage />
          ) : (
            <DrePage />
          )}
        </div>
      </DreProvider>
    </AuthContext.Provider>
  )
}
