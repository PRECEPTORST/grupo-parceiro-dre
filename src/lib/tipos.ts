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
  'investimentos',
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
  investimentos: {
    rotulo: '(-) Investimentos',
    sinal: -1,
    descricao:
      'Aquisição de imobilizado (capex): veículos, terrenos, consórcios, máquinas e benfeitorias. Fica ABAIXO do resultado — não entra no resultado operacional.',
  },
}

// ---------------------------------------------------------------------------
// Grãos negociados — hoje soja, milho, sorgo e café. Usados para quebrar a
// receita/deduções/lucro bruto por cereal e calcular resultados por saca.
// ---------------------------------------------------------------------------
export type Grao = 'soja' | 'milho' | 'sorgo' | 'cafe'
export const GRAOS: Grao[] = ['soja', 'milho', 'sorgo', 'cafe']
export const ROTULO_GRAO: Record<Grao, string> = {
  soja: 'Soja',
  milho: 'Milho',
  sorgo: 'Sorgo',
  cafe: 'Café',
}

// ---------------------------------------------------------------------------
// Lançamento canônico — o que sai da ingestão (Enoki/planilha), normalizado.
// `valor` é em REAIS e quase sempre POSITIVO (a magnitude que pertence à sua
// linha); só estornos vindos do ERP são negativos. A camada de normalização já
// resolve débito/crédito e sinal.
// ---------------------------------------------------------------------------
export type OrigemLancamento = 'enoki' | 'planilha' | 'manual'

export interface LancamentoCanonico {
  id: string
  /** Competência do lançamento (data ISO 'YYYY-MM-DD'). */
  data: string
  /** Código/nome da conta de origem no Safragold — chave da classificação. */
  contaSafragold: string
  historico: string
  /**
   * Valor em reais, normalmente POSITIVO (a magnitude que pertence à sua linha).
   * Pode ser NEGATIVO em um caso específico: ESTORNO vindo do ERP (pagamento num
   * centro de custo de receita, recebimento num centro de compra). O motor soma
   * os valores por conta, então o negativo reduz a linha corretamente.
   */
  valor: number
  centroCusto?: string
  /**
   * De onde veio o lançamento: 'enoki' (API Safra Cloud, automático), 'planilha'
   * (importação da DRE gerencial) ou 'manual'. AUSENTE = 'planilha' (dados
   * carregados antes deste campo existir) — ver item 1.5 do ROADMAP.md.
   */
  origem?: OrigemLancamento
}

/** Origem efetiva de um lançamento (ausente = 'planilha', retrocompatível). */
export function origemDe(l: Pick<LancamentoCanonico, 'origem'>): OrigemLancamento {
  return l.origem ?? 'planilha'
}

