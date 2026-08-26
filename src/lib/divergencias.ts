// Divergências e decisões pendentes da carga do ERP — DETERMINÍSTICO, zero IA.
//
// POR QUE ISTO EXISTE
// -------------------
// O DRE montado a partir do ERP NÃO bate com a planilha do cliente, e a maior
// parte da diferença não é erro: é decisão. Eliminar frete intragrupo, tratar
// remessa de exportação como venda, contar capex abaixo do resultado — cada uma
// dessas escolhas move milhões, todas são defensáveis, e nenhuma é minha para
// tomar sozinho.
//
// Um número sozinho na tela mente por omissão. Esta tela mostra, para cada
// divergência: quanto vale, o que está valendo hoje, o que muda se a decisão for
// outra, e de quem é a decisão. Quem olha o DRE vê o que está por trás dele.
//
// O impacto em R$ NÃO é digitado aqui: vem dos `descartes` que a própria
// normalização registrou (`enokiDre.ts`). Se a regra mudar, o número muda junto.
import type { EnokiSyncMeta } from './tipos'

export type SituacaoDivergencia = 'aberta' | 'decidida'

export interface Divergencia {
  id: string
  titulo: string
  /** Impacto medido em R$ no período carregado. */
  valor: number
  /** Quantos documentos/títulos estão por trás do valor. */
  quantidade: number
  situacao: SituacaoDivergencia
  /** Em que linha do DRE isso bate. */
  linha: 'receita' | 'custo' | 'deducoes' | 'despesas' | 'estrutura'
  /** O que é, em uma frase, sem jargão. */
  oQueE: string
  /** A regra que está valendo agora. */
  valendoHoje: string
  /** O que acontece com o resultado se a decisão for a outra. */
  seMudar: string
  /** Quem tem a informação para decidir. */
  quemDecide: string
}

/**
 * Explicação de cada motivo de descarte. A chave é o motivo que
 * `enokiDre.ts` grava; o valor é o que a pessoa precisa saber para decidir.
 *
 * `decidida` = a regra está fechada e conferida, aparece só para auditoria.
 * `aberta`  = alguém precisa responder antes de o número ser confiável.
 */
const EXPLICACAO: Record<
  string,
  Omit<Divergencia, 'id' | 'valor' | 'quantidade'>
