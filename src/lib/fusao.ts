// Fusão das fontes do DRE — DETERMINÍSTICA. Item 2.1 do ROADMAP.md.
//
// O PROBLEMA
// ----------
// A API da Enoki cobre muito bem o TRADING (receita das notas fiscais, compra de
// grão, frete, armazenagem) e mal a ESTRUTURA (folha, depreciação, empréstimos,
// IRPJ/CSLL) — ver §27 do context.md. A planilha da DRE gerencial cobre tudo,
// mas é manual e chega com atraso.
//
// Somar as duas seria contar a mesma venda duas vezes. A saída é escolher, POR
// LINHA DO DRE, de qual fonte ela vem. Cada lançamento é atribuído à sua linha
// pelo mapa de contas e só entra se a linha estiver configurada para a origem
// dele. Nenhum valor é somado duas vezes, e nenhuma linha fica órfã.
//
// O padrão abaixo reflete o que a validação real mostrou; é editável na tela,
// porque a resposta de "a folha passa pelo financeiro da Enoki?" (item 0.1 do
// roadmap) pode mudar a configuração certa.

import {
  LINHAS_DRE,
  type LinhaDRE,
  type LancamentoCanonico,
  type MapaClassificacao,
  type ConfigFusao,
  type FonteLinha,
} from './tipos'

export type { ConfigFusao, FonteLinha }

/**
 * Padrão: trading da Enoki, estrutura da planilha.
 *
 * Por que cada uma:
 * - receita/deduções/CPV/investimentos → Enoki: são notas fiscais e títulos de
 *   compra, que a API entrega com data do fato gerador e por grão.
 * - administrativas/depreciação/financeiras/IRPJ → planilha: na homologação a
 *   folha quase não aparece (só "FÉRIAS R$ 12k") e não há depreciação nem
 *   imposto sobre o lucro. Confirmar com o cliente (item 0.1).
 * - comerciais/outras receitas → Enoki: marketing, brindes, corretagem e
 *   armazenagem de terceiros têm centro de custo próprio no ERP.
 */
export function configFusaoPadrao(): ConfigFusao {
  return {
    receita_bruta: 'enoki',
    deducoes: 'enoki',
    custo_produto: 'enoki',
    despesas_comerciais: 'enoki',
    despesas_administrativas: 'planilha',
    outras_receitas_operacionais: 'enoki',
    depreciacao_amortizacao: 'planilha',
    receita_financeira: 'enoki',
    despesa_financeira: 'planilha',
    impostos_lucro: 'planilha',
    investimentos: 'enoki',
  }
}

/** Completa uma configuração parcial com o padrão (retrocompatível). */
export function configFusaoEfetiva(parcial?: Partial<ConfigFusao> | null): ConfigFusao {
  const padrao = configFusaoPadrao()
  if (!parcial) return padrao
  const out = { ...padrao }
  for (const linha of LINHAS_DRE) {
    const v = parcial[linha]
    if (v === 'enoki' || v === 'planilha') out[linha] = v
  }
  return out
}

export interface ResumoFusao {
  linha: LinhaDRE
  fonte: FonteLinha
  /** Lançamentos aceitos desta linha. */
  aceitos: number
  /** Lançamentos DESCARTADOS por virem da fonte não escolhida para a linha. */
  descartados: number
  valorAceito: number
  valorDescartado: number
}

export interface ResultadoFusao {
  lancamentos: LancamentoCanonico[]
  porLinha: ResumoFusao[]
  /**
   * Lançamentos sem conta no mapa. Vêm SÓ da planilha: os da Enoki sempre caem
   * numa conta do plano, então uma conta desconhecida aqui é da importação
   * manual e precisa de classificação — não pode sumir na fusão.
   */
  naoClassificados: number
}

/**
 * Combina as duas fontes escolhendo, por linha do DRE, de qual delas ler.
 * Mesma entrada → mesma saída.
 */
export function fundirLancamentos(
  planilha: LancamentoCanonico[],
  enoki: LancamentoCanonico[],
  mapa: MapaClassificacao,
  config: ConfigFusao,
): ResultadoFusao {
  const resumo = new Map<LinhaDRE, ResumoFusao>(
    LINHAS_DRE.map((linha) => [
      linha,
      { linha, fonte: config[linha], aceitos: 0, descartados: 0, valorAceito: 0, valorDescartado: 0 },
    ]),
  )
  const lancamentos: LancamentoCanonico[] = []
  let naoClassificados = 0

  const processar = (lista: LancamentoCanonico[], origem: FonteLinha) => {
    for (const l of lista) {
      const linha = mapa[l.contaSafragold]
      if (!linha) {
        // Só a planilha pode ter conta fora do plano; manter para revisão.
        if (origem === 'planilha') {
          lancamentos.push(l)
          naoClassificados++
        }
        continue
      }
      const r = resumo.get(linha)!
      if (config[linha] === origem) {
        lancamentos.push(l)
        r.aceitos++
        r.valorAceito += l.valor
      } else {
        r.descartados++
        r.valorDescartado += l.valor
      }
    }
  }

  processar(planilha, 'planilha')
  processar(enoki, 'enoki')

  const arred = (v: number) => Math.round(v * 100) / 100
  const porLinha = LINHAS_DRE.map((linha) => {
    const r = resumo.get(linha)!
    return { ...r, valorAceito: arred(r.valorAceito), valorDescartado: arred(r.valorDescartado) }
  })

  return { lancamentos, porLinha, naoClassificados }
}

/**
 * Linhas cuja fonte escolhida não tem NENHUM lançamento, embora a outra fonte
 * tenha. É o alerta de "linha órfã": a configuração está mandando ler de onde
 * não há dado, e o DRE sairia com um buraco silencioso.
 */
export function linhasOrfas(resultado: ResultadoFusao): ResumoFusao[] {
  return resultado.porLinha.filter((r) => r.aceitos === 0 && r.descartados > 0)
}
