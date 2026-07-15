// Modelo de domínio do DRE do Grupo Parceiro.
//
// Este arquivo é o CONTRATO compartilhado por todas as camadas:
//   ingestão (Safragold) → classificação (agente Claude) → motor do DRE → UI.
// Manter os tipos aqui evita que a matemática do DRE e a IA divirjam.

// ---------------------------------------------------------------------------
// Linhas do DRE — as "contas de destino" onde cada lançamento pousa.
// A ordem aqui é a ordem de exibição no DRE.
// ---------------------------------------------------------------------------
export const LINHAS_DRE = [
  'receita_bruta',
  'deducoes',
  'custo_produto',
  'despesas_comerciais',
  'despesas_administrativas',
  'outras_receitas_operacionais',
  'depreciacao_amortizacao',
  'receita_financeira',
  'despesa_financeira',
  'impostos_lucro',
] as const

export type LinhaDRE = (typeof LINHAS_DRE)[number]

/** Metadados de cada linha: rótulo exibido e sinal da contribuição no resultado. */
export interface MetaLinha {
  rotulo: string
  /** +1 soma no resultado (receitas), -1 subtrai (custos/despesas/impostos). */
  sinal: 1 | -1
  /** Dica dada ao agente Claude para classificar contas nesta linha. */
  descricao: string
}

export const META_LINHAS: Record<LinhaDRE, MetaLinha> = {
  receita_bruta: {
    rotulo: 'Receita bruta de vendas',
    sinal: 1,
    descricao: 'Venda de grãos e serviços — faturamento bruto, antes de impostos.',
  },
  deducoes: {
    rotulo: '(-) Deduções e impostos s/ vendas',
    sinal: -1,
    descricao: 'ICMS, PIS, COFINS, Funrural, devoluções e abatimentos sobre a receita.',
  },
  custo_produto: {
    rotulo: '(-) Custo dos produtos vendidos',
    sinal: -1,
    descricao: 'CPV/CMV: aquisição de grãos, insumos, sementes, frete de compra, armazenagem.',
  },
  despesas_comerciais: {
    rotulo: '(-) Despesas comerciais',
    sinal: -1,
    descricao: 'Comissões, frete de venda, marketing, despesas com vendas.',
  },
  despesas_administrativas: {
    rotulo: '(-) Despesas administrativas',
    sinal: -1,
    descricao: 'Folha administrativa, aluguel, honorários, softwares, despesas de escritório.',
  },
  outras_receitas_operacionais: {
    rotulo: '(+) Outras receitas operacionais',
    sinal: 1,
    descricao: 'Receitas operacionais fora da venda principal (ex.: prestação de serviço, aluguel recebido).',
  },
  depreciacao_amortizacao: {
    rotulo: '(-) Depreciação e amortização',
    sinal: -1,
    descricao: 'Depreciação de máquinas, veículos e benfeitorias; amortização de intangíveis.',
  },
  receita_financeira: {
    rotulo: '(+) Receitas financeiras',
    sinal: 1,
    descricao: 'Juros recebidos, rendimentos de aplicações, descontos obtidos.',
  },
  despesa_financeira: {
    rotulo: '(-) Despesas financeiras',
    sinal: -1,
    descricao: 'Juros pagos, tarifas bancárias, IOF, descontos concedidos.',
  },
  impostos_lucro: {
    rotulo: '(-) IRPJ e CSLL',
    sinal: -1,
    descricao: 'Imposto de renda e contribuição social sobre o lucro.',
  },
}

// ---------------------------------------------------------------------------
// Lançamento canônico — o que sai da ingestão do Safragold, normalizado.
// `valor` é sempre em REAIS e POSITIVO (a magnitude que pertence à sua linha).
// A camada de normalização já resolve débito/crédito e sinal.
// ---------------------------------------------------------------------------
export interface LancamentoCanonico {
  id: string
  /** Competência do lançamento (data ISO 'YYYY-MM-DD'). */
  data: string
  /** Código/nome da conta de origem no Safragold — chave da classificação. */
  contaSafragold: string
  historico: string
  /** Valor em reais, positivo. */
  valor: number
  centroCusto?: string
}

/** Saída do agente classificador para cada conta do Safragold. */
export interface Classificacao {
  contaSafragold: string
  linha: LinhaDRE
  /** 0..1 — abaixo de LIMIAR_REVISAO vai para a fila do Controler (semente do Sprint 2). */
  confianca: number
  justificativa: string
}

export const LIMIAR_REVISAO = 0.8

/** Mapa conta → linha, materializado a partir das classificações confirmadas. */
export type MapaClassificacao = Record<string, LinhaDRE>

// ---------------------------------------------------------------------------
// Orçamento — construído no app (manual, planilha, histórico ou sugerido por IA).
// ---------------------------------------------------------------------------
export type OrigemOrcamento = 'manual' | 'planilha' | 'historico' | 'sugerido' | 'documento'

