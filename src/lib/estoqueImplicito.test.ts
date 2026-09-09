import { describe, it, expect } from 'vitest'
import { avisosDeEstoque, type FluxoMercadoria } from './estoqueImplicito'

const f = (
  competencia: string,
  compras: number,
  vendas: number,
  lucroBruto: number,
): FluxoMercadoria => ({ competencia, compras, vendas, lucroBruto })

describe('avisosDeEstoque', () => {
  it('marca o mês em que a compra come a receita E o resultado fica negativo', () => {
    // Números reais de 2026: julho saudável, agosto com R$ 2,3M de prejuízo
    // porque comprou 99,7% da receita e ainda pagou R$ 1,87M de frete.
    const r = avisosDeEstoque([
      f('2026-07', 20_875_728, 24_180_629, 289_924),
      f('2026-08', 18_335_865, 18_387_746, -2_325_381),
    ])
    const ago = r.find((x) => x.competencia === '2026-08')!
    const jul = r.find((x) => x.competencia === '2026-07')!
    expect(ago.distorcido).toBe(true)
    expect(ago.razao).toBeGreaterThan(0.99)
    expect(jul.distorcido).toBe(false)
  })

  it('prejuízo com compra BAIXA não é estoque — é operação, e não recebe o aviso', () => {
    // Comprou pouco e ainda assim perdeu: o problema é o preço de venda, e
    // atribuir isso a estoque esconderia um prejuízo real.
    const r = avisosDeEstoque([f('2026-08', 5_000_000, 10_000_000, -1_000_000)])
    expect(r[0].distorcido).toBe(false)
  })

  it('compra alta com resultado POSITIVO não precisa de explicação', () => {
    const r = avisosDeEstoque([f('2026-08', 9_500_000, 10_000_000, 120_000)])
    expect(r[0].distorcido).toBe(false)
  })

  it('funciona com UM mês só — não depende de mês de referência', () => {
    const r = avisosDeEstoque([f('2026-08', 18_335_865, 18_387_746, -2_325_381)])
    expect(r).toHaveLength(1)
    expect(r[0].distorcido).toBe(true)
  })

  it('mês sem venda fica de fora — a razão não existe', () => {
    const r = avisosDeEstoque([f('2026-09', 5_000_000, 0, -5_000_000)])
    expect(r).toEqual([])
  })

  it('ordena pela maior razão, que é o mês que mais precisa de explicação', () => {
    const r = avisosDeEstoque([
      f('2026-06', 8_600_000, 10_000_000, 100_000),
      f('2026-08', 9_900_000, 10_000_000, -200_000),
      f('2026-07', 9_000_000, 10_000_000, 50_000),
    ])
    expect(r.map((x) => x.competencia)).toEqual(['2026-08', '2026-07', '2026-06'])
  })
})
