// Normalização dos dados da API Safra Cloud (ERP Enoki) para o caixa.
//
// A API é FINANCEIRA (contas a pagar/receber), não contábil — ver §11/§26 do
// context.md. Cada título vira um `MovimentoCaixa`:
//   • quitado  → data = dataQuitacao, valor = valorPago (dinheiro que já moveu);
//   • em aberto → data = dataVencimento, valor = valor de face (agendado).
// Recebimentos = 'entrada'; Pagamentos = 'saida'. Puro e testável — a chamada
// HTTP (paginação, 429, janelas) fica no endpoint `api/enoki-caixa.ts`.
import type { MovimentoCaixa } from './tipos'

/** Lote sintético de abertura de saldo — excluir (armadilha #4 do manual). */
export const DATA_MIGRACAO = '2026-01-01'

function soData(iso: unknown): string {
  if (!iso) return ''
  return String(iso).slice(0, 10) // '2026-08-15T00:00:00-03:00' → '2026-08-15'
}

/** Valores vêm da API como string em formato inglês ("40161.5498"). Tolera number
 *  e o caso pt-BR sem milhar ("1234,56"). */
export function numeroEnoki(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let t = String(v ?? '').replace(/\s/g, '')
  if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.') // pt-BR sem separador de milhar
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

/** Converte um título cru da API em MovimentoCaixa (ou null se deve ser descartado). */
export function paraMovimento(b: any, tipo: 'entrada' | 'saida', idx = 0): MovimentoCaixa | null {
  if (!b) return null
  const quitado = b.quitado === true
  const dataQuit = soData(b.dataQuitacao)
  if (quitado && dataQuit === DATA_MIGRACAO) return null // abertura de saldo sintética
  const data = quitado ? dataQuit : soData(b.dataVencimento)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  const bruto = quitado ? numeroEnoki(b.valorPago) || numeroEnoki(b.valor) : numeroEnoki(b.valor)
  const valor = Math.abs(bruto)
  if (valor < 0.005) return null
  const parceiro = String(b.parceiroNome ?? '').trim()
  const cc = String(b.centroCusto ?? '').trim()
  const descricao = [parceiro, cc || String(b.descricao ?? '')].filter(Boolean).join(' · ').slice(0, 120)
  const id = `enoki-${tipo === 'entrada' ? 'r' : 'p'}-${b.idItemLancamento ?? b.idLancamento ?? idx}`
  return { id, data, tipo, valor, descricao: descricao || undefined }
}

/** Normaliza um lote cru (de um endpoint) em MovimentoCaixa[], deduplicando por id. */
export function normalizarMovimentos(brutos: any[], tipo: 'entrada' | 'saida'): MovimentoCaixa[] {
  const out: MovimentoCaixa[] = []
  const vistos = new Set<string>()
  ;(brutos ?? []).forEach((b, i) => {
    const m = paraMovimento(b, tipo, i)
    if (!m || vistos.has(m.id)) return
    vistos.add(m.id)
    out.push(m)
  })
  return out
}
