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

export interface FluxoMercadoria {
  competencia: string
  /** Valor das notas de COMPRA (entrada de mercadoria) no mês. */
  compras: number
  /** Receita bruta de vendas do mês. */
  vendas: number
  /** Lucro bruto apurado do mês — negativo é o sintoma que interessa. */
  lucroBruto: number
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
      return {
        competencia: f.competencia,
        compras: f.compras,
        vendas: f.vendas,
        razao,
        distorcido: f.lucroBruto < 0 && razao >= RAZAO_SUSPEITA,
      }
    })
    .sort((a, b) => b.razao - a.razao)
}
