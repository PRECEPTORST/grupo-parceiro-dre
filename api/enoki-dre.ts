// Ingestão da Enoki para o DRE por COMPETÊNCIA — item 1.3 do ROADMAP.md.
//
// DIVISÃO DE RESPONSABILIDADE (diferente do `enoki-caixa.ts`, de propósito):
// este endpoint é TRANSPORTE PURO — HTTP, paginação, janelas de data, throttling
// e enxugamento de campos. Toda a regra de negócio (competência, unidade por
// produto, eliminação intragrupo, estornos, mapa de centro de custo) fica em
// `src/lib/enokiDre.ts`, que é testado e roda no front. Duplicar aquelas ~400
// linhas aqui seria pedir para as duas cópias divergirem.
//
// CONTINUAÇÃO (por que existe um cursor)
// --------------------------------------
// Uma carga histórica completa são ~20 mil registros e a API tem rate limit
// agressivo (429). Isso não cabe nos 120s de uma invocação. Então o trabalho é
// dividido em TAREFAS determinísticas (empresa × janela × fonte): o endpoint
// processa o que couber no orçamento de tempo e devolve `cursor` + `concluido:
// false`. O cliente chama de novo com o cursor até concluir. Como a lista de
// tarefas é gerada igual a cada chamada, o cursor é só {tarefa, desdeId}.
//
// CARGA INCREMENTAL: passe uma janela curta (`de`/`ate` dos últimos dias). Os
// ids repetidos na borda são deduplicados na normalização.
//
// Config (ambiente): ENOKI_BASE_URL, ENOKI_API_KEY, ENOKI_EMPRESAS (csv, default "1").
import { authConfigurada, usuarioAtual } from '../lib/auth.js'

export const config = { maxDuration: 120 }

const NAMESPACE = '/api/Customizados/v1/ParceiroDoGrao'
const TOP = 200
const MAX_PAGINAS = 60 // trava por tarefa (60 × 200 = 12 mil registros)
const DIAS_JANELA = 90 // limite prático da API
const ORCAMENTO_MS = 85_000 // devolve o cursor antes dos 120s da função
const PAUSA_MS = 260 // ~4 req/s — abaixo do limite que dispara 429

type Fonte = 'nf' | 'pagar' | 'receber'

const ENDPOINT: Record<Fonte, string> = {
  nf: 'NfSaida',
  pagar: 'LancamentosFinanceirosPagar',
  receber: 'LancamentosFinanceiros',
}

/** Campo de id usado como cursor de paginação em cada fonte. */
const CAMPO_ID: Record<Fonte, string> = {
  nf: 'idNf',
  pagar: 'idItemLancamento',
  receber: 'idItemLancamento',
}

interface Tarefa {
  empresa: string
  fonte: Fonte
  de: string
  ate: string
}

