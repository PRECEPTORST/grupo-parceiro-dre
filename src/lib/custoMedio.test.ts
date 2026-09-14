import { describe, it, expect } from 'vitest'
import {
  custoMedioMovel,
  ajusteEstoque,
  lancamentosDeEstoque,
  aberturaMinima,
  type MovimentoEstoque,
} from './custoMedio'

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

describe('lancamentosDeEstoque — a apropriação entra na conta do próprio grão', () => {
  // Números reais de agosto/2026: comprou 215.014 sacas de milho e vendeu
  // 195.926. O grão que sobrou estava sendo lançado como prejuízo.
  const movimentos: MovimentoEstoque[] = [
    { competencia: '2026-08', grao: 'milho', sacasCompradas: 215_014, valorComprado: 12_957_000, sacasVendidas: 195_926 },
  ]

  it('mês que forma estoque tira custo — lançamento NEGATIVO', () => {
    const rel = custoMedioMovel(['2026-08'], movimentos)
    const [l] = lancamentosDeEstoque(rel)
    // 4.1.02 é "Aquisição de milho", conta que JÁ EXISTE no plano do cliente.
    // A 4.1.19 que existia aqui era invenção minha e foi removida.
    expect(l.contaSafragold).toBe('4.1.02')
    expect(l.valor).toBeLessThan(0)
    expect(l.data).toBe('2026-08-31')
    expect(l.historico).toContain('não vendido')
  })

  it('cada grão vai para a SUA conta de aquisição', () => {
    const rel = custoMedioMovel(['2026-08'], [
      { competencia: '2026-08', grao: 'soja', sacasCompradas: 1_000, valorComprado: 130_000, sacasVendidas: 400 },
      { competencia: '2026-08', grao: 'milho', sacasCompradas: 1_000, valorComprado: 60_000, sacasVendidas: 300 },
    ])
    const contas = Object.fromEntries(lancamentosDeEstoque(rel).map((l) => [l.contaSafragold, l.valor]))
    expect(contas['4.1.01']).toBeCloseTo(-78_000, 0) // soja: 600 sacas a R$ 130
    expect(contas['4.1.03']).toBeUndefined() // sorgo não se moveu
  })

  it('nenhum lançamento cai numa conta fora do plano de contas do cliente', () => {
    const rel = custoMedioMovel(['2026-08'], movimentos)
    for (const l of lancamentosDeEstoque(rel)) {
      expect(['4.1.01', '4.1.02', '4.1.03', '4.1.05']).toContain(l.contaSafragold)
    }
  })

  it('mês que vende estoque anterior devolve o custo — lançamento POSITIVO', () => {
    const rel = custoMedioMovel(
      ['2026-08', '2026-09'],
      [...movimentos, { competencia: '2026-09', grao: 'milho', sacasCompradas: 0, valorComprado: 0, sacasVendidas: 19_088 }],
    )
    const set = lancamentosDeEstoque(rel).find((l) => l.data.startsWith('2026-09'))!
    expect(set.valor).toBeGreaterThan(0)
    expect(set.historico).toContain('estoque anterior')
  })

  it('ao longo do tempo a variação se anula — o que sai num mês entra noutro', () => {
    const rel = custoMedioMovel(
      ['2026-08', '2026-09'],
      [...movimentos, { competencia: '2026-09', grao: 'milho', sacasCompradas: 0, valorComprado: 0, sacasVendidas: 19_088 }],
    )
    const soma = lancamentosDeEstoque(rel).reduce((s, l) => s + l.valor, 0)
    expect(Math.abs(soma)).toBeLessThan(1)
  })

  it('mês em que compra e venda batem não gera lançamento nenhum', () => {
    const rel = custoMedioMovel(['2026-08'], [
      { competencia: '2026-08', grao: 'milho', sacasCompradas: 1000, valorComprado: 60_000, sacasVendidas: 1000 },
    ])
    expect(lancamentosDeEstoque(rel)).toEqual([])
  })
})

describe('aberturaMinima — o encadeamento denuncia o estoque que faltava', () => {
  it('devolve o déficit mais fundo, não o do último mês', () => {
    // Vende 500 sem comprar (fica -500), depois compra 300 e não vende (-200).
    // O piso é 500: em janeiro já faltavam 500 sacas.
    const movs: MovimentoEstoque[] = [
      { competencia: '2026-01', grao: 'soja', sacasCompradas: 0, valorComprado: 0, sacasVendidas: 500 },
      { competencia: '2026-02', grao: 'soja', sacasCompradas: 300, valorComprado: 39_000, sacasVendidas: 0 },
    ]
    expect(aberturaMinima(['2026-01', '2026-02'], movs).soja?.sacas).toBe(500)
  })

  it('precifica pela primeira COMPRA, não pelo custo médio do mês quebrado', () => {
    const movs: MovimentoEstoque[] = [
      { competencia: '2026-01', grao: 'soja', sacasCompradas: 0, valorComprado: 0, sacasVendidas: 500 },
      { competencia: '2026-02', grao: 'soja', sacasCompradas: 300, valorComprado: 39_000, sacasVendidas: 0 },
    ]
    // R$ 130/saca é o preço da nota de fevereiro. O custo médio de janeiro é 0
    // (dividiu sem estoque) e o de fevereiro ainda carrega o buraco.
    expect(aberturaMinima(['2026-01', '2026-02'], movs).soja?.valor).toBeCloseTo(65_000, 0)
  })

  it('grão que nunca fica negativo não ganha abertura', () => {
    const movs: MovimentoEstoque[] = [
      { competencia: '2026-01', grao: 'milho', sacasCompradas: 1_000, valorComprado: 60_000, sacasVendidas: 400 },
    ]
    expect(aberturaMinima(['2026-01'], movs)).toEqual({})
  })

  it('a abertura inferida zera o alerta — é essa a definição dela', () => {
    const movs: MovimentoEstoque[] = [
      { competencia: '2026-01', grao: 'soja', sacasCompradas: 0, valorComprado: 0, sacasVendidas: 500 },
      { competencia: '2026-02', grao: 'soja', sacasCompradas: 300, valorComprado: 39_000, sacasVendidas: 0 },
    ]
    const meses = ['2026-01', '2026-02']
    const rel = custoMedioMovel(meses, movs, aberturaMinima(meses, movs))
    expect(rel.posicoes.every((p) => p.sacasFinais >= -0.01)).toBe(true)
  })

  it('grão que só vende, sem nota de compra, fica de fora em vez de ganhar preço inventado', () => {
    const movs: MovimentoEstoque[] = [
      { competencia: '2026-01', grao: 'cafe', sacasCompradas: 0, valorComprado: 0, sacasVendidas: 100 },
    ]
    expect(aberturaMinima(['2026-01'], movs).cafe).toBeUndefined()
  })
})
