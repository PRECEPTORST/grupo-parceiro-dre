// Cliente do sync em nuvem. Fala com /api/estado, que guarda o EstadoDre
// (lançamentos + classificações + orçamentos) num Blob privado compartilhado.
import type { EstadoDre } from './tipos'

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

/** Grava o estado na nuvem (last-write-wins). */
export async function salvarNuvem(estado: EstadoDre): Promise<void> {
  const resp = await fetch('/api/estado', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ estado }),
  })
  verificar401(resp)
  const dados = await lerJson(resp)
  if (!resp.ok) throw new Error(dados?.erro || `Falha ao salvar na nuvem (${resp.status})`)
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
