import { describe, it, expect } from 'vitest'
import {
  mesesDoPeriodo,
  periodosDoAno,
  indiceDoMes,
  sazonalidadeConta,
  pesosSazonais,
  distribuirSazonal,
  ehReceitaGrao,
  contasReceitaGrao,
  valorReceita,
} from './orcamento'
import { mapaEfetivo } from './planoContas'
import type { LancamentoCanonico } from './tipos'

describe('mesesDoPeriodo', () => {
  it('mensal → 1 mês', () => {
    expect(mesesDoPeriodo('mensal', 2026, 0)).toEqual(['2026-01'])
    expect(mesesDoPeriodo('mensal', 2026, 6)).toEqual(['2026-07'])
  })
  it('trimestral → 3 meses, fixo no calendário', () => {
    expect(mesesDoPeriodo('trimestral', 2026, 0)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(mesesDoPeriodo('trimestral', 2026, 3)).toEqual(['2026-10', '2026-11', '2026-12'])
  })
  it('quadrimestral → 4 meses (Jan–Abr / Mai–Ago / Set–Dez)', () => {
    expect(mesesDoPeriodo('quadrimestral', 2026, 0)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
    expect(mesesDoPeriodo('quadrimestral', 2026, 2)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12'])
  })
  it('anual → 12 meses', () => {
    expect(mesesDoPeriodo('anual', 2026, 0)).toHaveLength(12)
    expect(mesesDoPeriodo('anual', 2026, 0)[11]).toBe('2026-12')
  })
})

describe('periodosDoAno', () => {
  it('trimestral tem 4 períodos rotulados', () => {
    const p = periodosDoAno('trimestral', 2026)
    expect(p).toHaveLength(4)
    expect(p[0].rotulo).toBe('1º trimestre')
    expect(p[3].meses).toEqual(['2026-10', '2026-11', '2026-12'])
  })
  it('anual tem 1 período', () => {
    expect(periodosDoAno('anual', 2026)).toHaveLength(1)
  })
})

describe('indiceDoMes', () => {
  it('acha o período que contém o mês', () => {
    expect(indiceDoMes('trimestral', 7)).toBe(2) // julho → 3º trimestre (idx 2)
    expect(indiceDoMes('quadrimestral', 5)).toBe(1) // maio → 2º quadrimestre
    expect(indiceDoMes('anual', 12)).toBe(0)
    expect(indiceDoMes('mensal', 3)).toBe(2) // mensal: o índice é o próprio mês (0-based)
  })
})

const lanc = (data: string, conta: string, valor: number): LancamentoCanonico => ({
  id: `${conta}-${data}`,
  data,
  contaSafragold: conta,
  historico: '',
  valor,
})

describe('sazonalidade e distribuição', () => {
  // Conta que só vende em fevereiro e março no histórico.
  const hist = [lanc('2025-02-10', '3.1.01', 60_000), lanc('2025-03-10', '3.1.01', 40_000)]

  it('pesosSazonais respeita o histórico por mês-calendário', () => {
    const s = sazonalidadeConta(hist, '3.1.01')
    const pesos = pesosSazonais(s, ['2026-01', '2026-02', '2026-03'])
    expect(pesos[0]).toBe(0) // jan sem histórico
    expect(pesos[1]).toBeCloseTo(0.6)
    expect(pesos[2]).toBeCloseTo(0.4)
  })

  it('distribui um total pela sazonalidade e fecha na soma', () => {
    const d = distribuirSazonal(100_000, ['2026-01', '2026-02', '2026-03'], hist, '3.1.01')
    expect(d['2026-01']).toBe(0)
    expect(d['2026-02']).toBe(60_000)
    expect(d['2026-03']).toBe(40_000)
    expect(d['2026-01'] + d['2026-02'] + d['2026-03']).toBe(100_000)
  })

  it('sem histórico distribui igual e ainda fecha na soma (resto no último mês)', () => {
    const d = distribuirSazonal(100, ['2026-01', '2026-02', '2026-03'], [], 'X')
    const soma = d['2026-01'] + d['2026-02'] + d['2026-03']
    expect(soma).toBe(100)
    // 100/3 = 33,33 + 33,33 + 33,34
    expect(d['2026-03']).toBeCloseTo(33.34, 2)
  })
})

describe('receita de grão (volume × preço)', () => {
  const mapa = mapaEfetivo([])

  it('identifica as contas de receita de grão', () => {
    expect(ehReceitaGrao('3.1.01', mapa)).toBe(true) // venda de soja
    expect(ehReceitaGrao('4.1.01', mapa)).toBe(false) // compra de soja (custo)
    expect(ehReceitaGrao('3.1.99', mapa)).toBe(false)
    expect(contasReceitaGrao(mapa)).toEqual(['3.1.01', '3.1.02', '3.1.03', '3.1.05'])
  })

  it('valorReceita = sacas × preço, em centavos exatos', () => {
    expect(valorReceita(1000, 120.5)).toBe(120_500)
    expect(valorReceita(0, 120)).toBe(0)
    expect(valorReceita(333, 100.005)).toBe(33_301.67) // 33301,665 → arredonda em centavos
  })
})
