// Margem de contribuição — DETERMINÍSTICA.
//
// Definição adotada com o cliente (Grupo Parceiro): margem de contribuição =
// RECEITA LÍQUIDA − CUSTO DO PRODUTO (CPV). Numericamente é o próprio lucro bruto
// do DRE; exposta aqui com o nome "margem de contribuição" (+ % da receita) para
// os painéis. Se um dia entrarem outros custos variáveis (comissão, frete de
// venda), é só somar a `custo` aqui — o resto (caixas e gráfico) segue igual.

import { montarDre } from './dre'
import type { LancamentoCanonico, MapaClassificacao } from './tipos'

export interface PontoMC {
  competencia: string
  receitaLiquida: number
  /** Margem de contribuição em R$ (receita líquida − custo do produto). */
  mc: number
  /** MC como % da receita líquida (null quando não há receita). */
  mcPct: number | null
}

/** Série da margem de contribuição por competência, em ordem cronológica. */
export function serieMargemContribuicao(
  competencias: string[],
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
): PontoMC[] {
  return [...competencias]
    .sort()
    .map((competencia) => {
      const d = montarDre(competencia, lancamentos, mapa)
      const receitaLiquida = d.realizado.receitaLiquida
      const mc = d.realizado.lucroBruto // receita líquida − CPV
      return {
        competencia,
        receitaLiquida,
        mc,
        mcPct: receitaLiquida > 0 ? (mc / receitaLiquida) * 100 : null,
      }
    })
}
