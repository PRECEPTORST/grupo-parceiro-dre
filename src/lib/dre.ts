// Motor do DRE — DETERMINÍSTICO. Zero IA.
//
// Constrói o DRE ANALÍTICO de uma competência: cada linha do DRE é detalhada
// nas CONTAS que a compõem (realizado e orçado por conta), e os subtotais
// (receita líquida, lucro bruto, EBITDA, resultado líquido) são calculados
// pela mesma fórmula sobre os totais das linhas. Mesma entrada → mesma saída.
import {
  LINHAS_DRE,
  META_LINHAS,
  type LinhaDRE,
  type LancamentoCanonico,
  type Classificacao,
  type MapaClassificacao,
  type Orcamento,
} from './tipos'

function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}

/** 'YYYY-MM-DD' → 'YYYY-MM'. */
export function competenciaDe(dataIso: string): string {
  return dataIso.slice(0, 7)
}

export function mapaDeClassificacoes(classificacoes: Classificacao[]): MapaClassificacao {
  const mapa: MapaClassificacao = {}
  for (const c of classificacoes) mapa[c.contaSafragold] = c.linha
  return mapa
}

/** Uma conta dentro de uma linha do DRE, com realizado e orçado. */
export interface ContaValor {
  conta: string
  descricao: string
  realizado: number
  orcado: number
}

/** Uma linha do DRE, detalhada nas contas que a compõem. */
export interface LinhaResultado {
  linha: LinhaDRE
  rotulo: string
  sinal: 1 | -1
  contas: ContaValor[]
  realizado: number
  orcado: number
}

export interface Subtotais {
  receitaLiquida: number
  lucroBruto: number
  resultadoOperacional: number
  ebitda: number
  resultadoAntesIr: number
  resultadoLiquido: number
  /** Resultado líquido menos os investimentos (capex) — visão da planilha do cliente. */
  resultadoAposInvestimentos: number
}

export interface DreMensal {
  competencia: string
  linhas: LinhaResultado[]
  realizado: Subtotais
  orcado: Subtotais
  /** Contas com movimento mas sem classificação (não entram no DRE). */
  naoClassificadas: ContaValor[]
  naoClassificado: number
}

/** Subtotais a partir do total de cada linha (fórmula única, reutilizada). */
function calcularSubtotais(v: Record<LinhaDRE, number>): Subtotais {
  const receitaLiquida = arredondar(v.receita_bruta - v.deducoes)
  const lucroBruto = arredondar(receitaLiquida - v.custo_produto)
  const resultadoOperacional = arredondar(
    lucroBruto -
      v.despesas_comerciais -
      v.despesas_administrativas +
      v.outras_receitas_operacionais -
      v.depreciacao_amortizacao,
  )
  const ebitda = arredondar(resultadoOperacional + v.depreciacao_amortizacao)
  const resultadoFinanceiro = v.receita_financeira - v.despesa_financeira
  const resultadoAntesIr = arredondar(resultadoOperacional + resultadoFinanceiro)
  const resultadoLiquido = arredondar(resultadoAntesIr - v.impostos_lucro)
  const resultadoAposInvestimentos = arredondar(resultadoLiquido - v.investimentos)
  return {
    receitaLiquida,
    lucroBruto,
    resultadoOperacional,
    ebitda,
    resultadoAntesIr,
    resultadoLiquido,
    resultadoAposInvestimentos,
  }
}

function zeros(): Record<LinhaDRE, number> {
  return Object.fromEntries(LINHAS_DRE.map((l) => [l, 0])) as Record<LinhaDRE, number>
}

/**
 * Monta o DRE analítico da competência. Cada linha lista as contas que a
 * compõem — as com movimento no mês E as que têm valor orçado (para aparecer
 * um orçado sem realizado). Contas sem classificação ficam de fora, isoladas.
 */
