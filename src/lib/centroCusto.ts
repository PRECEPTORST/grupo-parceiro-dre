// Mapa DETERMINÍSTICO centro de custo (Enoki) → conta do plano. Zero IA.
//
// O ERP Enoki carimba em cada título um `centroCusto` SEMÂNTICO ("COMPRA MILHO",
// "RECEITA SOJA - MERCADO INTERNO", "SECAGEM SORGO", "SEM CC"). Este arquivo
// traduz esse rótulo para a conta canônica do plano (`planoContas.ts`), que é o
// que o motor do DRE entende. É o item 1.2 do ROADMAP.md.
//
// DIREÇÃO IMPORTA. Um mesmo centro de custo significa coisas diferentes conforme
// o dinheiro entra ou sai:
//   • "ARMAZENAGEM SOJA" pago  = custo de armazém de terceiros (4.1.11);
//     "ARMAZENAGEM SOJA" recebido = receita de armazenagem própria (3.1.09).
//   • "COMPRA SOJA" pago = CPV (4.1.01); "COMPRA SOJA" recebido = ESTORNO da
//     compra, então cai na MESMA conta com sinal negativo.
// Por isso cada regra declara a conta por direção + a direção NATURAL: fluxo na
// contramão sem conta própria vira estorno (sinal −1) na conta natural.
//
// GRÃO é caso especial NOS DOIS SENTIDOS: o fato gerador é a NOTA FISCAL (ver
// `enokiDre.ts`) — a de saída para a receita, a de entrada para o custo. O
// título financeiro correspondente é IGNORADO nos dois casos; contar os dois
// seria dupla contagem. Só a direção contrária vira lançamento: pagamento num
// centro de receita é devolução de venda; recebimento num centro de compra é
// estorno de compra.

/** Conta sentinela: a receita já vem da NfSaida; ignorar o título financeiro. */
export const VEM_DA_NF = 'NF' as const

export type DirecaoFluxo = 'entrada' | 'saida'

export interface RegraCentroCusto {
  /** Conta quando o dinheiro ENTRA (recebimento). `VEM_DA_NF` = ignorar o título. */
  entrada?: string | typeof VEM_DA_NF
  /** Conta quando o dinheiro SAI (pagamento). `VEM_DA_NF` = ignorar o título. */
  saida?: string | typeof VEM_DA_NF
  /**
   * Conta do ESTORNO quando o fluxo vai na contramão do natural.
   *
   * Existe porque a conta natural pode ser `VEM_DA_NF`: numa compra de grão o
   * pagamento é ignorado (o custo vem da nota de entrada), mas o RECEBIMENTO
   * não tem nota que o gere — é devolução de dinheiro e reduz o CPV. Sem este
   * campo o estorno cairia no vazio e a redução sumiria.
   */
  estorno?: string
  /** Direção esperada do centro de custo. O fluxo contrário sem conta própria é estorno. */
  natural: DirecaoFluxo
  /** true = fora do DRE (conta patrimonial ou eliminação intragrupo). */
  ignorar?: boolean
  /** Anotação de auditoria quando a classificação é discutível (§16 do context.md). */
  confirmar?: string
}

/** Resultado da tradução: onde lançar e com que sinal. */
export interface DestinoLancamento {
  conta: string
  /** +1 lançamento normal; −1 estorno (reduz a conta). */
  sinal: 1 | -1
  /** true quando o título deve ser descartado (patrimonial, intragrupo ou já na NF). */
  ignorar: boolean
  motivo?: string
}