> = {
  nf_intragrupo: {
    titulo: 'Operações entre empresas do próprio grupo',
    situacao: 'aberta',
    linha: 'custo',
    oQueE:
      'Compras e fretes contratados de outra empresa do Grupo Parceiro. Num DRE consolidado do grupo elas se anulam: o custo de uma é a receita da outra.',
    valendoHoje:
      'Eliminadas. É o certo para o DRE consolidado das cinco empresas — que é o objetivo.',
    seMudar:
      'Enquanto só uma empresa estiver carregada, a eliminação é assimétrica: tira o custo daqui sem registrar a receita na irmã, e subestima o resultado. Carregar as outras quatro fecha isso sem mexer na regra.',
    quemDecide: 'Depende de carregar as 5 empresas — trabalho nosso, não pergunta ao cliente.',
  },
  nf_remessa: {
    titulo: 'Remessa e retorno de armazém geral',
    situacao: 'decidida',
    linha: 'receita',
    oQueE:
      'Nota de saída em que o grão sai do pátio mas continua sendo da empresa (CFOP 5905/5934). Movimentação física, não venda.',
    valendoHoje: 'Fora da receita.',
    seMudar: 'Contar como venda inflaria o faturamento sem nenhuma entrada de dinheiro.',
    quemDecide: 'Fechado — o CFOP não deixa dúvida.',
  },
  nf_transferencia: {
    titulo: 'Transferência entre estabelecimentos',
    situacao: 'decidida',
    linha: 'receita',
    oQueE: 'Grão indo de uma filial para outra da mesma empresa (CFOP 5152/6152).',
    valendoHoje: 'Fora da receita.',
    seMudar: 'Contar como venda duplicaria o faturamento do mesmo grão.',
    quemDecide: 'Fechado.',
  },
  nf_cancelada: {
    titulo: 'Notas canceladas',
    situacao: 'decidida',
    linha: 'receita',
    oQueE: 'Notas canceladas na SEFAZ.',
    valendoHoje: 'Fora de tudo.',
    seMudar: '—',
    quemDecide: 'Fechado.',
  },
  nf_nao_autorizada: {
    titulo: 'Notas não autorizadas pela SEFAZ',
    situacao: 'decidida',
    linha: 'receita',
    oQueE: 'Notas em digitação ou inutilizadas — nunca viraram documento fiscal válido.',
    valendoHoje: 'Fora da receita.',
    seMudar: 'Contá-las já criou R$ 1,5M de receita fantasma uma vez.',
    quemDecide: 'Fechado.',
  },
  nf_outra_operacao: {
    titulo: 'Operações sem classificação fiscal conhecida',
    situacao: 'aberta',
    linha: 'receita',
    oQueE:
      'CFOPs que não estão em nenhuma das tabelas — brindes, amostras, ajustes de estoque. Ficam de fora COM registro, nunca viram receita por omissão.',
    valendoHoje: 'Fora do DRE, e listados aqui para conferência.',
    seMudar:
      'Se algum destes for operação de verdade, entra na linha que o contador indicar.',
    quemDecide: 'Contador.',
  },
  nf_ajuste_fiscal: {
    titulo: 'Itens de ajuste fiscal dentro da nota',
    situacao: 'decidida',
    linha: 'receita',
    oQueE: 'Linhas de ICMS e afins que aparecem como item da nota mas não são mercadoria.',
    valendoHoje: 'Fora da receita.',
    seMudar: '—',
    quemDecide: 'Fechado.',
  },
  receita_vem_da_nf: {
    titulo: 'Títulos a receber de grão',
    situacao: 'decidida',
    linha: 'receita',
    oQueE:
      'O fato gerador da receita é a nota fiscal de saída. O título a receber é o mesmo dinheiro visto pelo financeiro.',
    valendoHoje: 'Ignorados — contar os dois dobraria a receita.',
    seMudar: '—',
    quemDecide: 'Fechado.',
  },
  custo_vem_da_nf: {
    titulo: 'Títulos a pagar de compra e frete',
    situacao: 'decidida',
    linha: 'custo',
    oQueE:
      'Simétrico à receita: o custo nasce da nota de ENTRADA, e o título a pagar é a mesma compra vista pelo financeiro.',
    valendoHoje: 'Ignorados — contar os dois dobraria o CPV.',
    seMudar:
      'Se um mês vier sem nota de entrada, este balde fica cheio e o CPV vai a zero. É o alarme: valor alto aqui com CPV baixo significa carga incompleta.',
    quemDecide: 'Fechado, mas vale conferir o alarme a cada carga.',
  },
  transferencia_entre_contas: {
    titulo: 'Transferência entre contas bancárias próprias',
    situacao: 'decidida',
    linha: 'estrutura',
    oQueE:
      'Dinheiro andando entre contas da empresa (Bradesco ↔ Sicoob). Não é receita nem despesa — só muda de lugar.',
    valendoHoje:
      'Fora do DRE, identificadas pela descrição. O centro de custo não serve aqui: em agosto R$ 2,13M vinham carimbados como "GRATIFICAÇÕES" e entravam como salários.',
    seMudar: '—',
    quemDecide: 'Fechado. Vale avisar quem opera o Enoki que o centro de custo está errado no cadastro.',
  },
  patrimonial_ou_intragrupo: {
    titulo: 'Adiantamentos e rateio entre empresas',
    situacao: 'decidida',
    linha: 'estrutura',
    oQueE: 'Adiantamento a cliente/fornecedor e rateio de despesa entre as empresas do grupo.',
    valendoHoje: 'Fora do DRE — são contas patrimoniais, não resultado.',
    seMudar: '—',
    quemDecide: 'Fechado.',
  },
  data_invalida: {
    titulo: 'Registros sem data utilizável',
    situacao: 'aberta',
    linha: 'estrutura',
    oQueE: 'Sem data não há competência, e sem competência não há em que mês lançar.',
    valendoHoje: 'Fora do DRE.',
    seMudar: 'Valor relevante aqui indica problema de cadastro no ERP.',
    quemDecide: 'Quem opera o Enoki.',
  },
  valor_zero: {
    titulo: 'Registros de valor zero',
    situacao: 'decidida',
    linha: 'estrutura',
    oQueE: 'Documentos de valor nulo — ajustes de estoque, em geral.',
    valendoHoje: 'Fora do DRE.',
    seMudar: '—',
    quemDecide: 'Fechado.',
  },
}

/**
 * Decisões que NÃO saem de nenhum descarte — dependem de uma resposta humana.
 * Ficam aqui, e não num documento à parte, porque quem lê o DRE é quem precisa
 * saber que elas estão em aberto.
 */
