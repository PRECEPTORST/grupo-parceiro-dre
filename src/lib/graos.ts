// Quebra do DRE por GRÃO + resultados por SACA. Determinístico, zero IA.
//
// Por cereal (soja, milho, sorgo, café): receita bruta, deduções e lucro bruto.
// Regras de rateio (definidas com o cliente):
//   - Receita e aquisição: direto pela conta do grão (o plano já separa).
//   - Deduções (ICMS/PIS/COFINS/Funrural): rateadas pela RECEITA de cada grão
//     (são % da receita, então o rateio é exato).
//   - Custos do CPV compartilhados (frete, armazenagem, secagem, quebra…):
//     rateados pelo VOLUME (sacas) de cada grão.
// Resultados por saca (globais) usam os totais do DRE ÷ total de sacas.
import { GRAOS, ROTULO_GRAO, type Grao, type LancamentoCanonico, type MapaClassificacao } from './tipos'
import { competenciaDe, montarDre } from './dre'
import { GRAO_DE_CONTA } from './planoContas'

function arred(v: number): number {
  return Math.round(v * 100) / 100
}
function zerosGrao(): Record<Grao, number> {
  return { soja: 0, milho: 0, sorgo: 0, cafe: 0 }
}

export interface ResumoGrao {
  grao: Grao
  rotulo: string
  sacas: number
  receitaBruta: number
  deducoes: number
  receitaLiquida: number
  /** Aquisição DIRETA do grão (compra da conta 4.1.0x), sem os custos rateados do CPV. */
  aquisicao: number
  custo: number
  lucroBruto: number
  /** Receita líquida ÷ sacas do grão (null se sem sacas informadas). */
  receitaLiquidaPorSaca: number | null
  /** Lucro bruto ÷ sacas do grão. */
  lucroBrutoPorSaca: number | null
}

export interface ResumoGraos {
  competencia: string
  graos: ResumoGrao[]
  sacasTotal: number
  /** Totais do DRE (para os resultados por saca globais). */
  receitaLiquida: number
  lucroBruto: number
  resultadoLiquido: number
  /** Globais por saca (totais do DRE ÷ total de sacas). */
  receitaLiquidaPorSaca: number | null
  lucroBrutoPorSaca: number | null
  lucroLiquidoPorSaca: number | null
}

/**
 * Monta o resumo por grão da competência. `sacas` = sacas vendidas de cada grão
 * no mês (informadas manualmente).
 */
export function resumoGraos(
  competencia: string,
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
  sacas: Partial<Record<Grao, number>> = {},
): ResumoGraos {
  // Realizado por conta na competência.
  const realConta: Record<string, number> = {}
  for (const l of lancamentos) {
    if (competenciaDe(l.data) !== competencia) continue
    realConta[l.contaSafragold] = (realConta[l.contaSafragold] ?? 0) + l.valor
  }

  const receitaGrao = zerosGrao()
  const aquisicaoGrao = zerosGrao()
  let receitaGraosTotal = 0
  let deducoesTotal = 0
  let cpvCompartilhado = 0

  for (const [conta, v] of Object.entries(realConta)) {
    const linha = mapa[conta]
    if (!linha) continue
    if (linha === 'deducoes') {
      deducoesTotal += v
    } else if (linha === 'receita_bruta') {
      const g = GRAO_DE_CONTA[conta]
      if (g) {
        receitaGrao[g] += v
        receitaGraosTotal += v
      }
    } else if (linha === 'custo_produto') {
      const g = GRAO_DE_CONTA[conta]
      if (g) aquisicaoGrao[g] += v
      else cpvCompartilhado += v
    }
  }

  const sacasTotal = GRAOS.reduce((s, g) => s + (sacas[g] ?? 0), 0)
  // Base do rateio: só volume POSITIVO. Um grão pode fechar o mês com sacas
  // negativas (devolução de uma venda de mês anterior); ratear frete e
  // armazenagem por volume negativo daria custo negativo a esse grão.
  const sacasPositivas = GRAOS.reduce((s, g) => s + Math.max(0, sacas[g] ?? 0), 0)

  const graos: ResumoGrao[] = GRAOS.map((g) => {
    const s = sacas[g] ?? 0
    const receitaBruta = arred(receitaGrao[g])
    // Deduções rateadas pela receita; CPV compartilhado rateado por volume.
    const ded = receitaGraosTotal > 0 ? deducoesTotal * (receitaGrao[g] / receitaGraosTotal) : 0
    const compartilhado =
      sacasPositivas > 0 ? cpvCompartilhado * (Math.max(0, s) / sacasPositivas) : 0
    const custo = arred(aquisicaoGrao[g] + compartilhado)
    const receitaLiquida = arred(receitaBruta - ded)
    const lucroBruto = arred(receitaLiquida - custo)
    return {
      grao: g,
      rotulo: ROTULO_GRAO[g],
      sacas: s,
      receitaBruta,
      deducoes: arred(ded),
      receitaLiquida,
      aquisicao: arred(aquisicaoGrao[g]),
      custo,
      lucroBruto,
      receitaLiquidaPorSaca: s > 0 ? arred(receitaLiquida / s) : null,
      lucroBrutoPorSaca: s > 0 ? arred(lucroBruto / s) : null,
    }
  })

  const dre = montarDre(competencia, lancamentos, mapa)
  const receitaLiquida = dre.realizado.receitaLiquida
  const lucroBruto = dre.realizado.lucroBruto
  const resultadoLiquido = dre.realizado.resultadoLiquido
  const porSaca = (v: number) => (sacasTotal > 0 ? arred(v / sacasTotal) : null)

  return {
    competencia,
    graos,
    sacasTotal,
    receitaLiquida,
    lucroBruto,
    resultadoLiquido,
    receitaLiquidaPorSaca: porSaca(receitaLiquida),
    lucroBrutoPorSaca: porSaca(lucroBruto),
    lucroLiquidoPorSaca: porSaca(resultadoLiquido),
  }
}
