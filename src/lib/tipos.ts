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
export type OrigemOrcamento = 'manual' | 'planilha' | 'historico' | 'sugerido'

export interface Orcamento {
  /** Competência 'YYYY-MM'. */
  competencia: string
  /** Valor orçado por linha, em reais (magnitude, mesmo sinal do realizado). */
  valores: Partial<Record<LinhaDRE, number>>
  origem: OrigemOrcamento
  atualizadoEm: string
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
}

export function estadoDreVazio(): EstadoDre {
  return { lancamentos: [], classificacoes: [], orcamentos: [] }
}