const DECISOES_ABERTAS: Divergencia[] = [
  {
    id: 'folha-ausente',
    titulo: 'Folha de pagamento não aparece no ERP',
    valor: 0,
    quantidade: 0,
    situacao: 'aberta',
    linha: 'despesas',
    oQueE:
      'Nenhum título de salário, encargo ou pró-labore foi encontrado na carga. Uma operação deste porte não roda sem folha.',
    valendoHoje:
      'O DRE do ERP sai sem folha. Em julho a planilha do cliente traz R$ 0,19M de despesa administrativa (salários R$ 78k, pró-labore R$ 27k, mais estrutura) que o ERP não entrega. Precisa vir da planilha ou de lançamento manual.',
    seMudar:
      'Se a folha passar pelo financeiro do Enoki sob outro nome, ela entra automática e o resultado cai pelo valor dela.',
    quemDecide: 'Juliano / Daiane.',
  },
  {
    id: 'cfop-exportacao',
    titulo: 'Remessa com fim específico de exportação tratada como venda',
    valor: 0,
    quantidade: 0,
    situacao: 'aberta',
    linha: 'receita',
    oQueE:
      'Os CFOPs 5501/5502/6501/6502 são formalmente remessa, mas neste negócio é assim que a venda ao exportador é documentada.',
    valendoHoje:
      'Contados como venda. Os títulos a receber confirmam: batem com os recebíveis de grão.',
    seMudar: 'Se forem remessa mesmo, a receita cai e o resultado do período muda de sinal.',
    quemDecide: 'Contador.',
  },
  {
    id: 'devolucoes-quais-deduzem',
    titulo: 'Quais devoluções reduzem a receita',
    valor: 0,
    quantidade: 0,
    situacao: 'aberta',
    linha: 'deducoes',
    oQueE:
      'Julho teve R$ 1,80M em notas de devolução e retorno: devolução de venda (CFOP 1202/2202) e retorno de lote de exportação (1503/2504). Nós deduzimos todas.',
    valendoHoje:
      'Todas reduzem a receita. Com isso nossa receita LÍQUIDA fica ~R$ 0,89M abaixo da planilha, que parece deduzir só parte.',
    seMudar:
      'Se o retorno de lote de exportação não for dedução, a receita líquida sobe e o EBITDA sobe junto. É a diferença entre estarmos conservadores demais ou na medida.',
    quemDecide: 'Contador.',
  },
  {
    id: 'cfop-1907',
    titulo: 'Retorno de armazém geral (CFOP 1907) contado como compra',
    valor: 0,
    quantidade: 0,
    situacao: 'aberta',
    linha: 'custo',
    oQueE:
      'R$ 0,59M em julho. Formalmente é retorno de grão que já era nosso, não aquisição — mas a planilha do cliente soma esse valor dentro de COMPRA DE CEREAIS.',
    valendoHoje:
      'Fora do CPV, tratado como remessa. É o que a natureza fiscal do CFOP indica.',
    seMudar: 'Contado como compra, o CPV sobe R$ 0,59M e o EBITDA cai na mesma medida.',
    quemDecide: 'Contador — é divergência direta com a planilha.',
  },
  {
    id: 'gap-contratos',
    titulo: 'Diferença de ~9% entre a nota e o título do mesmo contrato',
    valor: 0,
    quantidade: 0,
    situacao: 'aberta',
    linha: 'deducoes',
    oQueE:
      'A nota fiscal de venda sai por um valor e o título a receber do mesmo contrato por outro, sistematicamente menor. A razão mediana é 0,96 — assinatura de desconto de classificação (umidade, impureza).',
    valendoHoje:
      'Nada reclassificado: a receita é a da nota. A diferença fica visível aqui em vez de escondida.',
    seMudar:
      'Se for desconto de classificação, vira dedução da receita — e o semestre pode fechar negativo. É a decisão de maior impacto em aberto.',
    quemDecide: 'Contador.',
  },
]

/** Descartes que não valem espaço na tela: sem valor e sem quantidade. */
function relevante(d: { quantidade: number; valor: number }): boolean {
  return d.quantidade > 0 || Math.abs(d.valor) >= 0.005
}

/**
 * Divergências da carga, da mais cara para a mais barata, com as decisões em
 * aberto sempre à frente das já fechadas — é nelas que alguém precisa mexer.
 */
export function divergenciasDaCarga(sync: EnokiSyncMeta | undefined): Divergencia[] {
  const medidas: Divergencia[] = (sync?.descartes ?? [])
    .filter(relevante)
    .map((d) => {
      const base = EXPLICACAO[d.motivo]
      return base
        ? { id: d.motivo, valor: d.valor, quantidade: d.quantidade, ...base }
        : {
            id: d.motivo,
            titulo: d.motivo,
            valor: d.valor,
            quantidade: d.quantidade,
            situacao: 'aberta' as const,
            linha: 'estrutura' as const,
            oQueE: 'Motivo de descarte sem explicação cadastrada.',
            valendoHoje: 'Fora do DRE.',
            seMudar: 'Precisa ser documentado antes da próxima carga.',
            quemDecide: 'Nós.',
          }
    })

  const gap = sync?.gapContratos
  const comGap = DECISOES_ABERTAS.map((d) =>
    d.id === 'gap-contratos' && gap
      ? { ...d, valor: Math.abs(gap.gapTotal), quantidade: gap.contratos }
      : d,
  )

  return [...medidas, ...comGap].sort((a, b) => {
    if (a.situacao !== b.situacao) return a.situacao === 'aberta' ? -1 : 1
    return Math.abs(b.valor) - Math.abs(a.valor)
  })
}

/** Soma do que está em aberto — o tamanho da dúvida, em reais. */
export function totalEmAberto(divs: Divergencia[]): number {
  return divs.filter((d) => d.situacao === 'aberta').reduce((s, d) => s + Math.abs(d.valor), 0)
}