/** Maiúsculas sem acento — os centros de custo do ERP são inconsistentes. */
export function normalizarRotulo(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Regras por centro de custo, com a chave já normalizada (sem acento, maiúscula).
 * Cobre 100% dos 43 centros de custo observados na extração de 2026-08-21
 * (jan–jul, 5 empresas) — ver §27 do context.md.
 */
export const REGRAS_CENTRO_CUSTO: Record<string, RegraCentroCusto> = {
  // ---- Receita de grão: o fato gerador é a NF; pagamento aqui = devolução ----
  'RECEITA SOJA - MERCADO INTERNO': { entrada: VEM_DA_NF, saida: '3.2.06', natural: 'entrada' },
  'RECEITA MILHO - MERCADO INTERNO': { entrada: VEM_DA_NF, saida: '3.2.06', natural: 'entrada' },
  'RECEITA SORGO - MERCADO INTERNO': { entrada: VEM_DA_NF, saida: '3.2.06', natural: 'entrada' },
  'RECEITA CAFE - MERCADO INTERNO': { entrada: VEM_DA_NF, saida: '3.2.06', natural: 'entrada' },
  'DEVOLUCAO SOJA - MERCADO INTERNO': { saida: '3.2.06', natural: 'saida' },
  'DEVOLUCAO MILHO - MERCADO INTERNO': { saida: '3.2.06', natural: 'saida' },
  'DEVOLUCAO SORGO - MERCADO INTERNO': { saida: '3.2.06', natural: 'saida' },
  'DEVOLUCAO CAFE - MERCADO INTERNO': { saida: '3.2.06', natural: 'saida' },

  // ---- Outras receitas ----
  'RECEITA SERVICOS DE CORRETAGEM - MERCADO INTERNO': { entrada: '3.1.13', natural: 'entrada' },
  'OUTRAS RECEITAS': { entrada: '3.4.04', natural: 'entrada' },

  // ---- CPV: aquisição de grão ----
  // O fato gerador do CUSTO é a NOTA DE ENTRADA, exatamente como o da receita é
  // a nota de saída. Contar também o título seria contar a mesma compra duas
  // vezes — e era: em julho as notas davam R$ 20,1M e os títulos mais R$ 3,8M
  // da MESMA mercadoria. O título pago sai; só a direção contrária (recebimento
  // num centro de compra = estorno) vira lançamento.
  'COMPRA SOJA': { saida: VEM_DA_NF, estorno: '4.1.01', natural: 'saida' },
  'COMPRA MILHO': { saida: VEM_DA_NF, estorno: '4.1.02', natural: 'saida' },
  'COMPRA SORGO': { saida: VEM_DA_NF, estorno: '4.1.03', natural: 'saida' },
  'COMPRA CAFE': { saida: VEM_DA_NF, estorno: '4.1.05', natural: 'saida' },

  // ---- CPV: custos compartilhados (frete, armazém, beneficiamento) ----
  // Frete sobre COMPRA vem do CT-e (nota de entrada), como todo custo. O título
  // é o pagamento do mesmo frete — mesmos transportadores, os dois lados
  // conferidos. Frete sobre VENDA continua vindo do título: o CT-e de saída não
  // distingue as duas pontas com segurança.
  FRETE: { saida: VEM_DA_NF, estorno: '4.1.10', entrada: '3.1.12', natural: 'saida' },
  // Produção usa rótulos mais específicos que a homologação — descobertos ao
  // ler o ERP real em 2026-08-26. "FRETE SOBRE COMPRA" sozinho eram 155 títulos
  // num único mês; sem esta linha, todos viravam resíduo.
  'FRETE SOBRE COMPRA': { saida: VEM_DA_NF, estorno: '4.1.10', natural: 'saida' },
  'FRETE SOBRE VENDA': { saida: '4.2.03', natural: 'saida' },
  'ARMAZENAGEM SOJA': { saida: '4.1.11', entrada: '3.1.09', natural: 'saida' },
  'ARMAZENAGEM MILHO': { saida: '4.1.11', entrada: '3.1.09', natural: 'saida' },
  'ARMAZENAGEM SORGO': { saida: '4.1.11', entrada: '3.1.09', natural: 'saida' },
  'ARMAZENAGEM CAFE': { saida: '4.1.11', entrada: '3.1.09', natural: 'saida' },

  // ---- Deduções / tributos sobre a operação ----
  // ⚠ "ICMS CRÉDITO PRESUMIDO" NÃO É IMPOSTO AQUI — é compra de grão com o
  // centro de custo errado no ERP, e eu o deduzia da receita como se fosse ICMS
  // sobre vendas. Dois erros num só: crédito presumido é BENEFÍCIO fiscal,
  // nunca dedução de receita; e estes títulos são faturamento de nota de
  // ENTRADA, cujo custo já vem da nota.
  //
  // A prova: 18 dos 19 títulos assim rotulados em 20 meses casam, pelo
  // idContrato, com uma nota CFOP 1102 de valor a menos de 2% de distância. Em
  // agosto/2026 o contrato 169/26M tem três títulos — dois "COMPRA DE MILHO" e
  // um "ICMS CRÉDITO PRESUMIDO" — contra exatamente três notas de compra, uma
  // para cada. São R$ 985.625,60 em 20 meses saindo indevidamente da receita.
  //
  // Sem `estorno`: um fluxo na contramão aqui vira resíduo, e é o que se quer —
  // não sabemos a que grão pertence, e adivinhar seria repetir o erro.
  'ICMS CREDITO PRESUMIDO': { saida: VEM_DA_NF, natural: 'saida' },
  'ICMS - SOBRE COMPRAS': { saida: '4.1.18', natural: 'saida' },

  // ---- Despesas comerciais ----
  'MARKETING / PROPAGANDA': { saida: '4.2.04', natural: 'saida' },
  BRINDES: { saida: '4.2.04', natural: 'saida' },
  'FEIRAS & EVENTOS': { saida: '4.2.05', natural: 'saida' },

  // ---- Despesas administrativas ----
  FERIAS: { saida: '4.3.01', natural: 'saida' },
  'BRINDES PARA COLABORADORES': { saida: '4.3.04', natural: 'saida' },
  'REFEICOES E LANCHES': { saida: '4.3.04', natural: 'saida' },
  UNIFORMES: { saida: '4.3.04', natural: 'saida' },
  AGUA: { saida: '4.3.09', natural: 'saida' },
  'MANUTENCAO SOFTWARE & SISTEMA': { saida: '4.3.11', natural: 'saida' },
  'SOFTWARE & SISTEMA': { saida: '4.3.11', natural: 'saida' },
  'MATERIAL DE ESCRITORIO': { saida: '4.3.12', natural: 'saida' },
  'MATERIAIS DE LIMPEZA': { saida: '4.3.12', natural: 'saida' },
  'MANUTENCAO DE VEICULOS': { saida: '4.3.14', natural: 'saida' },
  'COMBUSTIVEIS E LUBRIFICANTES': { saida: '4.3.14', natural: 'saida' },
  'OUTRAS DESPESAS': { saida: '4.3.20', natural: 'saida' },

  SEGUROS: { saida: '4.3.15', natural: 'saida' },
  'SEGURO DE VEICULOS': { saida: '4.3.15', natural: 'saida' },

  // ---- Centros vistos só no ERP de PRODUÇÃO, a partir de agosto/2026 ----
  // A folha EXISTE — ela só não usava estes rótulos em homologação, e por isso
  // eu disse ao cliente que o ERP não tinha folha. Tinha: "PESSOAL" são 54
  // títulos, e ainda SENAR, CSRF, vale-alimentação e ajuda de custo.
  PESSOAL: { saida: '4.3.01', natural: 'saida' },
  'AJUDA DE CUSTO': { saida: '4.3.01', natural: 'saida' },
  SENAR: { saida: '4.3.02', natural: 'saida' },
  'CSRF - CONTRIBUICAO SOCIAIS RETIDA NA FONTE': { saida: '4.3.02', natural: 'saida' },
  'VALE ALIMENTACAO': { saida: '4.3.04', natural: 'saida' },
  'COPA E COZINHA': { saida: '4.3.04', natural: 'saida' },
  'UNIFORMES E EPI': { saida: '4.3.04', natural: 'saida' },
  CONTABILIDADE: { saida: '4.3.05', natural: 'saida' },
  JURIDICO: { saida: '4.3.06', natural: 'saida' },
  'ASSESSORIA/CONSULTORIA': { saida: '4.3.06', natural: 'saida' },
  'TELEFONE & CELULARES': { saida: '4.3.10', natural: 'saida' },
  'TI - TECNOLOGIA DA INFORMACAO': { saida: '4.3.11', natural: 'saida' },
  HOSPEDAGEM: { saida: '4.3.16', natural: 'saida' },
  'CURSOS & TREINAMENTOS': { saida: '4.3.18', natural: 'saida' },
  'TAXAS BANCARIAS': { saida: '4.4.03', natural: 'saida' },
  IOF: { saida: '4.4.04', natural: 'saida' },
  // Classificação de grão é CPV, não despesa: mede umidade e impureza do lote.
  'CLASSIFICACAO MILHO': { saida: '4.1.13', natural: 'saida' },
  'CLASSIFICACAO SOJA': { saida: '4.1.13', natural: 'saida' },
  'CLASSIFICACAO SORGO': { saida: '4.1.13', natural: 'saida' },
  'CLASSIFICACAO CAFE': { saida: '4.1.13', natural: 'saida' },
  'ICMS - DIFAL': { saida: '3.2.01', natural: 'saida' },
  'PARCELAMENTO ICMS': { saida: '3.2.01', natural: 'saida' },
  'RECEITA SOJA - EXPORTACAO': { entrada: VEM_DA_NF, saida: '3.2.06', natural: 'entrada' },
  'RECEITA MILHO - EXPORTACAO': { entrada: VEM_DA_NF, saida: '3.2.06', natural: 'entrada' },
  'RECEITA SORGO - EXPORTACAO': { entrada: VEM_DA_NF, saida: '3.2.06', natural: 'entrada' },
  'RECEITA CAFE - EXPORTACAO': { entrada: VEM_DA_NF, saida: '3.2.06', natural: 'entrada' },
  'EMPRESTIMO ENTRE GRUPO': { natural: 'saida', ignorar: true },
  'COMISSAO ORIGINADORES GRUPO': {
    saida: '4.2.01',
    natural: 'saida',
    confirmar:
      'Comissão dos originadores tratada como despesa comercial. Se "GRUPO" significar outra empresa do grupo, vira eliminação intragrupo.',
  },
  GRATIFICACOES: { saida: '4.3.01', natural: 'saida' },
  FUNRURAL: { saida: '3.2.04', natural: 'saida' },
  'COMISSAO TERCEIROS': { saida: '4.2.01', natural: 'saida' },
  // Recuperação de inadimplência é RECEITA (a perda já foi lançada antes).
  'RECUPERACAO DE PREJUIZO - INADIMPLENCIA': { entrada: '3.4.04', natural: 'entrada' },

  // ---- Financeiras ----
  'JUROS SOBRE EMPRESTIMOS': { saida: '4.4.01', entrada: '3.5.02', natural: 'saida' },
  'JUROS SOBRE ANTECIPACAO DE RECEBIVEIS': { saida: '4.4.05', entrada: '3.5.02', natural: 'saida' },
  'EMPRESTIMO DE TERCEIROS': { saida: '4.4.01', entrada: '3.5.02', natural: 'saida' },

  // ---- Investimentos (capex — abaixo do resultado, §19) ----
  IMOBILIZADO: { saida: '5.1.01', natural: 'saida' },
  'CONSORCIOS CONTEMPLADO': { saida: '5.1.03', natural: 'saida' },
  'OBRA - SEDE DO GRUPO': { saida: '5.1.04', natural: 'saida' },
  MOVEIS: {
    saida: '5.1.05',
    natural: 'saida',
    confirmar: 'Móveis/utensílios tratados como capex (§19). Se forem consumo, reclassificar em 4.3.12.',
  },

  // ---- Fora do DRE: contas patrimoniais e eliminação intragrupo ----
  'ADIANTAMENTO DE CLIENTE': { natural: 'entrada', ignorar: true },
  'ADIANTAMENTO FORNECEDOR': { natural: 'saida', ignorar: true },
  'RATEIO ENTRE AS EMPRESAS DO GRUPO': { natural: 'saida', ignorar: true },
}

/**
 * Regra por FAMÍLIA, para quando o rótulo exato não está na tabela.
 *
 * O ERP renomeia centro de custo sem avisar, e isso já quebrou o mapa três
 * vezes: "FRETE" virou "FRETE SOBRE COMPRA", depois "FRETE (CMV)" e
 * "FRETE (USO & CONSUMO)"; "RECEITA MILHO - MERCADO INTERNO" virou também
 * "RECEITA MILHO". Em agosto/2026 isso jogou R$ 9,07 MILHÕES na fila de
 * resíduo — e a fila é para o que ninguém sabe classificar, não para o que
 * mudou de nome.
 *
 * A família é lida pelo PREFIXO, que é o que carrega a natureza da operação. O
 * sufixo ("- MERCADO INTERNO", "(CMV)", "SOBRE COMPRA") é qualificador, e um
 * qualificador desconhecido não deve custar a classificação inteira.
 *
 * ⚠ O PREFIXO TAMBÉM VARIA, e isso me pegou duas vezes no mesmo mês. Em
 * agosto/2026 o ERP usa "COMPRA DE MILHO" (a regra dizia "COMPRA MILHO") e
 * "FRETES - CMV" (a regra dizia /^FRETE\b/, e o plural quebra a fronteira de
 * palavra). Resultado: R$ 17,0 milhões de compra de grão e R$ 1,02 milhão de
 * frete na fila de resíduo. Não moveu o DRE — resíduo não entra —, mas apagou o
 * sinal: quem olhasse a fila veria R$ 19,5 milhões "não classificados" e poderia
 * "consertar" classificando, o que dobraria o custo, já que ele vem da nota.
 *
 * Por isso os prefixos aceitam as variações que o ERP de fato escreve: o "DE"
 * opcional e o plural. Preferir a regra tolerante à regra bonita.
 *
 * A tabela exata continua VENCENDO: só o que não está nela chega aqui.
 */
const FAMILIAS: { prefixo: RegExp; regra: RegraCentroCusto }[] = [
  // Receita de grão: o fato gerador é a nota de saída, em qualquer variação.
  { prefixo: /^RECEITAS? (DE |DA )?(SOJA|MILHO|SORGO|CAFE)\b/, regra: { entrada: VEM_DA_NF, saida: '3.2.06', natural: 'entrada' } },
  { prefixo: /^DEVOLUCOES? (DE |DA )?(SOJA|MILHO|SORGO|CAFE)\b/, regra: { saida: '3.2.06', natural: 'saida' } },
  // Compra e frete de compra: o custo vem da nota de entrada / do CT-e.
  { prefixo: /^COMPRAS? (DE |DA )?(SOJA|MILHO|SORGO|CAFE)\b/, regra: { saida: VEM_DA_NF, estorno: '4.1.01', natural: 'saida' } },
  { prefixo: /^FRETES?\b/, regra: { saida: VEM_DA_NF, estorno: '4.1.10', natural: 'saida' } },
  { prefixo: /^ARMAZENAGENS?\b/, regra: { saida: '4.1.11', entrada: '3.1.09', natural: 'saida' } },
  { prefixo: /^CLASSIFICAC(AO|OES)?\b/, regra: { saida: '4.1.13', natural: 'saida' } },
  { prefixo: /^SECAGEM\b/, regra: { saida: '4.1.12', natural: 'saida' } },
  { prefixo: /^(REFEICOES|VALE ALIMENTACAO|COPA E COZINHA|UNIFORMES|BRINDES PARA)\b/, regra: { saida: '4.3.04', natural: 'saida' } },
  { prefixo: /^BENS DE PEQUENO VALOR\b/, regra: { saida: '4.3.20', natural: 'saida' } },
]

/**
 * Regra por família — a compra de grão sem cereal no nome cai na conta da soja,
 * que é o grão dominante; o valor não some e a linha do DRE é a mesma.
 */
function regraDeFamilia(chave: string): RegraCentroCusto | null {
  const f = FAMILIAS.find((x) => x.prefixo.test(chave))
  if (!f) return null
  // A conta de estorno de compra segue o cereal quando ele está no rótulo.
  if (/^COMPRA /.test(chave)) {
    const contas: Record<string, string> = { SOJA: '4.1.01', MILHO: '4.1.02', SORGO: '4.1.03', CAFE: '4.1.05' }
    const grao = Object.keys(contas).find((g) => chave.includes(g))
    if (grao) return { ...f.regra, estorno: contas[grao] }
  }
  return f.regra
}

/** Rótulo do ERP para "sem centro de custo" — resíduo que vai para a fila da IA. */
export const SEM_CENTRO_CUSTO = 'SEM CC'

/**
 * Traduz um centro de custo + direção do fluxo em conta do plano e sinal.
 * Devolve `null` quando o centro de custo é desconhecido (ou "SEM CC") — esse
 * resíduo vai para a classificação por IA (item 1.4 do roadmap), nunca some.
 */
export function destinoDeCentroCusto(cc: string, fluxo: DirecaoFluxo): DestinoLancamento | null {
  const chave = normalizarRotulo(cc)
  if (!chave || chave === SEM_CENTRO_CUSTO) return null
  const regra = REGRAS_CENTRO_CUSTO[chave] ?? regraDeFamilia(chave)
  if (!regra) return null

  if (regra.ignorar) {
    return { conta: '', sinal: 1, ignorar: true, motivo: 'patrimonial_ou_intragrupo' }
  }

  const contaDireta = fluxo === 'entrada' ? regra.entrada : regra.saida
  if (contaDireta === VEM_DA_NF) {
    // Motivos distintos de propósito: se a nota de entrada faltar na carga, o
    // CPV vai a zero, e um balde de descarte com o nome certo é o que denuncia
    // isso no diagnóstico. Um rótulo genérico esconderia a falha.
    return {
      conta: '',
      sinal: 1,
      ignorar: true,
      motivo: fluxo === 'saida' ? 'custo_vem_da_nf' : 'receita_vem_da_nf',
    }
  }
  if (contaDireta) return { conta: contaDireta, sinal: 1, ignorar: false }

  // Fluxo na contramão sem conta própria = ESTORNO, sempre com sinal negativo.
  if (regra.estorno) {
    return { conta: regra.estorno, sinal: -1, ignorar: false, motivo: 'estorno' }
  }
  const contaNatural = regra.natural === 'entrada' ? regra.entrada : regra.saida
  if (!contaNatural || contaNatural === VEM_DA_NF) return null
  return { conta: contaNatural, sinal: -1, ignorar: false, motivo: 'estorno' }
}

/** Centros de custo com classificação a confirmar com o cliente (auditoria). */
export function centrosCustoAConfirmar(): { centroCusto: string; nota: string }[] {
  return Object.entries(REGRAS_CENTRO_CUSTO)
    .filter(([, r]) => r.confirmar)
    .map(([centroCusto, r]) => ({ centroCusto, nota: r.confirmar as string }))
}
