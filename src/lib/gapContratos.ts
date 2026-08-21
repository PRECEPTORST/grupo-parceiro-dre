// Confronto NOTA FISCAL × TÍTULO A RECEBER, por contrato. Item 3.3 do ROADMAP.md.
//
// O ACHADO QUE MOTIVOU ISTO
// -------------------------
// Somando jan–jul/2026, as notas de venda dão R$ 239,8M e os títulos a receber de
// receita de grão dão R$ 217,9M — R$ 21,9M a menos, ou 9,1%. E o mais revelador:
// a diferença é ESTÁVEL mês a mês (entre 5% e 12%). Diferença estável não é
// aleatória, é estrutural.
//
// Confrontando contrato a contrato (232 contratos com nota e título):
//   • 30% batem EXATO (razão 1,000);
//   • o resto tem desconto VARIÁVEL — mediana 0,96, mas o décimo percentil é 0,755.
// Alíquota daria razão constante. Desconto variável por carga é a assinatura do
// DESCONTO DE CLASSIFICAÇÃO do agronegócio (umidade, impureza, avariados), que é
// abatido no faturamento e chega reduzido ao financeiro.
//
// POR QUE ISTO NÃO MEXE NA RECEITA AUTOMATICAMENTE
// ------------------------------------------------
// Se a leitura estiver certa, a receita bruta está superavaliada em ~9% e a
// diferença é abatimento (dedução). Isso mudaria o resultado do semestre de
// positivo para negativo. É grande demais para entrar por hipótese: a regra de
// ouro do projeto é que nenhum número muda "porque o modelo achou". Então este
// motor QUANTIFICA e EXPLICA o gap como achado — e a decisão de reclassificar
// fica com o contador, com o número na mão.

import type { Grao } from './tipos'

/** Nota de venda vinculada a um contrato. */
export interface NotaContrato {
  idContrato: number | string
  competencia: string
  valor: number
  grao?: Grao | null
}

/** Título a receber vinculado a um contrato. */
export interface TituloContrato {
  idContrato: number | string
  competencia: string
  valor: number
}

export interface GapContrato {
  idContrato: string
  competencia: string
  valorNf: number
  valorTitulo: number
  /** título ÷ nota. 1 = bate exato; < 1 = título veio reduzido. */
  razao: number
  /** nota − título, em R$. */
  gap: number
}

export type FaixaGap = 'exato' | 'desconto_leve' | 'desconto_forte' | 'titulo_maior'

export interface RelatorioGapContratos {
  contratos: GapContrato[]
  /** Quantos contratos caem em cada faixa. */
  distribuicao: Record<FaixaGap, number>
  totalNf: number
  totalTitulo: number
  gapTotal: number
  /** gap ÷ total faturado, em %. */
  gapPct: number
  /** Mediana da razão título/nota — resistente a outlier, diferente da média. */
  razaoMediana: number
  /** Gap por competência, para ver se é estável (estrutural) ou pontual. */
  gapPorCompetencia: Record<string, { nf: number; titulo: number; gap: number; pct: number }>
}

const TOL = 0.001

function arred(v: number): number {
  return Math.round(v * 100) / 100
}

export function faixaDe(razao: number): FaixaGap {
  if (razao > 1 + TOL) return 'titulo_maior'
  if (razao >= 1 - TOL) return 'exato'
  if (razao >= 0.94) return 'desconto_leve'
  return 'desconto_forte'
}

export const ROTULO_FAIXA: Record<FaixaGap, string> = {
  exato: 'Bate exato',
  desconto_leve: 'Desconto até 6%',
  desconto_forte: 'Desconto acima de 6%',
  titulo_maior: 'Título maior que a nota',
}

function mediana(valores: number[]): number {
  if (!valores.length) return 0
  const ord = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ord.length / 2)
  return ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2
}