export function montarDre(
  competencia: string,
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
  orcamento?: Orcamento | null,
  /** Se informado ('YYYY-MM-DD'), conta o realizado só até esta data (DRE parcial até hoje). */
  ateData?: string,
): DreMensal {
  // 1) Agrega realizado por conta + histórico representativo.
  const realizadoConta: Record<string, number> = {}
  const descricaoConta: Record<string, string> = {}
  for (const l of lancamentos) {
    if (competenciaDe(l.data) !== competencia) continue
    if (ateData && l.data > ateData) continue
    const c = l.contaSafragold
    realizadoConta[c] = (realizadoConta[c] ?? 0) + l.valor
    if (!descricaoConta[c] && l.historico) descricaoConta[c] = l.historico
  }

  const orcadoConta = orcamento?.valores ?? {}

  // 2) Conjunto de contas a exibir: com realizado OU com orçado.
  const contas = new Set<string>([...Object.keys(realizadoConta), ...Object.keys(orcadoConta)])

  // 3) Distribui por linha; sem classificação → naoClassificadas.
  const porLinha: Record<LinhaDRE, ContaValor[]> = Object.fromEntries(
    LINHAS_DRE.map((l) => [l, [] as ContaValor[]]),
  ) as Record<LinhaDRE, ContaValor[]>
  const naoClassificadas: ContaValor[] = []

  for (const conta of contas) {
    const item: ContaValor = {
      conta,
      descricao: descricaoConta[conta] ?? '',
      realizado: arredondar(realizadoConta[conta] ?? 0),
      orcado: arredondar(orcadoConta[conta] ?? 0),
    }
    const linha = mapa[conta]
    if (!linha) naoClassificadas.push(item)
    else porLinha[linha].push(item)
  }

  const ordena = (a: ContaValor, b: ContaValor) =>
    b.realizado - a.realizado || b.orcado - a.orcado || a.conta.localeCompare(b.conta)

  const totRealizado = zeros()
  const totOrcado = zeros()
  const linhas: LinhaResultado[] = LINHAS_DRE.map((linha) => {
    const lista = porLinha[linha].sort(ordena)
    const realizado = arredondar(lista.reduce((s, c) => s + c.realizado, 0))
    const orcado = arredondar(lista.reduce((s, c) => s + c.orcado, 0))
    totRealizado[linha] = realizado
    totOrcado[linha] = orcado
    return { linha, rotulo: META_LINHAS[linha].rotulo, sinal: META_LINHAS[linha].sinal, contas: lista, realizado, orcado }
  })

  naoClassificadas.sort(ordena)

  return {
    competencia,
    linhas,
    realizado: calcularSubtotais(totRealizado),
    orcado: calcularSubtotais(totOrcado),
    naoClassificadas,
    naoClassificado: arredondar(naoClassificadas.reduce((s, c) => s + c.realizado, 0)),
  }
}

/** Contas conhecidas (vistas nos lançamentos) agrupadas por linha do DRE —
 *  base para montar o orçamento por conta. */
export interface GrupoContas {
  linha: LinhaDRE
  rotulo: string
  contas: { conta: string; descricao: string }[]
}

export function contasPorLinha(
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
): { grupos: GrupoContas[]; naoClassificadas: { conta: string; descricao: string }[] } {
  const desc: Record<string, string> = {}
  const porLinha: Record<LinhaDRE, Set<string>> = Object.fromEntries(
    LINHAS_DRE.map((l) => [l, new Set<string>()]),
  ) as Record<LinhaDRE, Set<string>>
  const naoCls = new Set<string>()

  for (const l of lancamentos) {
    const c = l.contaSafragold
    if (!desc[c] && l.historico) desc[c] = l.historico
    const linha = mapa[c]
    if (linha) porLinha[linha].add(c)
    else naoCls.add(c)
  }

  const toList = (s: Set<string>) =>
    [...s].sort().map((conta) => ({ conta, descricao: desc[conta] ?? '' }))

  return {
    grupos: LINHAS_DRE.map((linha) => ({
      linha,
      rotulo: META_LINHAS[linha].rotulo,
      contas: toList(porLinha[linha]),
    })),
    naoClassificadas: toList(naoCls),
  }
}

/** Projeção de fechamento de uma linha (run-rate linear até o fim do mês). */
export interface FechamentoLinha {
  linha: LinhaDRE
  rotulo: string
  sinal: 1 | -1
  realizado: number
  orcado: number
  /** Projeção linear para o fim do mês = realizado / fração do mês decorrida. */
  projecao: number
  /** projecao / orçado * 100 (null se sem orçamento). */
  atingePct: number | null
  /** 'abaixo' = receita deve ficar abaixo do orçado; 'acima' = custo deve estourar; 'ok' caso contrário. */
  risco: 'ok' | 'abaixo' | 'acima' | null
}

/**
 * Projeta o fechamento do mês por linha, a partir do realizado ATÉ HOJE e da
 * fração do mês já decorrida (diaAtual/diasNoMes). Determinístico — a IA só
 * comenta em cima disto. Só sinaliza risco quando há orçamento na linha.
 */
export function projecaoFechamento(
  dre: DreMensal,
  diaAtual: number,
  diasNoMes: number,
): FechamentoLinha[] {
  const fracao = Math.min(1, Math.max(diaAtual, 1) / Math.max(diasNoMes, 1))
  return dre.linhas
    .filter((l) => l.realizado !== 0 || l.orcado !== 0)
    .map((l) => {
      const projecao = arredondar(fracao > 0 ? l.realizado / fracao : l.realizado)
      const atingePct = l.orcado !== 0 ? (projecao / l.orcado) * 100 : null
      let risco: FechamentoLinha['risco'] = l.orcado !== 0 ? 'ok' : null
      if (l.orcado !== 0) {
        if (l.sinal === 1 && projecao < l.orcado * 0.98) risco = 'abaixo'
        else if (l.sinal === -1 && projecao > l.orcado * 1.02) risco = 'acima'
      }
      return {
        linha: l.linha,
        rotulo: l.rotulo,
        sinal: l.sinal,
        realizado: l.realizado,
        orcado: l.orcado,
        projecao,
        atingePct,
        risco,
      }
    })
}

/** Lista as competências presentes nos lançamentos, mais recente primeiro. */
export function competenciasDisponiveis(lancamentos: LancamentoCanonico[]): string[] {
  const set = new Set<string>()
  for (const l of lancamentos) set.add(competenciaDe(l.data))
  return [...set].sort().reverse()
}
