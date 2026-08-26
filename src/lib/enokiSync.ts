// Cliente da sincronização Enoki → DRE (item 1.3 do ROADMAP.md, lado do front).
//
// O endpoint `api/enoki-dre.ts` não consegue puxar a carga histórica inteira numa
// invocação (rate limit + 120s), então devolve um CURSOR e `concluido: false`.
// Aqui está o laço que chama de novo até terminar, acumulando os registros crus,
// e no fim entrega tudo já NORMALIZADO por `normalizarEnokiDre`.
//
// A rede fica isolada em `buscar` (injetável) para o laço ser testável sem HTTP.

import { normalizarEnokiDre, type ConfigEnokiDre, type ResultadoEnokiDre } from './enokiDre'
import { analisarGapContratos } from './gapContratos'

export interface ProgressoSync {
  /** 0..100 — fração das tarefas concluídas no servidor. */
  progresso: number
  tarefasFeitas: number
  tarefas: number
  /** Registros crus acumulados até agora. */
  registros: number
  /** Quantas chamadas ao endpoint já foram feitas. */
  passos: number
}

export interface OpcoesSyncEnoki {
  /** Início da janela ('YYYY-MM-DD'). Padrão: 1º de janeiro do ano corrente. */
  de?: string
  /** Fim da janela ('YYYY-MM-DD'). Padrão: hoje. */
  ate?: string
  /** Chamado a cada passo, para a barra de progresso. */
  aoProgredir?: (p: ProgressoSync) => void
  /** Trava de segurança contra laço infinito. */
  maxPassos?: number
  /** Injeção para teste. Padrão: `fetch` global. */
  buscar?: typeof fetch
  /** Configuração da normalização (raízes de CNPJ do grupo). */
  config?: ConfigEnokiDre
}

export interface RetornoSyncEnoki extends ResultadoEnokiDre {
  /** false quando as variáveis de ambiente da Enoki não estão setadas. */
  configurado: boolean
  /** false se o laço parou no `maxPassos` antes de concluir. */
  completo: boolean
  meta: {
    de: string
    ate: string
    passos: number
    registros: number
    empresas: string[]
    homologacao: boolean
    atualizadoEm: string
  }
}

const MAX_PASSOS_PADRAO = 40

/** Puxa a janela inteira da Enoki, seguindo o cursor, e devolve já normalizado. */
export async function sincronizarEnokiDre(opcoes: OpcoesSyncEnoki = {}): Promise<RetornoSyncEnoki> {
  const buscar = opcoes.buscar ?? fetch
  const maxPassos = opcoes.maxPassos ?? MAX_PASSOS_PADRAO

  const nfs: any[] = []
  const pagar: any[] = []
  const receber: any[] = []

  let cursor: { tarefa: number; desdeId: number } | null = null
  let passos = 0
  let concluido = false
  let configurado = true
  let meta: any = {}

  while (passos < maxPassos) {
    const params = new URLSearchParams()
    if (opcoes.de) params.set('de', opcoes.de)
    if (opcoes.ate) params.set('ate', opcoes.ate)
    if (cursor) {
      params.set('tarefa', String(cursor.tarefa))
      params.set('desdeId', String(cursor.desdeId))
    }

    const resp = await buscar(`/api/enoki-dre?${params.toString()}`, {
      headers: { accept: 'application/json' },
    })
    const d = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error(d?.erro || `Erro ${resp.status}`)
    passos++

    if (d.configurado === false) {
      configurado = false
      concluido = true
      break
    }

    nfs.push(...(d.nfs ?? []))
    pagar.push(...(d.pagar ?? []))
    receber.push(...(d.receber ?? []))
    meta = d.meta ?? meta

    opcoes.aoProgredir?.({
      progresso: Number(d.meta?.progresso ?? 0),
      tarefasFeitas: Number(d.meta?.tarefasFeitas ?? 0),
      tarefas: Number(d.meta?.tarefas ?? 0),
      registros: nfs.length + pagar.length + receber.length,
      passos,
    })

    if (d.concluido) {
      concluido = true
      break
    }
    cursor = d.cursor ?? null
    // Servidor disse que não concluiu mas não mandou cursor: para para não repetir.
    if (!cursor) break
  }

  const normalizado = configurado
    ? normalizarEnokiDre({ nfs, pagar, receber }, opcoes.config)
    : {
        lancamentos: [],
        sacas: {},
        descartes: [],
        residuos: [],
        colisoes: [],
        gapContratos: analisarGapContratos([], []),
      }

  return {
    ...normalizado,
    configurado,
    completo: concluido,
    meta: {
      de: String(meta.de ?? opcoes.de ?? ''),
      ate: String(meta.ate ?? opcoes.ate ?? ''),
      passos,
      registros: nfs.length + pagar.length + receber.length,
      empresas: meta.empresas ?? [],
      homologacao: !!meta.homologacao,
      atualizadoEm: new Date().toISOString(),
    },
  }
}
