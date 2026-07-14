import { estadoDreVazio, type EstadoDre } from './tipos'

const STORAGE_KEY = 'grupo-parceiro-dre:v1'

export type { EstadoDre }

export function estadoInicial(): EstadoDre {
  return estadoDreVazio()
}

function valido(e: any): e is EstadoDre {
  return (
    !!e &&
    typeof e === 'object' &&
    Array.isArray(e.lancamentos) &&
    Array.isArray(e.classificacoes) &&
    Array.isArray(e.orcamentos)
  )
}

export function carregarEstado(): EstadoDre {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return estadoInicial()
    const parsed = JSON.parse(raw)
    return valido(parsed) ? parsed : estadoInicial()
  } catch {
    return estadoInicial()
  }
}

export function salvarEstado(state: EstadoDre): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage indisponível (modo privado etc.) — app segue em memória.
  }
}