/**
 * Confronta notas e títulos pelo contrato que compartilham. Só entram contratos
 * que têm as DUAS pontas — sem os dois lados não há confronto, e incluir um lado
 * só inflaria o gap artificialmente.
 */
export function analisarGapContratos(
  notas: NotaContrato[],
  titulos: TituloContrato[],
  /** Notas abaixo deste valor são ruído de rateio. Default R$ 1.000. */
  pisoNota = 1_000,
): RelatorioGapContratos {
  const porNota = new Map<string, { valor: number; competencia: string }>()
  for (const n of notas) {
    const id = String(n.idContrato)
    if (!id || id === 'undefined' || id === 'null') continue
    const atual = porNota.get(id)
    porNota.set(id, {
      valor: (atual?.valor ?? 0) + n.valor,
      // A competência do contrato é a da primeira nota (a mais antiga).
      competencia:
        atual && atual.competencia <= n.competencia ? atual.competencia : n.competencia,
    })
  }

  const porTitulo = new Map<string, number>()
  for (const t of titulos) {
    const id = String(t.idContrato)
    if (!id || id === 'undefined' || id === 'null') continue
    porTitulo.set(id, (porTitulo.get(id) ?? 0) + t.valor)
  }

  const contratos: GapContrato[] = []
  const distribuicao: Record<FaixaGap, number> = {
    exato: 0,
    desconto_leve: 0,
    desconto_forte: 0,
    titulo_maior: 0,
  }
  const porCompetencia: Record<string, { nf: number; titulo: number; gap: number; pct: number }> = {}
  let totalNf = 0
  let totalTitulo = 0
  const razoes: number[] = []

  for (const [id, nota] of porNota) {
    const valorTitulo = porTitulo.get(id)
    if (valorTitulo == null) continue // sem as duas pontas não há confronto
    if (nota.valor < pisoNota) continue

    const razao = valorTitulo / nota.valor
    const gap = nota.valor - valorTitulo
    razoes.push(razao)
    distribuicao[faixaDe(razao)]++
    totalNf += nota.valor
    totalTitulo += valorTitulo

    const c = (porCompetencia[nota.competencia] ??= { nf: 0, titulo: 0, gap: 0, pct: 0 })
    c.nf += nota.valor
    c.titulo += valorTitulo
    c.gap += gap

    contratos.push({
      idContrato: id,
      competencia: nota.competencia,
      valorNf: arred(nota.valor),
      valorTitulo: arred(valorTitulo),
      razao: Math.round(razao * 10000) / 10000,
      gap: arred(gap),
    })
  }

  for (const c of Object.values(porCompetencia)) {
    c.nf = arred(c.nf)
    c.titulo = arred(c.titulo)
    c.gap = arred(c.gap)
    c.pct = c.nf > 0 ? Math.round((c.gap / c.nf) * 1000) / 10 : 0
  }

  contratos.sort((a, b) => b.gap - a.gap)

  return {
    contratos,
    distribuicao,
    totalNf: arred(totalNf),
    totalTitulo: arred(totalTitulo),
    gapTotal: arred(totalNf - totalTitulo),
    gapPct: totalNf > 0 ? Math.round(((totalNf - totalTitulo) / totalNf) * 1000) / 10 : 0,
    razaoMediana: Math.round(mediana(razoes) * 10000) / 10000,
    gapPorCompetencia: porCompetencia,
  }
}

/**
 * Lê a estabilidade do gap: um gap que se repete todo mês na mesma faixa é
 * ESTRUTURAL (regra do negócio); um que aparece num mês só é evento pontual.
 * A distinção muda completamente o que fazer com ele.
 */
export function gapEhEstrutural(rel: RelatorioGapContratos, minMeses = 3): boolean {
  const pcts = Object.values(rel.gapPorCompetencia)
    .filter((c) => c.nf > 0)
    .map((c) => c.pct)
  if (pcts.length < minMeses) return false
  const comGap = pcts.filter((p) => p > 1)
  return comGap.length >= pcts.length * 0.8
}
