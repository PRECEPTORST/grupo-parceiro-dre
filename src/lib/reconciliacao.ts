// Reconciliação ENOKI × PLANILHA — DETERMINÍSTICA. Zero IA. Item 3.1 do ROADMAP.md.
//
// As duas fontes descrevem o MESMO período por caminhos diferentes: a API monta o
// DRE a partir de notas fiscais e títulos; a planilha vem da DRE gerencial que o
// cliente fecha à mão. Onde elas divergem há informação — é aí que mora o erro de
// classificação, o lançamento esquecido, o ajuste manual no subtotal, o
// descasamento de competência.
//
// Este motor compara LINHA A LINHA, MÊS A MÊS, e transforma cada divergência
// material num achado com severidade. É a ferramenta de auditoria que o cliente
// pediu (§15 do context.md), agora com duas fontes independentes para confrontar.
//
// MATERIALIDADE, e não só diferença: R$ 200 numa linha de R$ 40M é ruído de
// arredondamento; R$ 900k numa linha de R$ 3M é um mês inteiro classificado
// errado. O corte usa piso em R$ e percentual — mas um valor absoluto grande
// entra mesmo com percentual baixo (R$ 600k em R$ 40M dá 1,5% e ainda assim
// importa).

import { formatBRL } from './format'
import { LINHAS_DRE, META_LINHAS, type LinhaDRE, type LancamentoCanonico, type MapaClassificacao } from './tipos'
import { montarDre } from './dre'

export type SeveridadeRec = 'alta' | 'media' | 'baixa'

export interface DivergenciaLinha {
  id: string
  competencia: string
  linha: LinhaDRE
  rotulo: string
  enoki: number
  planilha: number
  /** enoki − planilha. Positivo = a API mostra mais que a planilha. */
  diferenca: number
  /** |diferença| ÷ maior das duas, em %. null quando as duas são zero. */
  diferencaPct: number | null
  severidade: SeveridadeRec
  /** Explicação legível do que a divergência significa. */
  detalhe: string
}

export interface OpcoesReconciliacao {
  /** Divergência abaixo deste valor (R$) é ruído. Default R$ 5.000. */
  piso?: number
  /** Divergência abaixo deste % da linha é ruído. Default 2%. */
  pctTolerancia?: number
  /** Acima deste % a divergência é ALTA. Default 25%. */
  pctAlta?: number
  /** Acima deste valor (R$) a divergência é ALTA mesmo com % baixo. Default R$ 500.000. */
  valorAlta?: number
}

export interface ResumoFonteReconciliacao {
  enoki: number
  planilha: number
  diferenca: number
}

export interface RelatorioReconciliacao {
  divergencias: DivergenciaLinha[]
  competencias: string[]
  /** Totais do período, por fonte, para o cabeçalho do painel. */
  receitaBruta: ResumoFonteReconciliacao
  resultadoLiquido: ResumoFonteReconciliacao
  /** Competências que só existem em UMA das fontes (não dá para reconciliar). */
  competenciasSoEnoki: string[]
  competenciasSoPlanilha: string[]
}

const PISO_PADRAO = 5_000
const PCT_TOLERANCIA_PADRAO = 2
const PCT_ALTA_PADRAO = 25
const VALOR_ALTA_PADRAO = 500_000

function arred(v: number): number {
  return Math.round(v * 100) / 100
}

function competenciasDe(lancamentos: LancamentoCanonico[]): Set<string> {
  return new Set(lancamentos.map((l) => l.data.slice(0, 7)))
}

/** Totais por linha do DRE numa competência. */
function totaisPorLinha(
  competencia: string,
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
): Record<LinhaDRE, number> {
  const dre = montarDre(competencia, lancamentos, mapa)
  const out = {} as Record<LinhaDRE, number>
  for (const l of dre.linhas) out[l.linha] = l.realizado
  return out
}

function severidadeDe(
  diferenca: number,
  pct: number | null,
  o: Required<OpcoesReconciliacao>,
): SeveridadeRec {
  const abs = Math.abs(diferenca)
  if (abs >= o.valorAlta) return 'alta'
  if (pct != null && pct >= o.pctAlta) return 'alta'
  if (pct != null && pct >= o.pctTolerancia * 3) return 'media'
  return 'baixa'
}

