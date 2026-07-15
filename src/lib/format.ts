const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(valor: number): string {
  if (!Number.isFinite(valor)) return '—'
  return brl.format(valor)
}

const pct = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** Recebe o percentual já em escala 0–100 (ex.: 18.5 → "18,5%"). */
export function formatPct(valor: number): string {
  if (!Number.isFinite(valor)) return '—'
  return pct.format(valor / 100)
}

const brlCompacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Moeda compacta para eixos de gráfico (ex.: 1200000 → "R$ 1,2 mi"). */
export function formatBRLCompact(valor: number): string {
  if (!Number.isFinite(valor)) return '—'
  return brlCompacto.format(valor)
}

const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export function formatNum(valor: number): string {
  if (!Number.isFinite(valor)) return '—'
  return num.format(valor)
}
