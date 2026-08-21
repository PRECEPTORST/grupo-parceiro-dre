// Sincronização AGENDADA da Enoki — item 4.2 do ROADMAP.md.
//
// Roda pelo cron da Vercel (ver `vercel.json`), sem sessão de usuário. Como não
// há navegador para percorrer o cursor, este endpoint faz o oposto do
// `enoki-dre.ts`: puxa uma janela CURTA (os últimos dias), que cabe numa
// invocação só, e grava o resultado no Blob.
//
// Por que janela curta em vez da carga inteira: a carga histórica são ~20 mil
// registros e não cabe em 120s. O delta diário é pequeno. A primeira carga
// continua sendo feita pela tela, onde o usuário vê o progresso.
//
// AUTENTICAÇÃO: cron da Vercel manda `Authorization: Bearer $CRON_SECRET`. Sem o
// segredo configurado o endpoint recusa — nunca fica aberto.
import { gravarDoc } from '../lib/blobdoc.js'

export const config = { maxDuration: 120 }

/** Prefixo do documento no Blob onde o delta cru é guardado. */
const DOC_DELTA = 'enoki-delta'

const NAMESPACE = '/api/Customizados/v1/ParceiroDoGrao'
const TOP = 200
const MAX_PAGINAS = 40
const PAUSA_MS = 260
/** Quantos dias para trás puxar a cada execução. Cobre atraso de lançamento. */
const DIAS_JANELA = 21

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

async function puxar(endpoint: string, filtros: string, campoId: string): Promise<any[]> {
  let cursor = 0
  const out: any[] = []
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const lote = await get(`/${endpoint}?${filtros}&desdeId=${cursor}&top=${TOP}`)
    if (!lote.length) break
    out.push(...lote)
    const maior = Math.max(...lote.map((x: any) => Number(x?.[campoId]) || 0))
    if (lote.length < TOP || maior <= cursor) break
    cursor = maior
  }
  return out
}

function autorizado(req: any): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false // sem segredo, o endpoint não abre
  const header = String(req.headers?.authorization ?? '')
  return header === `Bearer ${segredo}`
}

export default async function handler(req: any, res: any) {
  if (!autorizado(req)) {
    return res.status(401).json({ erro: 'Não autorizado.' })
  }
  if (!enokiConfigurado()) {
    return res.status(200).json({ configurado: false })
  }

  const hoje = new Date()
  const inicio = new Date(hoje)
  inicio.setDate(inicio.getDate() - DIAS_JANELA)
  const de = inicio.toISOString().slice(0, 10)
  const ate = hoje.toISOString().slice(0, 10)
  const empresas = (process.env.ENOKI_EMPRESAS ?? '1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  try {
    const nfs: any[] = []
    const pagar: any[] = []
    const receber: any[] = []

    for (const emp of empresas) {
      nfs.push(...(await puxar('NfSaida', `idEmpresa=${emp}&dataInicio=${de}&dataFim=${ate}`, 'idNf')))
      const filtroTitulo = `idEmpresa=${emp}&dataLancInicio=${de}&dataLancFim=${ate}`
      pagar.push(
        ...(await puxar('LancamentosFinanceirosPagar', filtroTitulo, 'idItemLancamento')),
      )
      receber.push(...(await puxar('LancamentosFinanceiros', filtroTitulo, 'idItemLancamento')))
    }

    // Guarda o delta CRU no Blob. A normalização é do front (`enokiDre.ts`), que
    // é onde a regra de negócio vive e é testada — o cron não a duplica.
    const doc = {
      atualizadoEm: new Date().toISOString(),
      de,
      ate,
      empresas,
      nfs,
      pagar,
      receber,
    }
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) {
      return res.status(500).json({ erro: 'BLOB_READ_WRITE_TOKEN não configurado.' })
    }
    await gravarDoc(DOC_DELTA, doc, token)

    res.status(200).json({
      configurado: true,
      de,
      ate,
      empresas,
      registros: nfs.length + pagar.length + receber.length,
      atualizadoEm: doc.atualizadoEm,
    })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha no cron da Enoki: ${e?.message ?? String(e)}` })
  }
}

