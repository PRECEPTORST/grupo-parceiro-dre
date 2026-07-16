// Periodicidade do planejamento orçamentário — DETERMINÍSTICO. Zero IA.
//
// O orçamento é SEMPRE armazenado mês a mês (um Orcamento por competência), mas
// pode ser EDITADO em blocos: mensal, trimestral, quadrimestral ou anual. A
// periodicidade é apenas a LENTE de edição — a resolução do dado continua mensal
// e o DRE segue comparando competência a competência sem saber da periodicidade.
//
// Ao informar um total de período, ele é distribuído pelos meses seguindo a
// SAZONALIDADE do histórico da conta (a venda de grãos concentra em certos
// meses); sem histórico, distribui igual. A soma dos meses fecha com o total.
import type { LancamentoCanonico, MapaClassificacao } from './tipos'
import { GRAO_DE_CONTA } from './planoContas'

export const PERIODICIDADES = ['mensal', 'trimestral', 'quadrimestral', 'anual'] as const
export type Periodicidade = (typeof PERIODICIDADES)[number]

export const ROTULO_PERIODICIDADE: Record<Periodicidade, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  quadrimestral: 'Quadrimestral',
  anual: 'Anual',
}

/** Quantos meses cada periodicidade abrange. */
export const MESES_POR_PERIODO: Record<Periodicidade, number> = {
  mensal: 1,
  trimestral: 3,
  quadrimestral: 4,
  anual: 12,
}

const ROTULOS_PERIODO: Partial<Record<Periodicidade, string[]>> = {
  trimestral: ['1º trimestre', '2º trimestre', '3º trimestre', '4º trimestre'],
  quadrimestral: ['1º quadrimestre', '2º quadrimestre', '3º quadrimestre'],
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 'YYYY-MM' → 'jan/2026'. */
export function rotuloMes(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES_CURTOS[Number(mes) - 1] ?? mes}/${ano}`
}

/** 'YYYY-MM' → 'jan' (sem ano, p/ cabeçalho da grade). */
export function rotuloMesCurto(comp: string): string {
  const mes = Number(comp.split('-')[1])
  return MESES_CURTOS[mes - 1] ?? comp
}

/**
 * Competências 'YYYY-MM' de um período. `indice` é 0-based DENTRO do ano:
 * mensal → mês (0=jan…11=dez); trimestral → 0..3; quadrimestral → 0..2; anual → 0.
 */
export function mesesDoPeriodo(periodicidade: Periodicidade, ano: number, indice: number): string[] {
  const n = MESES_POR_PERIODO[periodicidade]
  const primeiroMes = periodicidade === 'mensal' ? indice + 1 : indice * n + 1
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(`${ano}-${pad2(primeiroMes + i)}`)
  return out
}

export interface PeriodoOpcao {
  indice: number
  rotulo: string
  meses: string[]
}

/** Todas as opções de período de um ano, para o seletor. */
export function periodosDoAno(periodicidade: Periodicidade, ano: number): PeriodoOpcao[] {
  const qtd = 12 / MESES_POR_PERIODO[periodicidade]
  const out: PeriodoOpcao[] = []
  for (let i = 0; i < qtd; i++) {
    const meses = mesesDoPeriodo(periodicidade, ano, i)
    const rotulo =
      periodicidade === 'anual'
        ? `Ano ${ano}`
        : periodicidade === 'mensal'
          ? rotuloMes(meses[0])
          : (ROTULOS_PERIODO[periodicidade]?.[i] ?? `Período ${i + 1}`)
    out.push({ indice: i, rotulo, meses })
  }
  return out
}

/** Índice do período que contém um mês (0-based no ano). */
export function indiceDoMes(periodicidade: Periodicidade, mes: number): number {
  if (periodicidade === 'anual') return 0
  return Math.floor((mes - 1) / MESES_POR_PERIODO[periodicidade])
}

/**
 * Sazonalidade de uma conta: soma do realizado por mês-calendário (índice 0=jan
 * … 11=dez) em todo o histórico. Base para distribuir um total pelos meses.
 */
export function sazonalidadeConta(lancamentos: LancamentoCanonico[], conta: string): number[] {
  const out = new Array(12).fill(0)
  for (const l of lancamentos) {
    if (l.contaSafragold !== conta) continue
    const mc = Number(l.data.slice(5, 7)) - 1
    if (mc >= 0 && mc < 12) out[mc] += l.valor
  }
  return out
}

/**
 * Pesos (somam 1) para distribuir um total pelos `meses`, a partir da
 * sazonalidade por mês-calendário. Se o histórico dos meses do período for todo
 * zero, distribui igual.
 */
export function pesosSazonais(sazonalidade: number[], meses: string[]): number[] {
  const brutos = meses.map((m) => sazonalidade[Number(m.slice(5, 7)) - 1] ?? 0)
  const soma = brutos.reduce((s, v) => s + v, 0)
  if (soma <= 0) return meses.map(() => 1 / meses.length)
  return brutos.map((v) => v / soma)
}

/**
 * Distribui um total pelos `meses` conforme a sazonalidade da conta. Arredonda
 * em centavos e joga o resto no último mês → a soma fecha EXATAMENTE com o total.
 */
export function distribuirSazonal(
  total: number,
  meses: string[],
  lancamentos: LancamentoCanonico[],
  conta: string,
): Record<string, number> {
  const pesos = pesosSazonais(sazonalidadeConta(lancamentos, conta), meses)
  const centavos = Math.round(total * 100)
  const out: Record<string, number> = {}
  let acumulado = 0
  meses.forEach((m, i) => {
    if (i === meses.length - 1) {
      out[m] = (centavos - acumulado) / 100
    } else {
      const c = Math.round(centavos * pesos[i])
      out[m] = c / 100
      acumulado += c
    }
  })
  return out
}

// ---------------------------------------------------------------------------
// Receita de grão orçada por VOLUME × PREÇO.
//
// As contas de venda de grão (3.1.0x) são orçadas por sacas × preço/saca; o
// valor que vai para o DRE é o produto. As demais contas seguem só por valor.
// ---------------------------------------------------------------------------

/** true se a conta é RECEITA de grão (venda de soja/milho/sorgo/café). */
export function ehReceitaGrao(conta: string, mapa: MapaClassificacao): boolean {
  return !!GRAO_DE_CONTA[conta] && mapa[conta] === 'receita_bruta'
}

/** Contas de receita de grão presentes no mapa efetivo, em ordem. */
export function contasReceitaGrao(mapa: MapaClassificacao): string[] {
  return Object.keys(GRAO_DE_CONTA)
    .filter((c) => mapa[c] === 'receita_bruta')
    .sort((a, b) => a.localeCompare(b))
}

/** Valor da receita orçada de uma conta de grão = sacas × preço/saca (em centavos exatos). */
export function valorReceita(sacas: number, precoSaca: number): number {
  return Math.round(sacas * precoSaca * 100) / 100
}
