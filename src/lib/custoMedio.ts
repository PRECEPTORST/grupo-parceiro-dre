// Custo médio móvel por grão → CPV do que foi VENDIDO. Item 3.2 do ROADMAP.md.
//
// O PROBLEMA QUE ISTO RESOLVE
// ---------------------------
// Hoje o CPV do DRE automático é o que foi COMPRADO no mês. Num comércio de
// grãos isso está errado sempre que há estoque: o grão comprado em março e
// vendido em maio joga custo em março e receita em maio, e os dois meses saem
// distorcidos. O certo é o custo do que SAIU: sacas vendidas × custo médio do
// estoque.
//
// A CONTA
// -------
// A cada competência, por grão:
//   custo médio = (valor do estoque inicial + valor comprado) ÷ (sacas iniciais + sacas compradas)
//   CPV         = sacas vendidas × custo médio
//   estoque final = o que sobrou, ao mesmo custo médio
// É o método da média ponderada móvel, aceito pela legislação brasileira e o que
// faz sentido para commodity fungível — uma saca de soja não se distingue da
// outra, então PEPS/UEPS seriam ficção.
//
// ⚠ DE ONDE VÊM AS SACAS COMPRADAS
// A API da Enoki NÃO informa quantidade comprada: os títulos a pagar de "COMPRA
// {GRÃO}" têm valor mas não volume, e o endpoint de Contratos devolve só
// "Contrato de Venda" (verificado em 2026-08-21, inclusive consultando por
// idContrato de um título de compra: devolve vazio). Por isso o volume comprado
// e o estoque de abertura são INFORMADOS — pelo usuário ou por outra fonte. Se a
// API de produção expuser contratos de compra, é só trocar o alimentador; a
// conta aqui não muda.

import { GRAOS, ROTULO_GRAO, type Grao, type LancamentoCanonico } from './tipos'

/** Movimento de um grão numa competência. */
export interface MovimentoEstoque {
  competencia: string
  grao: Grao
  /** Sacas compradas no mês (informadas — a API não traz). */
  sacasCompradas: number
  /** Valor comprado no mês (R$) — este a API traz, via títulos "COMPRA {GRÃO}". */
  valorComprado: number
  /** Sacas vendidas no mês (das notas fiscais). */
  sacasVendidas: number
}

/** Estoque de abertura de um grão no início do período analisado. */
export interface EstoqueAbertura {
  sacas: number
  valor: number
}

export interface PosicaoEstoque {
  competencia: string
  grao: Grao
  rotulo: string
  sacasIniciais: number
  valorInicial: number
  sacasCompradas: number
  valorComprado: number
  /** R$/saca do estoque disponível no mês (inicial + compras). */
  custoMedio: number
  sacasVendidas: number
  /** Custo do que SAIU = sacas vendidas × custo médio. */
  cpv: number
  sacasFinais: number
  valorFinal: number
  /**
   * true quando as vendas superam o disponível. Não é erro de conta: é sinal de
   * que falta informar compra ou estoque de abertura. O CPV do mês fica
   * subavaliado e o alerta precisa aparecer.
   */
  estoqueNegativo: boolean
  /**
   * true quando entrou VOLUME sem VALOR (sacas compradas > 0 e R$ comprado = 0).
   * Puxa o custo médio para baixo e barateia todo o estoque a partir dali — é
   * silencioso e por isso perigoso. Normalmente significa que o volume foi
   * informado num mês e o título de compra caiu em outro.
   */
  volumeSemValor: boolean
}

export interface RelatorioCustoMedio {
  posicoes: PosicaoEstoque[]
  /** CPV por competência (soma dos grãos) — o que deveria estar no DRE. */
  cpvPorCompetencia: Record<string, number>
  /** Valor comprado por competência — o que o DRE usa hoje. */
  compraPorCompetencia: Record<string, number>
  /** Competências com estoque negativo OU volume comprado sem valor. */
  competenciasComAlerta: string[]
}

