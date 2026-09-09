// Por que o CPV do mês pode não descrever o mês — DETERMINÍSTICO, sem estimativa.
//
// O DRE lança como custo TODA a compra do mês, e não o custo do que foi vendido.
// Enquanto a empresa compra e vende volumes parecidos os dois quase coincidem, e
// ninguém percebe a diferença. Quando ela estoca, não coincidem: agosto/2026
// comprou o equivalente a 99,7% da receita bruta e o DRE mostrou R$ 2,3 MILHÕES
// de prejuízo — grão que entrou no armazém e virou despesa no mesmo mês.
//
// O número não está errado para o método; o método é que não fecha sozinho. E um
// prejuízo dessa ordem na tela, sem uma linha dizendo de onde vem, faz quem lê
// concluir que a operação perdeu dinheiro. É a leitura errada, e é cara.
//
// O QUE ESTA FUNÇÃO NÃO FAZ
// -------------------------
// Não corrige, não estima, não ajusta linha nenhuma. O conserto de verdade é
// CPV = estoque inicial + compras − estoque final, e depende de saldo de estoque
// que o ERP não entrega por esta via. Inventar um custo plausível seria pior que
// mostrar um número explicadamente incompleto.
//
// Também não usa mês de referência: com dois meses carregados qualquer mediana é
// frágil, e uma conclusão apoiada em referência frágil é pior que a conta crua.
// Aqui só se afirma o que os próprios números do mês dizem.

/**
 * Margem bruta em que o negócio realmente opera, informada pelo cliente
 * (2026-09-09): 3% a 4% da receita. Serve de RÉGUA, não de resultado.
 *
 * O DRE continua sendo a soma das contas — nada aqui altera uma linha dele. A
 * régua existe só para traduzir "margem abaixo do normal" em "quanto de grão
 * sobrou no armazém", que é um número que alguém pode ir conferir fisicamente.
 *
 * Vale para os DOIS lados: em julho/2026 a planilha do próprio cliente fechou em
 * 1,97%, também abaixo da faixa. Não é um problema do nosso cálculo — é do
 * método que ambos usam, de lançar a compra do mês como custo.
 */
export const MARGEM_REFERENCIA = { min: 0.03, max: 0.04 } as const

/** Ponto médio da faixa — uma régua precisa de um valor, e 3,5% é o centro. */
const MARGEM_MEDIA = (MARGEM_REFERENCIA.min + MARGEM_REFERENCIA.max) / 2

export interface FluxoMercadoria {
  competencia: string
  /** Valor das notas de COMPRA (entrada de mercadoria) no mês. */
  compras: number
  /** Receita bruta de vendas do mês. */
  vendas: number
  /** Lucro bruto apurado do mês — negativo é o sintoma que interessa. */
  lucroBruto: number
  /** Receita líquida do mês (receita bruta − deduções). */
  receitaLiquida: number
  /** CPV apurado do mês. */
  cpv: number
}

export interface AvisoEstoque {
  competencia: string
  compras: number
  vendas: number
  /** Compras como fração da receita bruta. Perto de 1, não sobra para frete nem margem. */
  razao: number
  /**
   * true quando o mês fecha no vermelho E a compra é quase toda a receita — a
   * assinatura de estoque lançado como despesa, não de operação deficitária.
   */
  distorcido: boolean
  /** Margem bruta apurada, em fração da receita líquida. */
  margem: number
  /**
   * Quanto de mercadoria o mês teria comprado ALÉM do que vendeu, se a margem
   * fosse a de referência. É o tamanho do estoque a conferir no armazém — não um
   * ajuste contábil, e nunca entra no DRE.
   */
  estoqueImplicito: number
}

/**
 * Razão a partir da qual a compra do mês come a receita inteira.
 *
 * Trading de grãos vive de 1% a 3% de margem bruta, e ainda paga frete (~8% do
 * valor comprado neste cliente). Comprar acima de 92% da receita já não deixa
 * espaço para o frete — o excedente é estoque, não prejuízo.
 */
const RAZAO_SUSPEITA = 0.92

/** Meses em que o CPV descreve a COMPRA e não a VENDA. Ordem: pior primeiro. */
export function avisosDeEstoque(fluxos: FluxoMercadoria[]): AvisoEstoque[] {
  return fluxos
    .filter((f) => f.vendas > 0)
    .map((f) => {
      const razao = f.compras / f.vendas
      const margem = f.receitaLiquida ? f.lucroBruto / f.receitaLiquida : 0
      const cpvNaReferencia = f.receitaLiquida * (1 - MARGEM_MEDIA)
      return {
        competencia: f.competencia,
        compras: f.compras,
        vendas: f.vendas,
        razao,
        margem,
        estoqueImplicito: f.cpv - cpvNaReferencia,
        distorcido: f.lucroBruto < 0 && razao >= RAZAO_SUSPEITA,
      }
    })
    .sort((a, b) => b.razao - a.razao)
}
