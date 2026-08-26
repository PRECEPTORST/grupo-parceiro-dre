// Cobertura de dados de uma competência — DETERMINÍSTICO.
//
// POR QUE ISTO EXISTE
// -------------------
// O DRE abre sempre na competência MAIS RECENTE. Se a fonte tem dados só até o
// dia 5, o mês aparece com ~7% do faturamento normal e parece uma catástrofe —
// quando na verdade é só um mês que ainda não aconteceu. Foi exatamente o que
// ocorreu na primeira carga: agosto mostrou R$ 2,5M contra uma média de R$ 34M,
// porque a base tinha dados até 05/08.
//
// Isso não é um caso de borda: acontece TODO mês, sempre que alguém abre o app
// antes do mês fechar, e é a maneira mais rápida de perder a confiança de um
// sócio num relatório. O número está certo; falta o contexto ao lado dele.

import type { LancamentoCanonico } from './tipos'

export interface Cobertura {
  competencia: string
  /** Última data com lançamento nesta competência ('' se não houver nenhum). */
  ultimaData: string
  /** Último dia do mês da competência. */
  fimDoMes: string
  /** Quantos dias do mês têm cobertura (1..31); 0 sem dados. */
  diasCobertos: number
  diasNoMes: number
  /** Fração do mês coberta, 0..1. */
  fracao: number
  /** true quando a cobertura NÃO alcança o fim do mês. */
  parcial: boolean
  /**
   * true quando a competência é o mês corrente. Aí ser parcial é NORMAL — o mês
   * ainda está acontecendo —, e o aviso muda de tom.
   */
  mesCorrente: boolean
}

/** Último dia do mês de uma competência 'YYYY-MM', em ISO. */
export function fimDaCompetencia(competencia: string): string {
  const ano = Number(competencia.slice(0, 4))
  const mes = Number(competencia.slice(5, 7))
  // Dia 0 do mês seguinte = último dia deste mês. Construído em UTC para não
  // deslocar em fuso negativo (a armadilha de datas do §8 do context.md).
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${competencia}-${String(dias).padStart(2, '0')}`
}

/**
 * Até onde os dados de uma competência realmente vão.
 *
 * `hoje` é injetável para o cálculo ser determinístico em teste — sem isso o
 * resultado mudaria conforme o dia em que a suíte roda.
 */
export function coberturaDaCompetencia(
  competencia: string,
  lancamentos: LancamentoCanonico[],
  hoje = new Date().toISOString().slice(0, 10),
): Cobertura {
  const fimDoMes = fimDaCompetencia(competencia)
  const diasNoMes = Number(fimDoMes.slice(8, 10))

  let ultimaData = ''
  for (const l of lancamentos) {
    if (l.data.slice(0, 7) !== competencia) continue
    if (l.data > ultimaData) ultimaData = l.data
  }

  const mesCorrente = competencia === hoje.slice(0, 7)
  const diasCobertos = ultimaData ? Number(ultimaData.slice(8, 10)) : 0
  // No mês corrente a régua é HOJE, não o fim do mês: cobrir até ontem é normal.
  const referencia = mesCorrente ? Math.min(Number(hoje.slice(8, 10)), diasNoMes) : diasNoMes

  return {
    competencia,
    ultimaData,
    fimDoMes,
    diasCobertos,
    diasNoMes,
    fracao: diasNoMes > 0 ? diasCobertos / diasNoMes : 0,
    parcial: diasCobertos > 0 && diasCobertos < referencia,
    mesCorrente,
  }
}

/**
 * Quanto o mês parcial provavelmente vale quando fechar, extrapolando pela média
 * diária dos meses COMPLETOS. É estimativa grosseira e serve só para dizer "não
 * se assuste": um mês com 5 de 31 dias não vale 7% do normal, vale 7% do mês.
 */
export function referenciaMensal(
  competencias: string[],
  valorPorCompetencia: (c: string) => number,
  parciais: Set<string>,
): number | null {
  const completas = competencias.filter((c) => !parciais.has(c))
  if (completas.length === 0) return null
  const soma = completas.reduce((s, c) => s + valorPorCompetencia(c), 0)
  return soma / completas.length
}
