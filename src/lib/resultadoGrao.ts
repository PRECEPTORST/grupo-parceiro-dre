// Resultado de caixa POR GRÃO — DETERMINÍSTICO.
//
// A partir dos movimentos reais da Enoki (recebimentos/pagamentos com centro de
// custo semântico: "RECEITA SOJA - MERCADO INTERNO", "COMPRA MILHO", "SECAGEM
// SORGO"…), monta o resultado em REGIME DE CAIXA por cereal:
//   resultado = receita (recebida) − compra − custos diretos do grão.
// O sinal vem do tipo (entrada +, saída −) e o balde vem do centro de custo, então
// estorno (saída num CC de receita) reduz a receita corretamente. Overhead sem grão
// (frete geral, admin) fica de fora — é margem de trading por grão, não DRE.

import { GRAOS, ROTULO_GRAO, type Grao, type MovimentoCaixa } from './tipos'

export type NaturezaGrao = 'receita' | 'compra' | 'custo'

const KW_GRAO: [Grao, RegExp][] = [
  ['soja', /\bSOJA\b/],
  ['milho', /\bMILHO\b/],
  ['sorgo', /\bSORGO\b/],
  ['cafe', /\bCAFE\b/],
]

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

/** Detecta o grão pelo centro de custo (ou null se não for de grão). */
export function graoDeCentroCusto(cc?: string): Grao | null {
  if (!cc) return null
  const s = normalizar(cc)
  for (const [g, re] of KW_GRAO) if (re.test(s)) return g
  return null
}

/** Classifica o centro de custo em receita / compra / custo direto do grão. */
export function naturezaDeCentroCusto(cc: string, tipo: 'entrada' | 'saida'): NaturezaGrao {
  const s = normalizar(cc)
  if (/RECEITA|VENDA|FATURAMENTO/.test(s)) return 'receita'
  if (/COMPRA|AQUISIC/.test(s)) return 'compra'
  if (/SECAGEM|CLASSIFIC|QUEBRA|ARMAZ|FRETE|LIMPEZA/.test(s)) return 'custo'
  return tipo === 'entrada' ? 'receita' : 'custo' // fallback pelo fluxo
}

export interface ResultadoGrao {
  grao: Grao
  rotulo: string
  receita: number
  compra: number
  custos: number
  /** receita − compra − custos (margem de caixa do grão). */
  resultado: number
}

export interface RelatorioResultadoGrao {
  graos: ResultadoGrao[]
  total: Omit<ResultadoGrao, 'grao' | 'rotulo'>
  /** Quantos movimentos foram atribuídos a algum grão (para diagnóstico). */
  atribuidos: number
  /** Valor total (|R$|) de movimentos SEM grão (overhead: frete geral, admin…). */
  semGrao: number
}

/** Resultado de caixa por grão a partir dos movimentos (recebimentos/pagamentos). */
export function resultadoCaixaPorGrao(movimentos: MovimentoCaixa[]): RelatorioResultadoGrao {
  const acc = new Map<Grao, { receita: number; compra: number; custos: number }>()
  for (const g of GRAOS) acc.set(g, { receita: 0, compra: 0, custos: 0 })
  let atribuidos = 0
  let semGrao = 0

  for (const m of movimentos) {
    const g = graoDeCentroCusto(m.centroCusto)
    if (!g) {
      semGrao += Math.abs(m.valor)
      continue
    }
    atribuidos++
    const nat = naturezaDeCentroCusto(m.centroCusto ?? '', m.tipo)
    const a = acc.get(g)!
    const sinal = m.tipo === 'entrada' ? 1 : -1
    if (nat === 'receita') a.receita += sinal * m.valor // entrada soma; saída (estorno) reduz
    else if (nat === 'compra') a.compra += -sinal * m.valor // saída soma; entrada (estorno) reduz
    else a.custos += -sinal * m.valor
  }

  const graos = GRAOS.map((grao) => {
    const a = acc.get(grao)!
    return {
      grao,
      rotulo: ROTULO_GRAO[grao],
      receita: a.receita,
      compra: a.compra,
      custos: a.custos,
      resultado: a.receita - a.compra - a.custos,
    }
  }).filter((x) => x.receita || x.compra || x.custos)

  const total = graos.reduce(
    (s, x) => ({
      receita: s.receita + x.receita,
      compra: s.compra + x.compra,
      custos: s.custos + x.custos,
      resultado: s.resultado + x.resultado,
    }),
    { receita: 0, compra: 0, custos: 0, resultado: 0 },
  )

  return { graos, total, atribuidos, semGrao }
}