/**
 * Situação de aprovação do planejamento orçamentário:
 * - `rascunho`: em elaboração / pendente de aprovação do sócio.
 * - `aprovado`: aprovado por um sócio (só então é o plano "oficial").
 * Qualquer edição nos valores derruba de volta para `rascunho` (re-aprovação).
 */
export type StatusOrcamento = 'rascunho' | 'aprovado'

export interface Orcamento {
  /** Competência 'YYYY-MM'. */
  competencia: string
  /**
   * Valor orçado POR CONTA (chave = contaSafragold), em reais, magnitude
   * positiva (mesmo sinal do realizado). Os totais de linha e os subtotais do
   * DRE são derivados somando as contas de cada linha via classificação.
   */
  valores: Record<string, number>
  origem: OrigemOrcamento
  atualizadoEm: string
  /** Aprovação do sócio. Ausente = trata-se como `rascunho`. */
  status?: StatusOrcamento
  /** Usuário sócio que aprovou (quando `aprovado`). */
  aprovadoPor?: string
  /** Quando foi aprovado (ISO). */
  aprovadoEm?: string
}

/** true quando o orçamento está aprovado por um sócio. */
export function orcamentoAprovado(o?: Orcamento | null): boolean {
  return !!o && o.status === 'aprovado'
}

// ---------------------------------------------------------------------------
// Projeção de fluxo de caixa (Sprint 2).
//
// O DRE está em regime de COMPETÊNCIA (quando o fato econômico ocorre). O caixa
// está em regime de CAIXA (quando o dinheiro entra/sai). A projeção converte um
// no outro via PRAZOS médios editáveis (recebimento/pagamento) e parte de um
// saldo de caixa conhecido. Quando a integração com o Enoki trouxer as contas a
// pagar/receber com vencimento real, elas entram como `MovimentoCaixa` e passam
// a valer no lugar da estimativa por prazo (ver `projetarCaixa` em lib/caixa.ts).
// ---------------------------------------------------------------------------
export type MetodoProjecaoCaixa = 'orcamento_historico' | 'orcamento' | 'historico'

export interface PremissasCaixa {
  /** Saldo de caixa/banco conhecido no início de `competenciaSaldo`, em reais. */
  saldoInicial: number
  /** Competência 'YYYY-MM' a que o saldo inicial se refere (início do mês). */
  competenciaSaldo: string
  /** Quantos meses projetar à frente a partir de `competenciaSaldo`. */
  horizonteMeses: number
  /** Prazo médio de recebimento das receitas (dias entre competência e caixa). */
  prazoRecebimentoDias: number
  /** Prazo médio de pagamento de custos e despesas (dias). */
  prazoPagamentoDias: number
  /** Prazo médio de recolhimento de impostos/deduções (dias). */
  prazoImpostosDias: number
  /** Como projetar as competências futuras sem realizado. */
  metodoProjecao: MetodoProjecaoCaixa
  /** Quantos meses de realizado usar na média ao projetar pelo histórico. */
  mesesBaseHistorico: number
  atualizadoEm: string
}

/** 'YYYY-MM' do mês corrente (base do saldo inicial por padrão). */
function competenciaCorrente(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function premissasCaixaPadrao(): PremissasCaixa {
  return {
    saldoInicial: 0,
    competenciaSaldo: competenciaCorrente(),
    horizonteMeses: 6,
    prazoRecebimentoDias: 30,
    prazoPagamentoDias: 30,
    prazoImpostosDias: 30,
    metodoProjecao: 'orcamento_historico',
    mesesBaseHistorico: 3,
    atualizadoEm: new Date().toISOString(),
  }
}

/**
 * Movimento de caixa REAL (data em que o dinheiro efetivamente entra/sai).
 * Hoje não há produtor: é o contrato de ingestão das contas a pagar/receber do
 * Enoki (com vencimento). Quando existir, `projetarCaixa` usa estes movimentos
 * no lugar da estimativa por prazo nos meses que eles cobrem. Ver `safragold-sync.ts`.
 */
export interface MovimentoCaixa {
  id: string
  /** Data do movimento de caixa (ISO 'YYYY-MM-DD') — vencimento/liquidação. */
  data: string
  tipo: 'entrada' | 'saida'
  /** Valor em reais, positivo. */
  valor: number
  descricao?: string
}

// ---------------------------------------------------------------------------
// Estado persistido do app (Blob + cache local).
// ---------------------------------------------------------------------------
export interface EstadoDre {
  /** Lançamentos importados do Safragold (cache; a fonte da verdade é o Safragold). */
  lancamentos: LancamentoCanonico[]
  /** Classificações conta → linha, com confiança, para reuso sem re-chamar o modelo. */
  classificacoes: Classificacao[]
  /** Orçamentos por competência. */
  orcamentos: Orcamento[]
  /** Premissas da projeção de caixa (opcional; usa o padrão quando ausente). */
  premissasCaixa?: PremissasCaixa
}

export function estadoDreVazio(): EstadoDre {
  return { lancamentos: [], classificacoes: [], orcamentos: [] }
}