function enokiConfigurado(): boolean {
  return !!process.env.ENOKI_BASE_URL && !!process.env.ENOKI_API_KEY
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(caminho: string, tent = 0): Promise<any[]> {
  const base = process.env.ENOKI_BASE_URL!.replace(/\/$/, '')
  const r = await fetch(`${base}${NAMESPACE}${caminho}`, {
    headers: { 'X-Api-Key': process.env.ENOKI_API_KEY!, accept: 'application/json' },
  })
  if (r.status === 429 && tent < 6) {
    await sleep(1500 * (tent + 1))
    return get(caminho, tent + 1)
  }
  await sleep(PAUSA_MS)
  if (!r.ok) return []
  const j = await r.json().catch(() => [])
  return Array.isArray(j) ? j : []
}

/** Quebra [de, ate] em janelas de ≤ DIAS_JANELA dias. */
function janelas(de: string, ate: string): [string, string][] {
  const out: [string, string][] = []
  let ini = new Date(de + 'T00:00:00')
  const fim = new Date(ate + 'T00:00:00')
  while (ini <= fim) {
    const f = new Date(ini)
    f.setDate(f.getDate() + DIAS_JANELA - 1)
    const fReal = f > fim ? fim : f
    out.push([ini.toISOString().slice(0, 10), fReal.toISOString().slice(0, 10)])
    ini = new Date(fReal)
    ini.setDate(ini.getDate() + 1)
  }
  return out
}

/**
 * Lista DETERMINÍSTICA de tarefas. A ordem não pode mudar entre chamadas — o
 * cursor é um índice nesta lista.
 */
function montarTarefas(empresas: string[], de: string, ate: string): Tarefa[] {
  const tarefas: Tarefa[] = []
  for (const empresa of empresas) {
    for (const [ini, fim] of janelas(de, ate)) {
      for (const fonte of ['nf', 'pagar', 'receber'] as Fonte[]) {
        tarefas.push({ empresa, fonte, de: ini, ate: fim })
      }
    }
  }
  return tarefas
}

/** Filtros de data de cada fonte (a NF usa nomes diferentes dos títulos). */
function filtrosDeData(t: Tarefa): string {
  if (t.fonte === 'nf') return `dataInicio=${t.de}&dataFim=${t.ate}`
  // COMPETÊNCIA: filtra pela data do LANÇAMENTO (fato gerador), não da quitação.
  return `dataLancInicio=${t.de}&dataLancFim=${t.ate}`
}

// ---------------------------------------------------------------------------
// Enxugamento: só os campos que a normalização usa (corta ~70% do payload).
// ---------------------------------------------------------------------------

function enxugarNf(nf: any) {
  return {
    idNf: nf?.idNf,
    numeroNf: nf?.numeroNf,
    dataEmissao: nf?.dataEmissao,
    status: nf?.status,
    tipoOperacao: nf?.tipoOperacao,
    finalidade: nf?.finalidade,
    valorTotalNf: nf?.valorTotalNf,
    destinatarioNome: nf?.destinatarioNome,
    destinatarioCpfCnpj: nf?.destinatarioCpfCnpj,
    itens: (nf?.itens ?? []).map((i: any) => ({
      idItem: i?.idItem,
      produto: i?.produto,
      quantidade: i?.quantidade,
      valorTotal: i?.valorTotal,
    })),
  }
}

function enxugarTitulo(t: any) {
  return {
    idItemLancamento: t?.idItemLancamento,
    idLancamento: t?.idLancamento,
    dataLancamento: t?.dataLancamento,
    dataVencimento: t?.dataVencimento,
    valor: t?.valor,
    parceiroNome: t?.parceiroNome,
    descricao: t?.descricao,
    centroCusto: t?.centroCusto,
  }
}

interface ResultadoTarefa {
  registros: any[]
  /** Cursor onde parou; 0 = tarefa concluída. */
  desdeId: number
  concluida: boolean
  requests: number
}

/** Executa uma tarefa (com paginação) respeitando o prazo restante. */
async function executarTarefa(t: Tarefa, desdeId: number, prazo: number): Promise<ResultadoTarefa> {
  const campoId = CAMPO_ID[t.fonte]
  const filtros = `idEmpresa=${t.empresa}&${filtrosDeData(t)}`
  const registros: any[] = []
  let cursor = desdeId
  let requests = 0

  for (let p = 0; p < MAX_PAGINAS; p++) {
    if (Date.now() > prazo) return { registros, desdeId: cursor, concluida: false, requests }
    const lote = await get(`/${ENDPOINT[t.fonte]}?${filtros}&desdeId=${cursor}&top=${TOP}`)
    requests++
    if (!lote.length) break
    const enxugar: (x: any) => any = t.fonte === 'nf' ? enxugarNf : enxugarTitulo
    registros.push(...lote.map(enxugar))
    const maior = Math.max(...lote.map((x: any) => Number(x?.[campoId]) || 0))
    if (lote.length < TOP || maior <= cursor) break
    cursor = maior
  }
  return { registros, desdeId: 0, concluida: true, requests }
}

export default async function handler(req: any, res: any) {
  if (!authConfigurada()) return res.status(500).json({ erro: 'Autenticação não configurada.' })
  if (!(await usuarioAtual(req))) return res.status(401).json({ erro: 'Não autenticado.' })

  if (!enokiConfigurado()) {
    return res.status(200).json({ configurado: false, nfs: [], pagar: [], receber: [], concluido: true })
  }

  const hoje = new Date().toISOString().slice(0, 10)
  const inicioAno = `${new Date().getFullYear()}-01-01`
  const de = String(req.query?.de ?? inicioAno)
  const ate = String(req.query?.ate ?? hoje)
  const empresas = (process.env.ENOKI_EMPRESAS ?? '1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const tarefas = montarTarefas(empresas, de, ate)
  let indice = Math.max(0, Number(req.query?.tarefa ?? 0) || 0)
  let desdeId = Math.max(0, Number(req.query?.desdeId ?? 0) || 0)

  const prazo = Date.now() + ORCAMENTO_MS
  const nfs: any[] = []
  const pagar: any[] = []
  const receber: any[] = []
  let requests = 0

  try {
    while (indice < tarefas.length) {
      if (Date.now() > prazo) break
      const tarefa = tarefas[indice]
      const r = await executarTarefa(tarefa, desdeId, prazo)
      requests += r.requests
      const destino = tarefa.fonte === 'nf' ? nfs : tarefa.fonte === 'pagar' ? pagar : receber
      destino.push(...r.registros)

      if (r.concluida) {
        indice++
        desdeId = 0
      } else {
        desdeId = r.desdeId
        break // acabou o prazo no meio da paginação: retoma daqui
      }
    }

    const concluido = indice >= tarefas.length
    res.status(200).json({
      configurado: true,
      nfs,
      pagar,
      receber,
      concluido,
      // Cursor para a próxima chamada (ausente quando concluído).
      cursor: concluido ? null : { tarefa: indice, desdeId },
      meta: {
        de,
        ate,
        empresas,
        tarefas: tarefas.length,
        tarefasFeitas: Math.min(indice, tarefas.length),
        progresso: Math.round((Math.min(indice, tarefas.length) / tarefas.length) * 100),
        requests,
        registros: nfs.length + pagar.length + receber.length,
        atualizadoEm: new Date().toISOString(),
        homologacao: /homologacao/.test(process.env.ENOKI_BASE_URL ?? ''),
      },
    })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha ao puxar Enoki: ${e?.message ?? String(e)}` })
  }
}
