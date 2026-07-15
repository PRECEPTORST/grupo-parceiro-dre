import { describe, it, expect } from 'vitest'
import { parseValorBR, parsePlanilha } from './importar'

describe('parseValorBR', () => {
  it('interpreta padrão brasileiro e inglês', () => {
    expect(parseValorBR('1.240.000,00')).toBe(1_240_000)
    expect(parseValorBR('R$ 88.000')).toBe(88_000)
    expect(parseValorBR('1240000')).toBe(1_240_000)
    expect(parseValorBR('1,240,000.50')).toBe(1_240_000.5)
    expect(parseValorBR('15.000')).toBe(15_000) // milhar do Excel
    expect(parseValorBR('abc')).toBeNull()
  })
})

describe('parsePlanilha', () => {
  const contas = [
    { conta: '3.1.01', descricao: 'Venda de soja' },
    { conta: '4.3.01', descricao: 'Folha administrativa' },
  ]

  it('casa por código (TSV do Excel)', () => {
    const r = parsePlanilha('3.1.01\t1.500.000,00\n4.3.01\t90.000', contas)
    expect(r.valores).toEqual({ '3.1.01': 1_500_000, '4.3.01': 90_000 })
    expect(r.reconhecidas).toBe(2)
    expect(r.ignoradas).toHaveLength(0)
  })

  it('casa por descrição (CSV com ;)', () => {
    const r = parsePlanilha('Folha administrativa;88.000', contas)
    expect(r.valores).toEqual({ '4.3.01': 88_000 })
  })

  it('reporta linhas que não casam', () => {
    const r = parsePlanilha('9.9.99;123\ncabeçalho sem valor', contas)
    expect(r.reconhecidas).toBe(0)
    expect(r.ignoradas.length).toBe(2)
  })
})
