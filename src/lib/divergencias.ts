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
    situacao: 'decidida',
    linha: 'custo',
    oQueE:
      'Compras e fretes contratados de outra empresa do Grupo Parceiro. Num DRE consolidado do grupo elas se anulam: o custo de uma é a receita da outra.',
    valendoHoje:
      'CONTADAS. Este é o DRE de uma filial, e para ela a nota da irmã é custo de verdade — é assim que o financeiro fecha o mês.',
    seMudar:
      'Quando as cinco empresas estiverem carregadas, a convenção passa a "consolidado" e elas se anulam. Eliminar agora, com uma empresa só, tiraria o custo daqui sem registrar a receita lá.',
    quemDecide: 'Nosso — muda sozinho quando as 5 empresas entrarem.',
  },
  retorno_lote_exportacao: {
    titulo: 'Retorno de lote de exportação',
    situacao: 'decidida',
    linha: 'deducoes',
    oQueE:
      'Grão que voltou do porto porque a exportação não se concretizou (CFOP 1503/2504).',
    valendoHoje:
      'NÃO abate a receita — tratado como movimentação, que é o critério do fechamento do cliente.',
    seMudar:
      'Se a saída para o porto foi contada como venda, o retorno teria de desfazê-la e a receita cairia.',
    quemDecide: 'Contador, se quiser rever o critério.',
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
    id: 'devolucao-interestadual',
    titulo: 'Devolução de venda interestadual (CFOP 2202) — R$ 240 mil',
    valor: 240_168.91,
    quantidade: 10,
    situacao: 'aberta',
    linha: 'deducoes',
    oQueE:
      'Devolução de venda vinda de outro estado. É a mesma operação da CFOP 1202, que o fechamento do cliente deduz normalmente — só muda o estado de origem.',
    valendoHoje:
      'Deduzimos. O fechamento do cliente NÃO deduz, e é a única diferença que sobra na receita líquida de julho.',
    seMudar:
      'Copiar o critério do cliente faria a receita líquida bater exato, mas deixaria o DRE R$ 240 mil otimista. Parece omissão do filtro manual dele, não regra — e copiar um erro para bater não é conferir.',
    quemDecide: 'Contador. É a pergunta mais objetiva da lista.',
  },
  {
    id: 'cfop-1907',
    titulo: 'Retorno de armazém geral (CFOP 1907) conta como entrada de estoque',
    valor: 0,
    quantidade: 0,
    situacao: 'decidida',
    linha: 'custo',
    oQueE:
      'Grão que volta do armazém geral. Formalmente é retorno de mercadoria que já era nossa, não aquisição nova — e por isso ficava de fora do estoque.',
    valendoHoje:
      'CONTA como entrada. O volume provou: em 20 meses a soja comprou 2.203.640 sacas e vendeu 2.348.549 — um furo de 144.909 que nunca fechava e derrubava o custo médio. Somando o retorno, a compra vai a 2.343.689 e o saldo fecha em -4.860 sacas, 0,2%. A simetria explica: a remessa PARA o armazém também não é contada como saída.',
    seMudar:
      'Voltar a excluí-lo quebra a média móvel: o estoque fica negativo já no segundo mês e o CPV vira qualquer número. Em valor o 1907 é só 0,9% a 3,8% das entradas, então não há risco de dobrar custo. A planilha do cliente também o soma dentro de COMPRA DE CEREAIS.',
    quemDecide: 'Fechado — pela conferência de volume.',
  },
  {
    id: 'corte-competencia',
    titulo: 'A mesma nota cai em meses diferentes aqui e na planilha',
    valor: 0,
    quantidade: 0,
    situacao: 'aberta',
    linha: 'receita',
    oQueE:
      'Em 8 meses de 2026 (empresa 1), nossa receita soma R$ 220,72 milhões contra R$ 218,51 da planilha — 1,0%. A compra de grão, R$ 192,46 contra R$ 196,53 milhões — 2,1%. Os totais batem. Mas mês a mês a diferença vai de -27% (janeiro) a +10% (junho).',
    valendoHoje:
      'Usamos a DATA DE EMISSÃO da nota, que é o fato gerador. A planilha nasce do controle de carregamento, que lança a compra no mês da venda do mesmo lote — por isso a razão custo/receita dela fica presa em 87%-91% todo mês.',
    seMudar:
      'Adotar o corte do carregamento faria cada mês bater com a planilha, mas exige o vínculo lote-a-lote, que não está na API. Manter a emissão é o critério contábil e já fecha no acumulado.',
    quemDecide: 'Contador — e é a maior divergência que sobrou.',
  },
  {
    id: 'apropriacao-estoque',
    titulo: 'A planilha do cliente não apropria estoque; o DRE aqui apropria',
    valor: 0,
    quantidade: 0,
    situacao: 'aberta',
    linha: 'custo',
    oQueE:
      'A linha COMPRA da planilha é a nota de entrada do mês (CFOP 1102) e nada mais: o grão comprado e não vendido vira custo na hora. Aqui ele fica no estoque e só vira custo quando sai, pela média ponderada móvel.',
    valendoHoje:
      'APROPRIAMOS. O ajuste entra como lançamento na conta de aquisição do próprio grão (4.1.01 soja, 4.1.02 milho, 4.1.03 sorgo), negativo quando o mês forma estoque. Agosto/2026 fecha com 4,68% de margem bruta.',
    seMudar:
      'Sem apropriação, um mês que estoca aparece no vermelho e o seguinte, com lucro que não é dele: agosto/2026 sairia com -6,87% em vez de 4,68%. Com ela, o mês reflete o que de fato foi vendido. Desligá-la faz o número ficar igual ao da planilha, ao custo de o mês voltar a oscilar.',
    quemDecide: 'Diretoria + contador. É a escolha de MÉTODO, não de dado.',
  },
  {
    id: 'estoque-abertura',
    titulo: 'Estoque de abertura é um piso calculado, não um inventário',
    valor: 0,
    quantidade: 0,
    situacao: 'aberta',
    linha: 'custo',
    oQueE:
      'A API só devolve nota a partir de janeiro/2025, mas a empresa não começou ali: a soja vendida naquele mês veio da safra de 2024. Sem esse saldo a média móvel divide por um estoque que não existe.',
    valendoHoje:
      'Usamos o PISO que as próprias notas denunciam — 38.706 sacas de soja e 2.866 de café no consolidado, o mínimo sem o qual a empresa teria vendido grão que nunca comprou. Precificado pela primeira compra observada de cada grão.',
    seMudar:
      'Com o inventário real do armazém em 31/12/2024 o custo médio de toda a cadeia se ajusta. O piso subestima o estoque, então tende a subestimar o CPV dos primeiros meses.',
    quemDecide: 'Armazém / Daiane — é pedir uma posição de estoque, não uma decisão.',
  },
  {
    id: 'conta-4119-inventada',
    titulo: 'A conta "Variação de estoque" que criamos foi REMOVIDA',
    valor: 0,
    quantidade: 0,
    situacao: 'decidida',
    linha: 'custo',
    oQueE:
      'O plano de contas do Grupo Parceiro vai de 4.1.01 a 4.1.17 e não tem conta de variação de estoque. Tínhamos criado a 4.1.19 ("Variação de estoque — apropriação") por conta própria.',
    valendoHoje:
      'REMOVIDA, por determinação da diretoria. A apropriação passou a entrar na conta de aquisição do próprio grão — 4.1.01 soja, 4.1.02 milho, 4.1.03 sorgo, 4.1.05 café — que é onde a compra daquele grão já está lançada. O resultado é idêntico ao centavo; o que muda é que a conta de aquisição passa a mostrar o custo do que foi VENDIDO em vez do que foi COMPRADO, que é o que ela deveria significar.',
    seMudar:
      'O custo disso é real: no DRE sintético some a linha que deixava a apropriação visível de longe. Ela continua no analítico da conta, com o histórico dizendo o que é, e conferível contra o armazém — só não salta mais aos olhos. Permanece de pé a 4.1.18 ("Aquisição de grãos não detalhado"), também criada por nós, hoje com saldo ZERO em todos os 20 meses: existe só como rede de segurança para nota de compra sem itens.',
    quemDecide: 'Fechado — decisão da diretoria.',
  },
  {
    id: 'escopo-empresas',
    titulo: 'A operação de café (matriz) ficou fora do DRE',
    valor: 0,
    quantidade: 0,
    situacao: 'decidida',
    linha: 'estrutura',
    oQueE:
      'Os três estabelecimentos dividem a razão social PARCEIRO DO GRAO COMERCIO IMP. E EXP. DE CAFE E CEREAIS LTDA, raiz 30798330, mas com CNPJ próprio: filial MG 0002-16, MATRIZ 0001-35, filial SP 0004-88. A matriz é a operação de café — em 20 meses movimentou R$ 394,7 milhões em itens, dos quais R$ 383,4 milhões são café: 97,1%. As filiais têm ZERO café em grãos.',
    valendoHoje:
      'FORA. São dois negócios com CNPJ distinto, e somá-los produzia uma entidade que não existe. O estrago era concreto: o café da matriz entrava na cadeia de estoque das filiais, ficava negativo já em janeiro/2025 e derrubava o custo médio (chegou a -R$ 13.759/saca). Sem ele, o estoque de abertura que precisamos supor cai de 38.706 sacas de soja mais 2.866 de café para 1.506 sacas de soja.',
    seMudar:
      'Se a diretoria quiser o consolidado das três, o café volta — mas precisa da própria cadeia de estoque, separada, porque a unidade dele não é a dos cereais.',
    quemDecide: 'Fechado — apontado pela diretoria, confirmado pelo CNPJ.',
  },
  {
    id: 'escopo-filial-sp',
    titulo: 'A planilha é só a filial MG; a tela mostra MG + SP',
    valor: 0,
    quantidade: 0,
    situacao: 'aberta',
    linha: 'estrutura',
    oQueE:
      'A planilha se chama "DRE ACUMULADO _CEREAIS" e cobre a filial MG sozinha. A filial SP movimentou R$ 76,2 milhões em 20 meses, tudo cereal, e está somada nesta tela.',
    valendoHoje:
      'MG + SP. É o DRE do negócio de cereais inteiro, que é o que a tela se propõe a mostrar.',
    seMudar:
      'Se a comparação oficial for contra a planilha, a filial SP sai também e os dois números passam a ser diretamente confrontáveis. Se o oficial for o negócio de cereais, é a planilha que está incompleta.',
    quemDecide: 'Diretoria — define qual é o DRE oficial.',
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
