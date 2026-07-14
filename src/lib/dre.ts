// Motor do DRE — DETERMINÍSTICO. Zero IA.
//
// Recebe lançamentos canônicos + o mapa de classificação (conta → linha) e
// produz o DRE de uma competência: agrega por linha e calcula os subtotais.
// A mesma entrada produz sempre a mesma saída — é o que garante que um sócio
// nunca receba um DRE cujo número "mudou porque o modelo achou".
import {
  LINHAS_DRE,
  META_LINHAS,
  type LinhaDRE,
  type LancamentoCanonico,
  type Classificacao,
  type MapaClassificacao,
  type Orcamento,
} from './tipos'

/** Arredonda para centavos, evitando drift de ponto flutuante nas somas. */
function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}

/** 'YYYY-MM-DD' → 'YYYY-MM'. */
export function competenciaDe(dataIso: string): string {
  return dataIso.slice(0, 7)
}

/** Materializa o mapa conta → linha a partir das classificações salvas. */
export function mapaDeClassificacoes(classificacoes: Classificacao[]): MapaClassificacao {
  const mapa: MapaClassificacao = {}
  for (const c of classificacoes) mapa[c.contaSafragold] = c.linha
  return mapa
}

export interface ResultadoLinha {
  linha: LinhaDRE
  rotulo: string
  sinal: 1 | -1
  /** Magnitude somada na linha, em reais. */
  valor: number
}

export interface DreMensal {
  competencia: string
  /** Uma entrada por linha do DRE (na ordem de LINHAS_DRE). */
  linhas: ResultadoLinha[]
  receitaLiquida: number
  lucroBruto: number
  /** Resultado operacional (EBIT). */
  resultadoOperacional: number
  ebitda: number
  resultadoAntesIr: number
  resultadoLiquido: number
  /** Total de lançamentos da competência sem conta classificada (em reais). */
  naoClassificado: number
  /** Contas distintas ainda sem classificação (alimenta a tela de Lançamentos). */
  contasNaoClassificadas: string[]
}

/**
 * Monta o DRE de uma competência a partir dos lançamentos e do mapa de contas.
 * Lançamentos de contas ainda não classificadas entram em `naoClassificado`
 * (nunca são silenciosamente somados numa linha errada).
 */
export function montarDre(
  competencia: string,
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
): DreMensal {
  const soma: Record<LinhaDRE, number> = Object.fromEntries(
    LINHAS_DRE.map((l) => [l, 0]),
  ) as Record<LinhaDRE, number>

  let naoClassificado = 0
  const contasNaoClassificadas = new Set<string>()

  for (const lanc of lancamentos) {
    if (competenciaDe(lanc.data) !== competencia) continue
    const linha = mapa[lanc.contaSafragold]
    if (!linha) {
      naoClassificado += lanc.valor
      contasNaoClassificadas.add(lanc.contaSafragold)
      continue
    }
    soma[linha] += lanc.valor
  }

  const v = (l: LinhaDRE) => arredondar(soma[l])

  const receitaLiquida = arredondar(v('receita_bruta') - v('deducoes'))
  const lucroBruto = arredondar(receitaLiquida - v('custo_produto'))
  const resultadoOperacional = arredondar(
    lucroBruto -
      v('despesas_comerciais') -
      v('despesas_administrativas') +
      v('outras_receitas_operacionais') -
      v('depreciacao_amortizacao'),
  )
  const ebitda = arredondar(resultadoOperacional + v('depreciacao_amortizacao'))
  const resultadoFinanceiro = arredondar(v('receita_financeira') - v('despesa_financeira'))
  const resultadoAntesIr = arredondar(resultadoOperacional + resultadoFinanceiro)
  const resultadoLiquido = arredondar(resultadoAntesIr - v('impostos_lucro'))

  const linhas: ResultadoLinha[] = LINHAS_DRE.map((linha) => ({
    linha,
    rotulo: META_LINHAS[linha].rotulo,
    sinal: META_LINHAS[linha].sinal,
    valor: v(linha),
  }))

  return {
    competencia,
    linhas,
    receitaLiquida,
    lucroBruto,
    resultadoOperacional,
    ebitda,
    resultadoAntesIr,
    resultadoLiquido,
    naoClassificado: arredondar(naoClassificado),
    contasNaoClassificadas: [...contasNaoClassificadas].sort(),
  }
}

// ---------------------------------------------------------------------------
// Comparação realizado × orçado → desvios (o "apontando desvios" do Sprint 1).
// ---------------------------------------------------------------------------
export interface DesvioLinha {
  linha: LinhaDRE
  rotulo: string
  realizado: number
  orcado: number
  /** realizado - orçado, na magnitude da linha. */
  desvio: number
  /** desvio / orçado, em % (null quando não há orçado). */
  desvioPct: number | null
}

export function compararComOrcamento(dre: DreMensal, orcamento: Orcamento | null): DesvioLinha[] {
  return dre.linhas.map((l) => {
    const orcado = orcamento?.valores[l.linha] ?? 0
    const desvio = arredondar(l.valor - orcado)
    const desvioPct = orcado !== 0 ? arredondar((desvio / orcado) * 100) : null
    return {
      linha: l.linha,
      rotulo: l.rotulo,
      realizado: l.valor,
      orcado,
      desvio,
      desvioPct,
    }
  })
}

/** Lista as competências presentes nos lançamentos, mais recente primeiro. */
export function competenciasDisponiveis(lancamentos: LancamentoCanonico[]): string[] {
  const set = new Set<string>()
  for (const l of lancamentos) set.add(competenciaDe(l.data))
  return [...set].sort().reverse()
}
