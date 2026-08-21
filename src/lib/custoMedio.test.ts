import { describe, it, expect } from 'vitest'
import { custoMedioMovel, ajusteEstoque, type MovimentoEstoque } from './custoMedio'

function mov(
  competencia: string,
  sacasCompradas: number,
  valorComprado: number,
  sacasVendidas: number,
): MovimentoEstoque {
  return { competencia, grao: 'soja', sacasCompradas, valorComprado, sacasVendidas }
}

describe('custoMedioMovel', () => {
  it('compra e vende tudo no mesmo mês: CPV = compra', () => {
    const r = custoMedioMovel(['2026-01'], [mov('2026-01', 1_000, 130_000, 1_000)])
    const p = r.posicoes[0]
    expect(p.custoMedio).toBeCloseTo(130, 2)
    expect(p.cpv).toBeCloseTo(130_000, 2)
    expect(p.sacasFinais).toBe(0)
    expect(p.valorFinal).toBe(0)
    expect(ajusteEstoque(r, '2026-01')).toBe(0)
  })

  it('formar estoque tira custo do mês (o CPV fica menor que a compra)', () => {
    // Compra 1.000 sacas a R$ 130, vende só 400.
    const r = custoMedioMovel(['2026-01'], [mov('2026-01', 1_000, 130_000, 400)])
    const p = r.posicoes[0]
    expect(p.cpv).toBeCloseTo(52_000, 2) // 400 × 130
    expect(p.sacasFinais).toBe(600)
    expect(p.valorFinal).toBeCloseTo(78_000, 2)
    // O DRE de hoje jogaria R$ 130.000 de custo; o correto é R$ 52.000.
    expect(ajusteEstoque(r, '2026-01')).toBeCloseTo(-78_000, 2)
  })

  it('arrasta o estoque para o mês seguinte e mistura os custos', () => {
    const r = custoMedioMovel(
      ['2026-01', '2026-02'],
      [
        mov('2026-01', 1_000, 130_000, 0), // estoque 1.000 a R$ 130
        mov('2026-02', 1_000, 150_000, 1_000), // compra 1.000 a R$ 150
      ],
    )
    const fev = r.posicoes.find((p) => p.competencia === '2026-02')!
    // Média de 2.000 sacas: (130.000 + 150.000) / 2.000 = R$ 140.
    expect(fev.custoMedio).toBeCloseTo(140, 2)
    expect(fev.cpv).toBeCloseTo(140_000, 2) // 1.000 × 140 (NÃO os 150.000 comprados)
    expect(fev.sacasFinais).toBe(1_000)
    expect(fev.valorFinal).toBeCloseTo(140_000, 2)
  })

  it('vender de estoque sem comprar gera CPV mesmo com compra zero', () => {
    const r = custoMedioMovel(
      ['2026-01', '2026-02'],
      [mov('2026-01', 1_000, 130_000, 0), mov('2026-02', 0, 0, 500)],
    )
    const fev = r.posicoes.find((p) => p.competencia === '2026-02')!
    expect(fev.valorComprado).toBe(0)
    expect(fev.cpv).toBeCloseTo(65_000, 2)
    // Aqui está o ponto do item 3.2: o DRE de hoje mostraria custo ZERO em fev.
    expect(ajusteEstoque(r, '2026-02')).toBeCloseTo(65_000, 2)
  })

  it('estoque de abertura entra na média (grão comprado no ano anterior)', () => {
    const r = custoMedioMovel(['2026-01'], [mov('2026-01', 0, 0, 500)], {
      soja: { sacas: 2_000, valor: 240_000 }, // R$ 120/saca
    })
    const p = r.posicoes[0]
    expect(p.custoMedio).toBeCloseTo(120, 2)
    expect(p.cpv).toBeCloseTo(60_000, 2)
    expect(p.sacasFinais).toBe(1_500)
  })

  it('vender mais do que existe acende o alerta de estoque negativo', () => {
    const r = custoMedioMovel(['2026-01'], [mov('2026-01', 100, 13_000, 500)])
    const p = r.posicoes[0]
    expect(p.estoqueNegativo).toBe(true)
    expect(p.sacasFinais).toBeCloseTo(-400, 2)
    expect(r.competenciasComAlerta).toEqual(['2026-01'])
  })

  it('sem volume disponível o custo médio é zero em vez de dividir por zero', () => {
    const r = custoMedioMovel(['2026-01'], [mov('2026-01', 0, 0, 100)])
    expect(r.posicoes[0].custoMedio).toBe(0)
    expect(Number.isFinite(r.posicoes[0].cpv)).toBe(true)
    expect(r.posicoes[0].estoqueNegativo).toBe(true)
  })

  it('grão sem nenhum movimento nem saldo não gera linha', () => {
    const r = custoMedioMovel(['2026-01'], [mov('2026-01', 10, 1_300, 10)])
    expect(r.posicoes.map((p) => p.grao)).toEqual(['soja'])
  })

  it('trata cada grão com o seu próprio estoque', () => {
    const r = custoMedioMovel(
      ['2026-01'],
      [
        { competencia: '2026-01', grao: 'soja', sacasCompradas: 100, valorComprado: 13_000, sacasVendidas: 50 },
        { competencia: '2026-01', grao: 'milho', sacasCompradas: 200, valorComprado: 16_000, sacasVendidas: 200 },
      ],
    )
    const soja = r.posicoes.find((p) => p.grao === 'soja')!
    const milho = r.posicoes.find((p) => p.grao === 'milho')!
    expect(soja.custoMedio).toBeCloseTo(130, 2)
    expect(milho.custoMedio).toBeCloseTo(80, 2)
    expect(soja.sacasFinais).toBe(50)
    expect(milho.sacasFinais).toBe(0)
  })

  it('a ordem das competências é respeitada mesmo se vier bagunçada', () => {
    const r = custoMedioMovel(
      ['2026-02', '2026-01'],
      [mov('2026-01', 1_000, 130_000, 0), mov('2026-02', 0, 0, 1_000)],
    )
    const fev = r.posicoes.find((p) => p.competencia === '2026-02')!
    expect(fev.sacasIniciais).toBe(1_000) // veio de janeiro, apesar da ordem da lista
    expect(fev.cpv).toBeCloseTo(130_000, 2)
  })
})

describe('volume comprado sem valor de compra', () => {
  it('acende alerta: o custo médio fica artificialmente baixo', () => {
    // 1.000 sacas declaradas, mas nenhum título de compra naquele mês.
    const r = custoMedioMovel(['2026-01'], [mov('2026-01', 1_000, 0, 0)])
    const p = r.posicoes[0]
    expect(p.volumeSemValor).toBe(true)
    expect(p.custoMedio).toBe(0)
    expect(r.competenciasComAlerta).toEqual(['2026-01'])
  })

  it('e contamina o custo médio do mês seguinte', () => {
    const r = custoMedioMovel(
      ['2026-01', '2026-02'],
      [mov('2026-01', 1_000, 0, 0), mov('2026-02', 1_000, 130_000, 1_000)],
    )
    const fev = r.posicoes.find((p) => p.competencia === '2026-02')!
    // 2.000 sacas por R$ 130.000 = R$ 65/saca, metade do preço real.
    expect(fev.custoMedio).toBeCloseTo(65, 2)
    expect(r.competenciasComAlerta).toContain('2026-01')
  })

  it('compra com valor e sem volume não acende este alerta', () => {
    const r = custoMedioMovel(['2026-01'], [mov('2026-01', 0, 130_000, 0)])
    expect(r.posicoes[0].volumeSemValor).toBe(false)
  })
})