export const ROTULO_ORIGEM: Record<OrigemLancamento, string> = {
  enoki: 'Enoki (API)',
  planilha: 'Planilha',
  manual: 'Manual',
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
  /**
   * Sacas ORÇADAS por conta de receita de grão (volume planejado). Para essas
   * contas o valor é derivado: `valores[conta] = sacas[conta] × precoSaca[conta]`.
   * Ausente/zero nas contas que não são receita de grão.
   */
  sacas?: Record<string, number>
  /** Preço de VENDA/saca ORÇADO por conta de receita de grão. */
  precoSaca?: Record<string, number>
  /**
   * Margem bruta esperada por saca (R$/saca), por conta de receita de grão.
   * Preço de compra/saca = precoSaca − margemSaca; o custo de aquisição da conta
   * de custo do grão (4.1.0x) = sacas × preço de compra.
   */
  margemSaca?: Record<string, number>
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
// Tributos automáticos do orçamento.
//
// Alguns custos são PERCENTUAIS de compra/venda — impostos, sobretudo. Em vez de
// digitar conta a conta, cada `RegraImposto` calcula o valor a partir de uma base
// (receita de venda, custo de compra ou margem) e joga na conta do plano indicada.
// As alíquotas abaixo são um PONTO DE PARTIDA típico p/ comércio de grãos e devem
// ser conferidas com o contador (variam por regime/UF/operação).
// ---------------------------------------------------------------------------
export type BaseImposto = 'venda' | 'compra' | 'margem'

export interface RegraImposto {
  id: string
  nome: string
  /** Conta do plano onde o valor calculado é lançado (ex.: '3.2.02' PIS). */
  conta: string
  /** Sobre o que a alíquota incide. */
  base: BaseImposto
  /** Alíquota em % (ex.: 3 = 3%). */
  aliquota: number
  ativo: boolean
}

export function impostosPadrao(): RegraImposto[] {
  return [
    { id: 'funrural', nome: 'Funrural (compra de produtor PF)', conta: '3.2.04', base: 'compra', aliquota: 1.5, ativo: true },
    { id: 'pis', nome: 'PIS sobre vendas', conta: '3.2.02', base: 'venda', aliquota: 0.65, ativo: true },
    { id: 'cofins', nome: 'COFINS sobre vendas', conta: '3.2.03', base: 'venda', aliquota: 3.0, ativo: true },
    { id: 'icms', nome: 'ICMS sobre vendas', conta: '3.2.01', base: 'venda', aliquota: 0, ativo: false },
  ]
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
  /** Centro de custo do ERP (ex.: "RECEITA SOJA", "COMPRA MILHO") — base do resultado por grão. */
  centroCusto?: string
}

// ---------------------------------------------------------------------------
// Configuração da camada de confiabilidade / materialidade.
// ---------------------------------------------------------------------------
export interface ConfigConfiabilidade {
  /** Piso de materialidade em R$ para CUSTOS/DESPESAS/deduções/impostos (piso absoluto). */
  pisoMaterialidade: number
  /** Corte de materialidade em % para RECEITAS (relativo ao valor da própria conta). */
  pctReceita: number
  /** IDs de achados que o Controler/sócio marcou como "ignorar". */
  ignorados: string[]
}

export function configConfiabilidadePadrao(): ConfigConfiabilidade {
  return { pisoMaterialidade: 1000, pctReceita: 3, ignorados: [] }
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
  /** Configuração da confiabilidade (piso de materialidade + achados ignorados). */
  confiabilidade?: ConfigConfiabilidade
  /** Regras de tributos automáticos do orçamento (ausente = usa `impostosPadrao`). */
  impostos?: RegraImposto[]
  /** Sacas vendidas por competência ('YYYY-MM') e grão — informadas manualmente. */
  sacas?: Record<string, Partial<Record<Grao, number>>>
  /**
   * Margem de contribuição: incluir as DESPESAS COMERCIAIS (comissão, frete de
   * venda, marketing) como custo variável, além do CPV. Ausente/false = só CPV
   * (= lucro bruto). Aplica no painel e no DRE. Definição escolhida pelo cliente.
   */
  mcIncluirComerciais?: boolean
  /**
   * Resultado líquido INFORMADO na origem por competência ('YYYY-MM' → R$), quando
   * os dados vêm de uma DRE já fechada (ex.: importação da DRE gerencial do cliente).
   * A auditoria compara a soma das nossas contas com este total: se divergir, houve
   * ajuste manual no subtotal da origem. Ausente quando a fonte não declara total.
   */
  resultadoDeclarado?: Record<string, number>
  /**
   * Lançamentos vindos da API Enoki por COMPETÊNCIA (item 1.3 do ROADMAP.md).
   * Ficam num campo SEPARADO de propósito: na Fase 1 as duas fontes convivem
   * LADO A LADO (planilha × Enoki) e o usuário escolhe qual ler em `fonteDre`.
   * Somar as duas seria dupla contagem — a fusão controlada é a Fase 2 (item 2.1).
   */
  lancamentosEnoki?: LancamentoCanonico[]
  /** Sacas vendidas extraídas das notas fiscais da Enoki (item 2.2 usa isto). */
  sacasEnoki?: Record<string, Partial<Record<Grao, number>>>
  /** Diagnóstico da última sincronização com a Enoki. */
  enokiSync?: EnokiSyncMeta
  /** Qual fonte o DRE exibe. Ausente = 'planilha' (retrocompatível). */
  fonteDre?: FonteDre
  /** Regras aprendidas para o resíduo da Enoki (item 1.4 do ROADMAP.md). */
  regrasEnoki?: RegraEnoki[]
  /**
   * Fonte de cada linha do DRE no modo fundido (item 2.1). Parcial: o que faltar
   * usa `configFusaoPadrao()`.
   */
  configFusao?: Partial<ConfigFusao>
}

/**
 * Regra aprendida para títulos que o ERP mandou SEM centro de custo.
 * `chave` = nome do parceiro normalizado. Sugerida pela IA, editável pelo
 * usuário — quando `origem` é 'manual' a regra nunca mais volta para o modelo.
 */
export interface RegraEnoki {
  chave: string
  /** Conta do plano onde os títulos desse parceiro são lançados. */
  conta: string
  /** 0..1 — abaixo de LIMIAR_REVISAO entra na fila de revisão. */
  confianca: number
  justificativa: string
  origem: 'ia' | 'manual'
}

/** Mapa chave → conta a partir das regras aprendidas (o que a normalização usa). */
export function mapaRegrasEnoki(regras: RegraEnoki[] | undefined): Record<string, string> {
  const mapa: Record<string, string> = {}
  for (const r of regras ?? []) if (r.chave && r.conta) mapa[r.chave] = r.conta
  return mapa
}

/** Fonte de dados que alimenta o DRE exibido. */
export type FonteDre = 'planilha' | 'enoki' | 'fundido'

export const ROTULO_FONTE: Record<FonteDre, string> = {
  planilha: 'Planilha (DRE gerencial)',
  enoki: 'Enoki (API, automático)',
  fundido: 'Fundido (Enoki + planilha)',
}

/** De qual fonte uma linha do DRE é lida no modo fundido (ver `fusao.ts`). */
export type FonteLinha = 'enoki' | 'planilha'

/** Fonte escolhida para cada linha do DRE no modo fundido. */
export type ConfigFusao = Record<LinhaDRE, FonteLinha>

/** Resumo da última sincronização com a Enoki — alimenta o selo de status. */
export interface EnokiSyncMeta {
  atualizadoEm: string
  de: string
  ate: string
  /** Registros crus trazidos da API. */
  registros: number
  /** Lançamentos gerados após a normalização. */
  lancamentos: number
  /** true quando a API apontada é a de homologação. */
  homologacao: boolean
  /** false quando o laço parou antes de percorrer todas as tarefas. */
  completo: boolean
  /**
   * Títulos sem regra determinística (fila da IA — item 1.4). Guarda `chave` e
   * `amostras` porque é exatamente isso que o classificador precisa receber.
   */
  residuos: {
    chave: string
    centroCusto: string
    fluxo: 'entrada' | 'saida'
    quantidade: number
    valor: number
    amostras: string[]
  }[]
  /** O que foi descartado e por quê (auditoria). */
  descartes: { motivo: string; quantidade: number; valor: number }[]
}

/** Fonte efetiva do DRE (ausente = 'planilha'). */
export function fonteDreDe(estado: Pick<EstadoDre, 'fonteDre'>): FonteDre {
  return estado.fonteDre ?? 'planilha'
}

/**
 * Lançamentos das fontes SIMPLES (planilha ou Enoki). O modo 'fundido' precisa do
 * mapa de contas para decidir linha a linha, então é resolvido no `DreContext`
 * com `fundirLancamentos` — não dá para fazer aqui sem import circular.
 */
export function lancamentosDaFonte(estado: EstadoDre): LancamentoCanonico[] {
  return fonteDreDe(estado) === 'enoki' ? (estado.lancamentosEnoki ?? []) : estado.lancamentos
}

/**
 * Sacas vendidas por competência conforme a fonte. Na fonte Enoki as sacas saem
 * das notas fiscais, mas o que foi digitado à mão SEMPRE vence — quem conferiu o
 * número não pode ser atropelado por uma sincronização.
 */
export function sacasDaFonte(estado: EstadoDre): Record<string, Partial<Record<Grao, number>>> {
  const manuais = estado.sacas ?? {}
  if (fonteDreDe(estado) === 'planilha') return manuais
  const automaticas = estado.sacasEnoki ?? {}
  const saida: Record<string, Partial<Record<Grao, number>>> = {}
  for (const competencia of new Set([...Object.keys(automaticas), ...Object.keys(manuais)])) {
    saida[competencia] = { ...automaticas[competencia], ...manuais[competencia] }
  }
  return saida
}

export function estadoDreVazio(): EstadoDre {
  return { lancamentos: [], classificacoes: [], orcamentos: [] }
}
