// Ingestão de FLUXO DE CAIXA real da API Safra Cloud (ERP Enoki).
//
// A API é financeira: LancamentosFinanceiros (recebimentos) + LancamentosFinanceirosPagar
// (pagamentos). Cada título vira um MovimentoCaixa (entrada/saida) com a data do
// dinheiro (quitação se quitado, senão vencimento). O front alimenta o motor de
// caixa com esses movimentos reais (seam `movimentosReais` em src/lib/caixa.ts).
//
// A normalização espelha src/lib/enoki.ts (testada) — duplicada aqui porque as
// funções serverless não compartilham bundle com o front (padrão do repo).
//
// Config (ambiente): ENOKI_BASE_URL, ENOKI_API_KEY, ENOKI_EMPRESAS (csv, default "1").
import { authConfigurada, usuarioAtual } from '../lib/auth.js'

export const config = { maxDuration: 120 }

const NAMESPACE = '/api/Customizados/v1/ParceiroDoGrao'
const DATA_MIGRACAO = '2026-01-01'
const TOP = 200
const MAX_PAGINAS = 40 // trava de segurança por consulta (40 × 200 = 8000 registros)

interface MovimentoCaixa {
  id: string
  data: string
  tipo: 'entrada' | 'saida'
  valor: number
  descricao?: string
  centroCusto?: string
}

function enokiConfigurado(): boolean {
  return !!process.env.ENOKI_BASE_URL && !!process.env.ENOKI_API_KEY
}

function numeroEnoki(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let t = String(v ?? '').replace(/\s/g, '')
  if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

function soData(iso: unknown): string {
  return iso ? String(iso).slice(0, 10) : ''
}

function paraMovimento(b: any, tipo: 'entrada' | 'saida', idx: number): MovimentoCaixa | null {
  if (!b) return null
  const quitado = b.quitado === true
  const dataQuit = soData(b.dataQuitacao)
  if (quitado && dataQuit === DATA_MIGRACAO) return null
  const data = quitado ? dataQuit : soData(b.dataVencimento)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  const valor = Math.abs(quitado ? numeroEnoki(b.valorPago) || numeroEnoki(b.valor) : numeroEnoki(b.valor))
  if (valor < 0.005) return null
  const parceiro = String(b.parceiroNome ?? '').trim()
  const cc = String(b.centroCusto ?? '').trim()
  const descricao = [parceiro, cc || String(b.descricao ?? '')].filter(Boolean).join(' · ').slice(0, 120)
  const id = `enoki-${tipo === 'entrada' ? 'r' : 'p'}-${b.idItemLancamento ?? b.idLancamento ?? idx}`
  return { id, data, tipo, valor, descricao: descricao || undefined, centroCusto: cc || undefined }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(path: string, tent = 0): Promise<any[]> {
  const base = process.env.ENOKI_BASE_URL!.replace(/\/$/, '')
  const r = await fetch(`${base}${NAMESPACE}${path}`, {
    headers: { 'X-Api-Key': process.env.ENOKI_API_KEY!, accept: 'application/json' },
  })
  if (r.status === 429 && tent < 6) {
    await sleep(1500 * (tent + 1))
    return get(path, tent + 1)
  }
  await sleep(250) // ~0,25s entre requests (evita 429)
  if (!r.ok) return []
  const j = await r.json().catch(() => [])
  return Array.isArray(j) ? j : []
}

/** Paginação por cursor `desdeId` (exclusivo) + top=200 (satura). */
async function puxarPaginado(endpoint: string, filtros: string): Promise<any[]> {
  let cursor = 0
  const out: any[] = []
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const lote = await get(`/${endpoint}?${filtros}&desdeId=${cursor}&top=${TOP}`)
    if (!lote.length) break
    out.push(...lote)
    const mx = Math.max(...lote.map((x) => Number(x.idItemLancamento) || 0))
    if (lote.length < TOP || mx <= cursor) break
    cursor = mx
  }
  return out
}

/** Quebra [de, ate] em janelas de ≤ ~90 dias (limite da API). */
function janelas(de: string, ate: string): [string, string][] {
  const out: [string, string][] = []
  let ini = new Date(de + 'T00:00:00')
  const fim = new Date(ate + 'T00:00:00')
  while (ini <= fim) {
    const f = new Date(ini)
    f.setDate(f.getDate() + 89)
    const fReal = f > fim ? fim : f
    out.push([ini.toISOString().slice(0, 10), fReal.toISOString().slice(0, 10)])
    ini = new Date(fReal)
    ini.setDate(ini.getDate() + 1)
  }
  return out
}

export default async function handler(req: any, res: any) {
  if (!authConfigurada()) return res.status(500).json({ erro: 'Autenticação não configurada.' })
  if (!(await usuarioAtual(req))) return res.status(401).json({ erro: 'Não autenticado.' })

  if (!enokiConfigurado()) {
    return res.status(200).json({ configurado: false, movimentos: [] })
  }

  const menos3 = new Date(); menos3.setMonth(menos3.getMonth() - 3)
  const mais12 = new Date(); mais12.setMonth(mais12.getMonth() + 12)
  const de = String(req.query?.de ?? menos3.toISOString().slice(0, 10))
  const ate = String(req.query?.ate ?? mais12.toISOString().slice(0, 10))
  const empresas = (process.env.ENOKI_EMPRESAS ?? '1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  try {
    const brutos: MovimentoCaixa[] = []
    const vistos = new Set<string>()
    const add = (arr: any[], tipo: 'entrada' | 'saida') =>
      arr.forEach((b, i) => {
        const m = paraMovimento(b, tipo, i)
        if (m && !vistos.has(m.id)) { vistos.add(m.id); brutos.push(m) }
      })

    for (const emp of empresas) {
      for (const [ini, fim] of janelas(de, ate)) {
        const base = `idEmpresa=${emp}&dataVencInicio=${ini}&dataVencFim=${fim}`
        add(await puxarPaginado('LancamentosFinanceiros', base), 'entrada')
        add(await puxarPaginado('LancamentosFinanceirosPagar', base), 'saida')
      }
    }

    const entradas = brutos.filter((m) => m.tipo === 'entrada')
    const saidas = brutos.filter((m) => m.tipo === 'saida')
    res.status(200).json({
      configurado: true,
      movimentos: brutos,
      meta: {
        de, ate, empresas,
        entradas: entradas.length,
        saidas: saidas.length,
        atualizadoEm: new Date().toISOString(),
        homologacao: /homologacao/.test(process.env.ENOKI_BASE_URL ?? ''),
      },
    })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha ao puxar Enoki: ${e?.message ?? String(e)}` })
  }
}
