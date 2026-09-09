// Estrutura repetida do último mês fechado — para o mês que a planilha ainda não cobre.
//
// POR QUE ISTO EXISTE
// -------------------
// O ERP entrega bem o TRADING (nota de venda, nota de compra, frete) e mal a
// ESTRUTURA. Em agosto/2026 ele trouxe R$ 37 mil de despesa administrativa; a
// planilha de julho traz R$ 202 mil — salários, pró-labore, contabilidade,
// aluguel, depreciação. Não é que agosto tenha sido mais barato: é que folha e
// estrutura não passam pelo financeiro do Enoki.
//
// A planilha cobre isso, mas fecha com atraso: em setembro ela ainda parava em
// julho. Um DRE de agosto sem folha nenhuma não é conservador, é errado — ele
// some com R$ 165 mil de custo real e infla o resultado.
//
// Então a estrutura do último mês FECHADO é repetida no mês aberto. Salário,
// aluguel, contabilidade e depreciação são recorrentes: repetir é a melhor
// estimativa disponível, e muito melhor que zero.
//
// ⚠ É ESTIMATIVA, E TEM DE APARECER COMO TAL. Cada lançamento projetado nasce
// com `origem: 'projetado'` e id próprio, para que nenhuma tela o confunda com
// realizado e para que ele suma sozinho quando a planilha do mês chegar.

import { LINHAS_DRE, type LinhaDRE, type LancamentoCanonico, type MapaClassificacao } from './tipos'

/**
 * Linhas que fazem sentido repetir: são recorrentes e não acompanham o volume
 * do mês. Receita e CPV JAMAIS entram aqui — projetar venda seria inventar o
 * resultado, que é a única coisa que este projeto não pode fazer.
 */
export const LINHAS_PROJETAVEIS: readonly LinhaDRE[] = [
  'despesas_administrativas',
  'depreciacao_amortizacao',
  'despesa_financeira',
  'receita_financeira',
  'impostos_lucro',
  'investimentos',
] as const

export interface ResumoProjecao {
  /** Competência que serviu de molde. */
  base: string
  /** Competência que recebeu a projeção. */
  alvo: string
  linhas: { linha: LinhaDRE; valor: number }[]
  total: number
}

export interface ResultadoProjecao {
  lancamentos: LancamentoCanonico[]
  resumo: ResumoProjecao | null
}

/** Competências presentes numa lista, ordenadas. */
function competencias(lancs: LancamentoCanonico[]): string[] {
  return [...new Set(lancs.map((l) => (l.data ?? '').slice(0, 7)).filter(Boolean))].sort()
}

/** Último dia do mês — a projeção entra na data de fechamento, como a planilha. */
function fimDoMes(competencia: string): string {
  const [a, m] = competencia.split('-').map(Number)
  return `${competencia}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`
}

/**
 * Projeta a estrutura do último mês fechado da planilha para `alvo`.
 *
 * Não faz nada — e devolve resumo `null` — quando a planilha JÁ cobre o alvo.
 * Dado real sempre vence estimativa; a projeção é o que se usa na falta dele.
 */
export function projetarEstrutura(
  planilha: LancamentoCanonico[],
  alvo: string,
  mapa: MapaClassificacao,
  linhas: readonly LinhaDRE[] = LINHAS_PROJETAVEIS,
): ResultadoProjecao {
  const vazio: ResultadoProjecao = { lancamentos: [], resumo: null }
  const meses = competencias(planilha)
  if (!meses.length || meses.includes(alvo)) return vazio

  // O molde é o mês fechado mais recente ANTES do alvo.
  const base = [...meses].reverse().find((m) => m < alvo)
  if (!base) return vazio

  const projetaveis = new Set(linhas)
  const doMolde = planilha.filter((l) => {
    if ((l.data ?? '').slice(0, 7) !== base) return false
    const linha = mapa[l.contaSafragold]
    return !!linha && projetaveis.has(linha)
  })
  if (!doMolde.length) return vazio

  const data = fimDoMes(alvo)
  const lancamentos: LancamentoCanonico[] = doMolde.map((l) => ({
    ...l,
    id: `projetado-${alvo}-${l.contaSafragold}`,
    data,
    historico: `${l.historico} · projetado de ${base}`,
    origem: 'projetado',
  }))

  const porLinha = new Map<LinhaDRE, number>()
  for (const l of lancamentos) {
    const linha = mapa[l.contaSafragold]!
    porLinha.set(linha, (porLinha.get(linha) ?? 0) + l.valor)
  }

  return {
    lancamentos,
    resumo: {
      base,
      alvo,
      linhas: LINHAS_DRE.filter((l) => porLinha.has(l)).map((linha) => ({
        linha,
        valor: porLinha.get(linha)!,
      })),
      total: lancamentos.reduce((s, l) => s + l.valor, 0),
    },
  }
}