function explicar(linha: LinhaDRE, enoki: number, planilha: number): string {
  const rotulo = META_LINHAS[linha].rotulo
  if (planilha === 0) {
    return `${rotulo}: a API traz ${formatBRL(enoki)} e a planilha não tem nada nesta linha. Ou a planilha esqueceu o lançamento, ou a API está classificando algo que não pertence aqui.`
  }
  if (enoki === 0) {
    return `${rotulo}: a planilha traz ${formatBRL(planilha)} e a API não vê nada. Típico do que não passa pelo módulo financeiro da Enoki (folha, depreciação, imposto sobre o lucro).`
  }
  const maior = enoki > planilha ? 'API' : 'planilha'
  return `${rotulo}: a ${maior} mostra mais. API ${formatBRL(enoki)} × planilha ${formatBRL(planilha)}. Vale conferir classificação de conta e competência (a data do fato gerador na API pode não ser a do fechamento manual).`
}

/**
 * Compara as duas fontes linha a linha, mês a mês. Só as divergências MATERIAIS
 * viram achado; o resto é arredondamento e não merece a atenção de um sócio.
 */
export function reconciliar(
  planilha: LancamentoCanonico[],
  enoki: LancamentoCanonico[],
  mapa: MapaClassificacao,
  opcoes: OpcoesReconciliacao = {},
): RelatorioReconciliacao {
  const o: Required<OpcoesReconciliacao> = {
    piso: opcoes.piso ?? PISO_PADRAO,
    pctTolerancia: opcoes.pctTolerancia ?? PCT_TOLERANCIA_PADRAO,
    pctAlta: opcoes.pctAlta ?? PCT_ALTA_PADRAO,
    valorAlta: opcoes.valorAlta ?? VALOR_ALTA_PADRAO,
  }

  const compPlanilha = competenciasDe(planilha)
  const compEnoki = competenciasDe(enoki)
  const comuns = [...compPlanilha].filter((c) => compEnoki.has(c)).sort()

  const divergencias: DivergenciaLinha[] = []
  const acumular = { receitaEnoki: 0, receitaPlanilha: 0, resEnoki: 0, resPlanilha: 0 }

  for (const competencia of comuns) {
    const tp = totaisPorLinha(competencia, planilha, mapa)
    const te = totaisPorLinha(competencia, enoki, mapa)

    const drePlanilha = montarDre(competencia, planilha, mapa)
    const dreEnoki = montarDre(competencia, enoki, mapa)
    acumular.receitaPlanilha += tp.receita_bruta
    acumular.receitaEnoki += te.receita_bruta
    acumular.resPlanilha += drePlanilha.realizado.resultadoLiquido
    acumular.resEnoki += dreEnoki.realizado.resultadoLiquido

    for (const linha of LINHAS_DRE) {
      const enokiV = te[linha] ?? 0
      const planilhaV = tp[linha] ?? 0
      const diferenca = arred(enokiV - planilhaV)
      if (diferenca === 0) continue

      const base = Math.max(Math.abs(enokiV), Math.abs(planilhaV))
      const pct = base > 0 ? (Math.abs(diferenca) / base) * 100 : null

      // Piso em R$ elimina o ruído de arredondamento — sempre.
      if (Math.abs(diferenca) < o.piso) continue
      // Acima do piso, percentual baixo é ruído SALVO quando o valor absoluto é
      // grande por si só: R$ 600k numa linha de R$ 40M dá 1,5%, mas nenhum sócio
      // chamaria isso de irrelevante.
      if (pct != null && pct < o.pctTolerancia && Math.abs(diferenca) < o.valorAlta) continue

      divergencias.push({
        id: `rec-${competencia}-${linha}`,
        competencia,
        linha,
        rotulo: META_LINHAS[linha].rotulo,
        enoki: arred(enokiV),
        planilha: arred(planilhaV),
        diferenca,
        diferencaPct: pct == null ? null : Math.round(pct * 10) / 10,
        severidade: severidadeDe(diferenca, pct, o),
        detalhe: explicar(linha, enokiV, planilhaV),
      })
    }
  }

  const ordem: Record<SeveridadeRec, number> = { alta: 0, media: 1, baixa: 2 }
  divergencias.sort(
    (a, b) =>
      ordem[a.severidade] - ordem[b.severidade] ||
      Math.abs(b.diferenca) - Math.abs(a.diferenca) ||
      a.competencia.localeCompare(b.competencia),
  )

  return {
    divergencias,
    competencias: comuns,
    receitaBruta: {
      enoki: arred(acumular.receitaEnoki),
      planilha: arred(acumular.receitaPlanilha),
      diferenca: arred(acumular.receitaEnoki - acumular.receitaPlanilha),
    },
    resultadoLiquido: {
      enoki: arred(acumular.resEnoki),
      planilha: arred(acumular.resPlanilha),
      diferenca: arred(acumular.resEnoki - acumular.resPlanilha),
    },
    competenciasSoEnoki: [...compEnoki].filter((c) => !compPlanilha.has(c)).sort(),
    competenciasSoPlanilha: [...compPlanilha].filter((c) => !compEnoki.has(c)).sort(),
  }
}
