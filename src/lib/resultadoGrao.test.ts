import { describe, it, expect } from 'vitest'
import { graoDeCentroCusto, naturezaDeCentroCusto, resultadoCaixaPorGrao } from './resultadoGrao'
import type { MovimentoCaixa } from './tipos'

const mov = (tipo: 'entrada' | 'saida', valor: number, cc?: string, i = Math.round(valor)): MovimentoCaixa => ({
  id: `m${i}-${tipo}`,
  data: '2026-08-15',
  tipo,
  valor,
  centroCusto: cc,
})

describe('graoDeCentroCusto', () => {
  it('detecta o grão pelo nome', () => {
    expect(graoDeCentroCusto('RECEITA SOJA - MERCADO INTERNO')).toBe('soja')
    expect(graoDeCentroCusto('COMPRA MILHO')).toBe('milho')
    expect(graoDeCentroCusto('SECAGEM SORGO')).toBe('sorgo')
    expect(graoDeCentroCusto('Café exportação')).toBe('cafe')
    expect(graoDeCentroCusto('FRETE')).toBeNull()
    expect(graoDeCentroCusto(undefined)).toBeNull()
  })
})

describe('naturezaDeCentroCusto', () => {
  it('classifica receita / compra / custo', () => {
    expect(naturezaDeCentroCusto('RECEITA SOJA - MERCADO INTERNO', 'entrada')).toBe('receita')
    expect(naturezaDeCentroCusto('COMPRA MILHO', 'saida')).toBe('compra')
    expect(naturezaDeCentroCusto('SECAGEM SORGO', 'saida')).toBe('custo')
    expect(naturezaDeCentroCusto('CLASSIFICAÇÃO MILHO', 'saida')).toBe('custo')
  })
})

describe('resultadoCaixaPorGrao', () => {
  const movimentos: MovimentoCaixa[] = [
    mov('entrada', 6_367_986, 'RECEITA MILHO - MERCADO INTERNO'),
    mov('entrada', 2_141_008, 'RECEITA SOJA - MERCADO INTERNO'),
    mov('saida', 96_583, 'RECEITA SOJA - MERCADO INTERNO'), // estorno reduz a receita da soja
    mov('saida', 7_630_091, 'COMPRA SOJA'),
    mov('saida', 3_044_576, 'COMPRA MILHO'),
    mov('saida', 32_089, 'CLASSIFICAÇÃO MILHO'),
    mov('saida', 874_983, 'FRETE'), // sem grão → overhead
  ]
  const rel = resultadoCaixaPorGrao(movimentos)
  const soja = rel.graos.find((g) => g.grao === 'soja')!
  const milho = rel.graos.find((g) => g.grao === 'milho')!

  it('soma receita com estorno (saída em CC de receita reduz)', () => {
    expect(soja.receita).toBe(2_141_008 - 96_583)
    expect(soja.compra).toBe(7_630_091)
    expect(soja.custos).toBe(0)
    expect(soja.resultado).toBe(2_141_008 - 96_583 - 7_630_091)
  })

  it('classifica compra e custo direto do milho', () => {
    expect(milho.receita).toBe(6_367_986)
    expect(milho.compra).toBe(3_044_576)
    expect(milho.custos).toBe(32_089)
    expect(milho.resultado).toBe(6_367_986 - 3_044_576 - 32_089)
  })

  it('overhead sem grão fica fora (só contabiliza em semGrao)', () => {
    expect(rel.semGrao).toBe(874_983)
    expect(rel.atribuidos).toBe(6)
    expect(rel.graos.some((g) => g.grao === 'sorgo')).toBe(false) // não houve sorgo
  })

  it('total soma os grãos', () => {
    expect(rel.total.receita).toBe(soja.receita + milho.receita)
    expect(rel.total.resultado).toBe(soja.resultado + milho.resultado)
  })
})
