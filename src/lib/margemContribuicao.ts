// Margem de contribuição — DETERMINÍSTICA.
//
// Definição (Grupo Parceiro): margem de contribuição = RECEITA LÍQUIDA − CUSTOS
// VARIÁVEIS. Os custos variáveis são o CUSTO DO PRODUTO (CPV) e, OPCIONALMENTE, as
// DESPESAS COMERCIAIS (comissão, frete de venda, marketing) — controlado por
// `incluirComerciais`. Só CPV (default) = o próprio lucro bruto do DRE. A opção é
// persistida em `EstadoDre.mcIncluirComerciais` e vale no painel e no DRE.

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

/**
 * Série da margem de contribuição por competência, em ordem cronológica.
 * `incluirComerciais` = subtrai também as despesas comerciais (custo variável).
 */
export function serieMargemContribuicao(
  competencias: string[],
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
  incluirComerciais = false,
): PontoMC[] {
  return [...competencias]
    .sort()
    .map((competencia) => {
      const d = montarDre(competencia, lancamentos, mapa)
      const receitaLiquida = d.realizado.receitaLiquida
      const comerciais = incluirComerciais
        ? (d.linhas.find((l) => l.linha === 'despesas_comerciais')?.realizado ?? 0)
        : 0
      const mc = d.realizado.lucroBruto - comerciais // receita líquida − CPV [− comerciais]
      return {
        competencia,
        receitaLiquida,
        mc,
        mcPct: receitaLiquida > 0 ? (mc / receitaLiquida) * 100 : null,
      }
    })
}
