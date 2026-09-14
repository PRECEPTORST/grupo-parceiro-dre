/**
 * O DRE REAL DO CLIENTE, para conferência lado a lado.
 *
 * Extraído uma vez da aba "DRE ACUM (2)" de `DRE ACUMULADO _CEREAIS_PAINEL GP
 * RESULTS.xlsx`. Mora aqui, e não num arquivo que precise ser carregado, porque
 * o objetivo declarado é apurar o DRE só com a API — a planilha é a REFERÊNCIA
 * contra a qual se confere, não uma fonte de dados.
 *
 * Escopo: FILIAL MG (30798330/0002-16). Ver `empresas.ts`.
 *
 * A estrutura confere ao centavo em agosto/2026:
 *   CUSTO TOTAL  = compra + armazenagem + frete + comissão + classificação + quebras
 *   LUCRO BRUTO  = receita líquida - custo total
 */
export interface LinhaPlanilha {
  receitaBruta: number
  impostos: number
  devolucao: number
  compra: number
  armazenagem: number
  frete: number
  comissao: number
  classificacao: number
  quebras: number
  despesaTotal: number
}

export const PLANILHA_CLIENTE: Record<string, LinhaPlanilha> = {
  // Out–dez/2025 entram porque 8 meses aceitavam ajustes que 11 desmentem: o
  // 5934 "fechava" o acumulado de 2026 e explodia em nov/dez (-71%, -78%).
  '2025-10': { receitaBruta: 4_996_400.22, impostos: 0, devolucao: 0, compra: 4_311_967.58, armazenagem: 0, frete: 513_147.37, comissao: 51_678.72, classificacao: 320.00, quebras: 2_651.60, despesaTotal: 163_316.65 },
  '2025-11': { receitaBruta: 7_465_870.90, impostos: 0, devolucao: 0, compra: 6_383_244.37, armazenagem: 1_500.00, frete: 747_275.32, comissao: 49_069.80, classificacao: 320.00, quebras: 4_983.85, despesaTotal: 296_542.52 },
  '2025-12': { receitaBruta: 10_131_395.70, impostos: 1_086.88, devolucao: 0, compra: 8_909_081.88, armazenagem: 0, frete: 874_880.50, comissao: 47_307.70, classificacao: 320.00, quebras: 7_588.33, despesaTotal: 207_213.44 },
  '2026-01': { receitaBruta: 9_030_088.30, impostos: 0, devolucao: 0, compra: 7_909_884.41, armazenagem: 0, frete: 634_974.03, comissao: 41_110.47, classificacao: 6_119.63, quebras: 5_289.00, despesaTotal: 250_408.62 },
  '2026-02': { receitaBruta: 12_601_230.59, impostos: 0, devolucao: 0, compra: 11_317_769.48, armazenagem: 0, frete: 879_357.24, comissao: 56_739.02, classificacao: 5_760.00, quebras: 19_068.11, despesaTotal: 273_700.25 },
  '2026-03': { receitaBruta: 40_429_003.18, impostos: 0, devolucao: 0, compra: 36_666_215.64, armazenagem: 0, frete: 3_168_207.66, comissao: 118_872.97, classificacao: 0, quebras: 13_996.71, despesaTotal: 111_237.53 },
  '2026-04': { receitaBruta: 43_280_410.49, impostos: 0, devolucao: 0, compra: 39_169_661.25, armazenagem: 2_396.78, frete: 3_677_499.20, comissao: 135_905.49, classificacao: 230.00, quebras: 16_159.78, despesaTotal: 1_256_844.27 },
  '2026-05': { receitaBruta: 45_584_688.98, impostos: 0, devolucao: 0, compra: 40_983_340.14, armazenagem: 0, frete: 3_654_379.11, comissao: 184_203.70, classificacao: 2_130.00, quebras: 16_935.47, despesaTotal: 434_879.71 },
  '2026-06': { receitaBruta: 25_296_202.48, impostos: 0, devolucao: 0, compra: 22_841_085.15, armazenagem: 0, frete: 1_846_286.70, comissao: 88_396.62, classificacao: 150.00, quebras: 26_553.87, despesaTotal: 417_225.98 },
  '2026-07': { receitaBruta: 23_187_057.86, impostos: 0, devolucao: 0, compra: 20_943_757.86, armazenagem: 0, frete: 1_666_350.81, comissao: 98_487.91, classificacao: 1_700.00, quebras: 20_658.65, despesaTotal: 226_112.81 },
  '2026-08': { receitaBruta: 19_103_526.18, impostos: 0, devolucao: 0, compra: 16_695_193.02, armazenagem: 0, frete: 1_822_629.78, comissao: 68_275.48, classificacao: 4_496.00, quebras: 5_481.93, despesaTotal: 505_543.19 },
}

/**
 * Cada linha da planilha e as contas do nosso plano que a alimentam.
 *
 * `somenteApurado` marca o que existe só do nosso lado: a devolução de venda,
 * que deduzimos e a planilha não. Sem essa marca a linha aparece como "-100% de
 * diferença" e parece erro, quando é divergência conhecida de critério.
 */
export const LINHAS_CONFERENCIA: {
  chave: keyof LinhaPlanilha
  rotulo: string
  conta: (c: string) => boolean
  somenteApurado?: boolean
}[] = [
  { chave: 'receitaBruta', rotulo: 'Receita bruta', conta: (c) => c.startsWith('3.1.') },
  { chave: 'impostos', rotulo: 'Impostos', conta: (c) => /^3\.2\.0[1-5]$/.test(c) },
  { chave: 'devolucao', rotulo: 'Devolução de venda', conta: (c) => c === '3.2.06' || c === '3.2.07', somenteApurado: true },
  { chave: 'compra', rotulo: 'Compra de cereais', conta: (c) => /^4\.1\.(01|02|03|04|05|06|18)$/.test(c) },
  { chave: 'armazenagem', rotulo: 'Armazenagem', conta: (c) => c === '4.1.11' },
  { chave: 'frete', rotulo: 'Frete', conta: (c) => c === '4.1.10' },
  { chave: 'comissao', rotulo: 'Comissão', conta: (c) => c === '4.2.01' || c === '4.2.02' },
  { chave: 'classificacao', rotulo: 'Classificação', conta: (c) => c === '4.1.13' },
  { chave: 'quebras', rotulo: 'Quebras / qualidade', conta: (c) => c === '4.1.14' },
  { chave: 'despesaTotal', rotulo: 'Despesa total', conta: (c) => /^4\.[234]\./.test(c) && c !== '4.2.01' && c !== '4.2.02' },
]

export const custoTotal = (x: LinhaPlanilha) =>
  x.compra + x.armazenagem + x.frete + x.comissao + x.classificacao + x.quebras

export const receitaLiquida = (x: LinhaPlanilha) => x.receitaBruta - x.impostos - x.devolucao
