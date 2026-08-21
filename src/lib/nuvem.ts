// Cliente do sync em nuvem. Fala com /api/estado, que guarda o EstadoDre
// (lançamentos + classificações + orçamentos) num Blob privado compartilhado.
import type { EstadoDre, Grao, LancamentoCanonico, EnokiSyncMeta } from './tipos'

/**
 * Fatia PESADA do estado, guardada num documento próprio (`/api/estado-enoki`).
 * São ~2,4 MB de lançamentos que só mudam quando há sincronização — misturá-los
 * ao estado principal fazia cada edição de orçamento reenviar tudo, e a projeção
 * do ano fechado batia no limite de 4,5 MB da Vercel.
 */
export interface FatiaEnoki {
  lancamentosEnoki: LancamentoCanonico[]
  sacasEnoki?: Record<string, Partial<Record<Grao, number>>>
  enokiSync?: EnokiSyncMeta
}

/** Campos que NÃO vão no documento principal (vão na fatia). */
export const CAMPOS_ENOKI = ['lancamentosEnoki', 'sacasEnoki', 'enokiSync'] as const

/** Separa o estado em (leve, pesado) para gravar em documentos distintos. */
export function separarFatiaEnoki(estado: EstadoDre): { leve: EstadoDre; enoki: FatiaEnoki } {
  const leve = { ...estado }
  for (const campo of CAMPOS_ENOKI) delete (leve as Record<string, unknown>)[campo]
  return {
    leve,
    enoki: {
      lancamentosEnoki: estado.lancamentosEnoki ?? [],
      sacasEnoki: estado.sacasEnoki,
      enokiSync: estado.enokiSync,
    },
  }
}

/** Junta de volta o que foi separado. */
export function juntarFatiaEnoki(leve: EstadoDre, enoki: FatiaEnoki | null): EstadoDre {
  if (!enoki?.lancamentosEnoki?.length) return leve
  return {
    ...leve,
    lancamentosEnoki: enoki.lancamentosEnoki,
    sacasEnoki: enoki.sacasEnoki,
    enokiSync: enoki.enokiSync,
  }
}

/** Evento global disparado quando a sessão perde validade (401) — ex.: revogado. */
export const EVENTO_SESSAO_EXPIRADA = 'preceptor:sessao-expirada'

function verificar401(resp: Response): void {
  if (resp.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA))
  }
}

/** Baixa o estado salvo na nuvem, ou null se ainda não houver nada gravado. */
export async function carregarNuvem(): Promise<EstadoDre | null> {
  const resp = await fetch('/api/estado', { headers: { accept: 'application/json' } })
  verificar401(resp)
  const dados = await lerJson(resp)
  if (!resp.ok) throw new Error(dados?.erro || `Falha ao carregar da nuvem (${resp.status})`)
  return (dados?.estado as EstadoDre | null) ?? null
}

/** Grava o estado LEVE na nuvem (last-write-wins). A fatia Enoki vai à parte. */
export async function salvarNuvem(estado: EstadoDre): Promise<void> {
  const { leve } = separarFatiaEnoki(estado)
  const resp = await fetch('/api/estado', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ estado: leve }),
  })
  verificar401(resp)
  const dados = await lerJson(resp)
  if (!resp.ok) throw new Error(dados?.erro || `Falha ao salvar na nuvem (${resp.status})`)
}

/** Baixa a fatia Enoki. Devolve null quando ainda não há carga (ou sem permissão). */
export async function carregarEnokiNuvem(): Promise<FatiaEnoki | null> {
  const resp = await fetch('/api/estado-enoki', { headers: { accept: 'application/json' } })
  verificar401(resp)
  const dados = await lerJson(resp)
  if (!resp.ok) throw new Error(dados?.erro || `Falha ao carregar a Enoki (${resp.status})`)
  return (dados?.enoki as FatiaEnoki | null) ?? null
}

/** Grava a fatia Enoki. Chamada SÓ depois de sincronizar, não a cada edição. */
export async function salvarEnokiNuvem(estado: EstadoDre): Promise<void> {
  const { enoki } = separarFatiaEnoki(estado)
  const resp = await fetch('/api/estado-enoki', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enoki }),
  })
  verificar401(resp)
  const dados = await lerJson(resp)
  if (!resp.ok) throw new Error(dados?.erro || `Falha ao salvar a Enoki (${resp.status})`)
}

// Em `vite dev` sem funções, /api/* devolve index.html (200 text/html) —
// tratamos como "sem nuvem" para o app cair no modo offline (localStorage).
async function lerJson(resp: Response): Promise<any> {
  const tipo = resp.headers.get('content-type') || ''
  if (!tipo.includes('application/json')) {
    throw new Error('Sync em nuvem indisponível neste ambiente (sem função /api/estado).')
  }
  return resp.json()
}
