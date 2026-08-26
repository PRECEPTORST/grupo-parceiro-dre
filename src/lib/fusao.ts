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
 * - comerciais → Enoki: marketing, brindes e comissão têm centro de custo próprio.
 * - outras receitas/receita financeira/investimentos → planilha. Estavam em
 *   'enoki' por suposição, e a conferência de julho mostrou o ERP com ZERO nas
 *   três: "descontos obtidos" (R$ 21,3 mil), juros recebidos (R$ 14,6 mil) e
 *   capex (R$ 47,0 mil contra R$ 781 no ERP) só existem na planilha. Ler de onde
 *   não há dado é o "buraco silencioso" que `linhasOrfas` denuncia — e o padrão
 *   não devia ser justamente o que dispara o alerta.
 */
export function configFusaoPadrao(): ConfigFusao {
  return {
    receita_bruta: 'enoki',
    deducoes: 'enoki',
    custo_produto: 'enoki',
    despesas_comerciais: 'enoki',
    despesas_administrativas: 'planilha',
    outras_receitas_operacionais: 'planilha',
    depreciacao_amortizacao: 'planilha',
    receita_financeira: 'planilha',
    despesa_financeira: 'planilha',
    impostos_lucro: 'planilha',
    investimentos: 'planilha',
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

/** Linha em que a fonte configurada estava vazia e a outra foi usada no lugar. */
export interface SubstituicaoFonte {
  linha: LinhaDRE
  competencia: string
  configurada: FonteLinha
  usada: FonteLinha
  valor: number
}

export interface ResultadoFusao {
  lancamentos: LancamentoCanonico[]
  porLinha: ResumoFusao[]
  /**
   * Onde a fonte escolhida não tinha dado NAQUELE mês e a outra entrou no lugar.
   * Não é detalhe: sem isso, agosto/2026 saía com despesa administrativa ZERO —
   * a planilha ainda não cobria o mês, e a regra mandava ler dela, então os
   * R$ 161.567,21 que o ERP trouxe (a folha inclusive) eram jogados fora e o
   * EBITDA aparecia como se a empresa não tivesse despesa.
   */
  substituicoes: SubstituicaoFonte[]
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
  const substituicoes: SubstituicaoFonte[] = []
  let naoClassificados = 0

  // Índice (linha × competência × fonte). A escolha é feita POR MÊS porque a
  // cobertura das fontes é diferente em cada um: a planilha chega com atraso, o
  // ERP só tem o que já foi raspado.
  const porChave = new Map<string, LancamentoCanonico[]>()
  const chave = (linha: LinhaDRE, comp: string, fonte: FonteLinha) => `${linha}|${comp}|${fonte}`

  const indexar = (lista: LancamentoCanonico[], origem: FonteLinha) => {
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
      const k = chave(linha, (l.data ?? '').slice(0, 7), origem)
      const atual = porChave.get(k)
      if (atual) atual.push(l)
      else porChave.set(k, [l])
    }
  }

  indexar(planilha, 'planilha')
  indexar(enoki, 'enoki')

  const competencias = [
    ...new Set([...planilha, ...enoki].map((l) => (l.data ?? '').slice(0, 7)).filter(Boolean)),
  ]
  const outra = (f: FonteLinha): FonteLinha => (f === 'enoki' ? 'planilha' : 'enoki')

  for (const linha of LINHAS_DRE) {
    const r = resumo.get(linha)!
    for (const competencia of competencias) {
      const escolhida = config[linha]
      const daEscolhida = porChave.get(chave(linha, competencia, escolhida)) ?? []
      const daOutra = porChave.get(chave(linha, competencia, outra(escolhida))) ?? []

      // A fonte configurada manda. Só quando ela está VAZIA neste mês a outra
      // entra — e a troca fica registrada, nunca em silêncio.
      const usar = daEscolhida.length ? daEscolhida : daOutra
      const fonteUsada = daEscolhida.length ? escolhida : outra(escolhida)
      const preteridos = daEscolhida.length ? daOutra : []

      if (!daEscolhida.length && daOutra.length) {
        substituicoes.push({
          linha,
          competencia,
          configurada: escolhida,
          usada: fonteUsada,
          valor: daOutra.reduce((s, l) => s + l.valor, 0),
        })
      }

      for (const l of usar) {
        lancamentos.push(l)
        r.aceitos++
        r.valorAceito += l.valor
      }
      for (const l of preteridos) {
        r.descartados++
        r.valorDescartado += l.valor
      }
    }
  }

  const arred = (v: number) => Math.round(v * 100) / 100
  const porLinha = LINHAS_DRE.map((linha) => {
    const r = resumo.get(linha)!
    return { ...r, valorAceito: arred(r.valorAceito), valorDescartado: arred(r.valorDescartado) }
  })

  return { lancamentos, porLinha, naoClassificados, substituicoes }
}

/**
 * Resumo das substituições por linha — quantos meses e quanto valor entraram de
 * uma fonte que não era a configurada.
 *
 * Substituiu `linhasOrfas`, que só sabia AVISAR do buraco. Avisar não bastava:
 * em agosto/2026 a linha órfã era a despesa administrativa, e o DRE saía com
 * despesa zero enquanto o alerta piscava ao lado. Agora o buraco é preenchido
 * pela fonte que tem o dado, e esta função conta o que foi trocado — a troca
 * precisa continuar visível, senão vira dado sem procedência.
 */
export function linhasSubstituidas(
  resultado: ResultadoFusao,
): { linha: LinhaDRE; meses: number; valor: number; usada: FonteLinha }[] {
  const porLinha = new Map<LinhaDRE, { linha: LinhaDRE; meses: number; valor: number; usada: FonteLinha }>()
  for (const s of resultado.substituicoes) {
    const atual = porLinha.get(s.linha)
    if (atual) {
      atual.meses++
      atual.valor += s.valor
    } else {
      porLinha.set(s.linha, { linha: s.linha, meses: 1, valor: s.valor, usada: s.usada })
    }
  }
  return [...porLinha.values()].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
}

/** Cobertura de uma competência: quais fontes têm dados nela. */
export interface CoberturaCompetencia {
  competencia: string
  temPlanilha: boolean
  temEnoki: boolean
  /** true quando as duas fontes têm dados — só aí a fusão descreve o mesmo fato. */
  fundivel: boolean
}

function competenciasDe(lancs: LancamentoCanonico[]): Set<string> {
  const s = new Set<string>()
  for (const l of lancs) if (l.data) s.add(l.data.slice(0, 7))
  return s
}

/**
 * Onde a fusão é honesta e onde ela mente.
 *
 * A FUSÃO SÓ DESCREVE UM FATO QUANDO AS DUAS FONTES COBREM O MÊS.
 *
 * Cada linha do DRE vem de UMA fonte: receita e CPV do Enoki, folha e
 * depreciação da planilha. Num mês em que só a planilha tem dados, isso deixa de
 * ser "duas visões do mesmo período" e vira subtração de coisas diferentes — e o
 * acumulado propaga o estrago em silêncio.
 *
 * Aconteceu, e o número era grande: com o Enoki cobrindo só julho e a planilha
 * jan–jul, o resultado acumulado do modo fundido deu −R$ 1.615.888,01. Um mês de
 * margem bruta contra sete meses de estrutura. Nada na tela dizia isso.
 */
export function coberturaFusao(
  planilha: LancamentoCanonico[],
  enoki: LancamentoCanonico[],
): CoberturaCompetencia[] {
  const cp = competenciasDe(planilha)
  const ce = competenciasDe(enoki)
  return [...new Set([...cp, ...ce])].sort().map((competencia) => {
    const temPlanilha = cp.has(competencia)
    const temEnoki = ce.has(competencia)
    return { competencia, temPlanilha, temEnoki, fundivel: temPlanilha && temEnoki }
  })
}

/** Competências em que a fusão NÃO pode ser lida — uma das fontes está vazia. */
export function competenciasNaoFundiveis(
  planilha: LancamentoCanonico[],
  enoki: LancamentoCanonico[],
): CoberturaCompetencia[] {
  return coberturaFusao(planilha, enoki).filter((c) => !c.fundivel)
}
