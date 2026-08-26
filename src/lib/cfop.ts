// Natureza fiscal da nota pelo CFOP — DETERMINÍSTICA. Item 2.3 do ROADMAP.md.
//
// POR QUE ISTO EXISTE
// -------------------
// "Nota fiscal de saída, finalidade Normal, não cancelada" NÃO é sinônimo de
// venda. Um comércio de grãos emite, com a mesma cara, notas que são apenas
// movimentação física:
//   • 5905 / 5934 — remessa (e remessa simbólica) para armazém geral: o grão sai
//     do pátio mas continua sendo da empresa. Não é receita.
//   • 5152 / 6152 — transferência entre estabelecimentos do próprio grupo.
// Na extração de jan–jul/2026 isso somava R$ 21,1M de remessa + R$ 18,2M de
// transferência dentro do que parecia faturamento. Tratar tudo como venda
// inflaria a receita em ~8%.
//
// A NOTA DE ENTRADA é a origem do CUSTO, do mesmo jeito que a de saída é a da
// receita. Ler só a de saída deixava o CPV em R$ 4,6M contra R$ 22,7M reais —
// o que sobrava vinha dos títulos financeiros, e títulos só enxergam a fatia
// que vence dentro da janela.
//
// Do outro lado, as notas de ENTRADA por devolução (CFOP 1202/2202) e o retorno
// de lote de exportação (1504/2504) REDUZEM a receita e estavam sendo
// descartadas — R$ 15,0M que não apareciam em lugar nenhum.
//
// COMO CLASSIFICA
// ---------------
// O 1º dígito do CFOP é só o âmbito (1/2/3 = entrada, 5/6/7 = saída); o
// significado está nos três últimos. Por isso a tabela é por SUFIXO. O que não
// estiver na tabela vira 'outro' e é EXCLUÍDO com registro no diagnóstico —
// nunca vira receita por omissão.
//
// ⚠ A CONFIRMAR COM O CONTADOR: os CFOPs 5501/5502/6501/6502 ("remessa com fim
// específico de exportação") estão tratados como VENDA. Formalmente são remessa,
// mas neste negócio é assim que a venda ao exportador (Cargill, COFCO, BTG) é
// documentada, e os títulos a receber confirmam: as vendas classificadas aqui
// batem com os recebíveis de grão dentro da diferença do intragrupo.

/** O que a nota representa para o DRE. */
export type NaturezaCfop =
  | 'venda'
  | 'compra'
  | 'frete_compra'
  | 'devolucao_venda'
  | 'devolucao_compra'
  | 'remessa'
  | 'transferencia'
  | 'outro'

/** Sufixos (3 últimos dígitos) que são VENDA de mercadoria. */
const VENDA = new Set([
  '101', '102', '103', '104', '105', '106', '107', '108', '109', '110',
  '111', '112', '113', '114', '115', '116', '117', '118', '119', '120',
  '122', '123',
  // Fim específico de exportação — ver a nota de confirmação acima.
  '501', '502',
  // Faturamento de venda para entrega futura.
  '922',
])

/** Devolução/retorno de VENDA: mercadoria volta para a empresa → reduz receita. */
const DEVOLUCAO_VENDA = new Set([
  '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212',
  // Retorno/devolução de mercadoria remetida para formação de lote de exportação
  // (é a contrapartida do 6502 que não se concretizou).
  '503', '504',
])

/** Remessa/retorno de armazém geral e afins: movimentação física, não é venda. */
const REMESSA = new Set([
  '901', '902', '903', '904', '905', '906', '907', '908', '909', '910',
  '911', '912', '913', '914', '915', '916', '917', '918', '919', '920',
  '921', '923', '924', '925', '926', '927', '934', '949',
])

/**
 * Aquisição de SERVIÇO DE TRANSPORTE (CT-e). Entrando, é frete sobre compra —
 * custo do produto, não despesa. Eram R$ 1,78M em julho, 489 documentos, caindo
 * em 'outro' por não estarem em tabela nenhuma.
 */
const SERVICO_TRANSPORTE = new Set(['351', '352', '353', '354', '355', '356', '932'])

/** Transferência entre estabelecimentos do mesmo titular. */
const TRANSFERENCIA = new Set(['151', '152', '153', '155', '156', '551', '552', '553', '555', '556'])

/** Só os dígitos do CFOP ('5.102' → '5102'). */
export function digitosCfop(cfop: unknown): string {
  return String(cfop ?? '').replace(/\D/g, '')
}

/** Os três últimos dígitos, que carregam o significado da operação. */
export function sufixoCfop(cfop: unknown): string {
  const d = digitosCfop(cfop)
  return d.length >= 4 ? d.slice(-3) : ''
}

/** true quando o CFOP é de ENTRADA (1/2/3) — a mercadoria vem para a empresa. */
export function cfopDeEntrada(cfop: unknown): boolean {
  return /^[123]/.test(digitosCfop(cfop))
}

/**
 * Natureza da nota. `tipoOperacao` do ERP é usado como desempate para
 * devoluções: entrada = cliente devolveu para nós (reduz receita); saída = nós
 * devolvemos ao fornecedor (reduz custo).
 */
export function naturezaDeCfop(cfop: unknown, entrada: boolean): NaturezaCfop {
  const sufixo = sufixoCfop(cfop)
  if (!sufixo) return 'outro'
  if (TRANSFERENCIA.has(sufixo)) return 'transferencia'
  // Mesmo sufixo, sentido oposto: entrada = cliente nos devolveu (reduz receita);
  // saída = devolvemos ao fornecedor (reduz custo).
  if (DEVOLUCAO_VENDA.has(sufixo)) return entrada ? 'devolucao_venda' : 'devolucao_compra'
  // Só na ENTRADA: o CT-e de saída é frete sobre VENDA, que continua vindo do
  // título (a nota de saída não distingue as duas pontas com segurança).
  if (SERVICO_TRANSPORTE.has(sufixo)) return entrada ? 'frete_compra' : 'outro'
  if (REMESSA.has(sufixo)) return 'remessa'
  // Mesmo sufixo de aquisição de mercadoria: saindo é venda, entrando é COMPRA.
  // 1102/2102 na nota de entrada é o CPV — a contrapartida exata do 5102 na de
  // saída. Enquanto isso caía em 'outro', o custo do mês inteiro sumia.
  if (VENDA.has(sufixo)) return entrada ? 'compra' : 'venda'
  return 'outro'
}

/** Rótulos legíveis para o diagnóstico da carga. */
export const ROTULO_NATUREZA: Record<NaturezaCfop, string> = {
  venda: 'Venda',
  compra: 'Compra de mercadoria (CPV)',
  frete_compra: 'Frete sobre compra — CT-e (CPV)',
  devolucao_venda: 'Devolução de venda (reduz receita)',
  devolucao_compra: 'Devolução de compra (reduz custo)',
  remessa: 'Remessa/retorno de armazém (não é venda)',
  transferencia: 'Transferência entre estabelecimentos',
  outro: 'Outra operação (fora do DRE)',
}