function arred(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Roda a média ponderada móvel grão a grão, competência a competência.
 * `competencias` define a ORDEM do cálculo (o estoque de um mês é o inicial do
 * seguinte), então precisa vir ordenada.
 */
export function custoMedioMovel(
  competencias: string[],
  movimentos: MovimentoEstoque[],
  abertura: Partial<Record<Grao, EstoqueAbertura>> = {},
): RelatorioCustoMedio {
  const porChave = new Map(movimentos.map((m) => [`${m.competencia}|${m.grao}`, m]))
  const posicoes: PosicaoEstoque[] = []
  const cpvPorCompetencia: Record<string, number> = {}
  const compraPorCompetencia: Record<string, number> = {}
  const comAlerta = new Set<string>()

  // Estado corrente do estoque de cada grão, arrastado mês a mês.
  const estoque: Record<string, { sacas: number; valor: number }> = {}
  for (const g of GRAOS) {
    estoque[g] = { sacas: abertura[g]?.sacas ?? 0, valor: abertura[g]?.valor ?? 0 }
  }

  const ordenadas = [...competencias].sort()

  for (const competencia of ordenadas) {
    cpvPorCompetencia[competencia] = 0
    compraPorCompetencia[competencia] = 0

    for (const grao of GRAOS) {
      const m = porChave.get(`${competencia}|${grao}`)
      const sacasCompradas = m?.sacasCompradas ?? 0
      const valorComprado = m?.valorComprado ?? 0
      const sacasVendidas = m?.sacasVendidas ?? 0
      const atual = estoque[grao]

      if (!sacasCompradas && !valorComprado && !sacasVendidas && !atual.sacas && !atual.valor) {
        continue // grão sem nenhum movimento nem saldo: não gera linha
      }

      const sacasIniciais = atual.sacas
      const valorInicial = atual.valor
      const sacasDisponiveis = sacasIniciais + sacasCompradas
      const valorDisponivel = valorInicial + valorComprado
      // Sem volume disponível o custo médio não existe; cai para zero e o CPV do
      // mês fica zerado — o alerta de estoque negativo é quem denuncia.
      const custoMedio = sacasDisponiveis > 0 ? valorDisponivel / sacasDisponiveis : 0
      const cpv = sacasVendidas * custoMedio
      const sacasFinais = sacasDisponiveis - sacasVendidas
      const valorFinal = valorDisponivel - cpv
      const estoqueNegativo = sacasFinais < -0.005
      const volumeSemValor = sacasCompradas > 0 && valorComprado <= 0

      posicoes.push({
        competencia,
        grao,
        rotulo: ROTULO_GRAO[grao],
        sacasIniciais: arred(sacasIniciais),
        valorInicial: arred(valorInicial),
        sacasCompradas: arred(sacasCompradas),
        valorComprado: arred(valorComprado),
        custoMedio: arred(custoMedio),
        sacasVendidas: arred(sacasVendidas),
        cpv: arred(cpv),
        sacasFinais: arred(sacasFinais),
        valorFinal: arred(valorFinal),
        estoqueNegativo,
        volumeSemValor,
      })

      if (estoqueNegativo || volumeSemValor) comAlerta.add(competencia)
      cpvPorCompetencia[competencia] += cpv
      compraPorCompetencia[competencia] += valorComprado

      estoque[grao] = { sacas: sacasFinais, valor: valorFinal }
    }

    cpvPorCompetencia[competencia] = arred(cpvPorCompetencia[competencia])
    compraPorCompetencia[competencia] = arred(compraPorCompetencia[competencia])
  }

  return {
    posicoes,
    cpvPorCompetencia,
    compraPorCompetencia,
    competenciasComAlerta: [...comAlerta].sort(),
  }
}

/**
 * Diferença entre o CPV pelo custo médio e o CPV "igual às compras" que o DRE usa
 * hoje. Positiva = o mês está com custo A MENOS do que deveria (formou estoque).
 */
export function ajusteEstoque(rel: RelatorioCustoMedio, competencia: string): number {
  return arred((rel.cpvPorCompetencia[competencia] ?? 0) - (rel.compraPorCompetencia[competencia] ?? 0))
}

// ---------------------------------------------------------------------------
// Montagem dos movimentos a partir do que o app já tem
// ---------------------------------------------------------------------------

/** Conta de aquisição de cada grão (o valor comprado sai daqui). */
const CONTA_COMPRA: Record<Grao, string> = {
  soja: '4.1.01',
  milho: '4.1.02',
  sorgo: '4.1.03',
  cafe: '4.1.05',
}

/**
 * Monta os movimentos de estoque juntando o que cada camada sabe:
 * o VALOR comprado vem dos lançamentos (a API entrega), enquanto o VOLUME
 * comprado e o vendido vêm das sacas informadas/extraídas das notas.
 */
export function montarMovimentosEstoque(
  competencias: string[],
  lancamentos: LancamentoCanonico[],
  sacasVendidas: Record<string, Partial<Record<Grao, number>>>,
  sacasCompradas: Record<string, Partial<Record<Grao, number>>>,
): MovimentoEstoque[] {
  const valorPorChave = new Map<string, number>()
  for (const l of lancamentos) {
    const competencia = l.data.slice(0, 7)
    for (const g of GRAOS) {
      if (l.contaSafragold !== CONTA_COMPRA[g]) continue
      const chave = `${competencia}|${g}`
      valorPorChave.set(chave, (valorPorChave.get(chave) ?? 0) + l.valor)
    }
  }

  const movimentos: MovimentoEstoque[] = []
  for (const competencia of competencias) {
    for (const grao of GRAOS) {
      const valorComprado = valorPorChave.get(`${competencia}|${grao}`) ?? 0
      const compradas = sacasCompradas[competencia]?.[grao] ?? 0
      const vendidas = sacasVendidas[competencia]?.[grao] ?? 0
      if (!valorComprado && !compradas && !vendidas) continue
      movimentos.push({
        competencia,
        grao,
        sacasCompradas: compradas,
        valorComprado,
        sacasVendidas: vendidas,
      })
    }
  }
  return movimentos
}
