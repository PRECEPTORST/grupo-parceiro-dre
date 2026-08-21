import { describe, it, expect } from 'vitest'
import { analisarGapContratos, gapEhEstrutural, faixaDe } from './gapContratos'

const nota = (idContrato: number, valor: number, competencia = '2026-06') => ({
  idContrato,
  valor,
  competencia,
})
const titulo = (idContrato: number, valor: number, competencia = '2026-06') => ({
  idContrato,
  valor,
  competencia,
})

describe('faixaDe', () => {
  it('separa exato, desconto leve, desconto forte e título maior', () => {
    expect(faixaDe(1)).toBe('exato')
    expect(faixaDe(0.97)).toBe('desconto_leve')
    expect(faixaDe(0.755)).toBe('desconto_forte')
    expect(faixaDe(1.05)).toBe('titulo_maior')
  })
})

describe('analisarGapContratos', () => {
  it('só confronta contratos que têm as DUAS pontas', () => {
    const r = analisarGapContratos(
      [nota(1, 100_000), nota(2, 50_000)], // contrato 2 não tem título
      [titulo(1, 96_000), titulo(3, 10_000)], // contrato 3 não tem nota
    )
    expect(r.contratos.map((c) => c.idContrato)).toEqual(['1'])
    expect(r.totalNf).toBeCloseTo(100_000, 2)
    expect(r.gapTotal).toBeCloseTo(4_000, 2)
  })

  it('soma várias notas e títulos do mesmo contrato', () => {
    const r = analisarGapContratos(
      [nota(1, 60_000), nota(1, 40_000)],
      [titulo(1, 50_000), titulo(1, 46_000)],
    )
    expect(r.contratos[0].valorNf).toBeCloseTo(100_000, 2)
    expect(r.contratos[0].valorTitulo).toBeCloseTo(96_000, 2)
    expect(r.contratos[0].razao).toBeCloseTo(0.96, 4)
  })

  it('reproduz a assinatura real: mediana 0,96 com dispersão grande', () => {
    // Espelha o perfil medido em jan–jul/2026.
    // Razões 1,00 / 0,97 / 0,95 / 0,755 → mediana 0,96, como no real.
    const notas = [nota(1, 100_000), nota(2, 100_000), nota(3, 100_000), nota(4, 100_000)]
    const titulos = [titulo(1, 100_000), titulo(2, 97_000), titulo(3, 95_000), titulo(4, 75_500)]
    const r = analisarGapContratos(notas, titulos)
    expect(r.razaoMediana).toBeCloseTo(0.96, 2)
    expect(r.distribuicao.exato).toBe(1)
    expect(r.distribuicao.desconto_leve).toBe(2)
    expect(r.distribuicao.desconto_forte).toBe(1)
    expect(r.gapPct).toBeCloseTo(8.1, 1) // ~9% observado no real
  })

  it('a mediana resiste a um outlier que destruiria a média', () => {
    const notas = [nota(1, 100_000), nota(2, 100_000), nota(3, 100_000)]
    const titulos = [titulo(1, 100_000), titulo(2, 100_000), titulo(3, 1_000)]
    const r = analisarGapContratos(notas, titulos)
    expect(r.razaoMediana).toBe(1) // mediana intacta
    expect(r.gapPct).toBeCloseTo(33, 0) // o total sente o outlier, como deve
  })

  it('ignora nota abaixo do piso (ruído de rateio)', () => {
    const r = analisarGapContratos([nota(1, 500)], [titulo(1, 400)])
    expect(r.contratos).toHaveLength(0)
  })

  it('ignora contrato sem id', () => {
    const r = analisarGapContratos(
      [{ idContrato: undefined as never, valor: 100_000, competencia: '2026-06' }],
      [{ idContrato: undefined as never, valor: 90_000, competencia: '2026-06' }],
    )
    expect(r.contratos).toHaveLength(0)
  })

  it('agrupa o gap por competência com o percentual do mês', () => {
    const r = analisarGapContratos(
      [nota(1, 100_000, '2026-05'), nota(2, 200_000, '2026-06')],
      [titulo(1, 90_000), titulo(2, 180_000)],
    )
    expect(r.gapPorCompetencia['2026-05'].pct).toBeCloseTo(10, 1)
    expect(r.gapPorCompetencia['2026-06'].pct).toBeCloseTo(10, 1)
  })

  it('usa a competência da nota mais antiga do contrato', () => {
    const r = analisarGapContratos(
      [nota(1, 50_000, '2026-06'), nota(1, 50_000, '2026-04')],
      [titulo(1, 96_000)],
    )
    expect(r.contratos[0].competencia).toBe('2026-04')
  })

  it('ordena por maior gap', () => {
    const r = analisarGapContratos(
      [nota(1, 100_000), nota(2, 100_000)],
      [titulo(1, 99_000), titulo(2, 70_000)],
    )
    expect(r.contratos[0].idContrato).toBe('2')
  })
})

describe('gapEhEstrutural', () => {
  it('gap que se repete todo mês é estrutural', () => {
    const r = analisarGapContratos(
      [nota(1, 100_000, '2026-04'), nota(2, 100_000, '2026-05'), nota(3, 100_000, '2026-06')],
      [titulo(1, 91_000), titulo(2, 90_000), titulo(3, 92_000)],
    )
    expect(gapEhEstrutural(r)).toBe(true)
  })

  it('gap num mês só é evento pontual, não regra', () => {
    const r = analisarGapContratos(
      [nota(1, 100_000, '2026-04'), nota(2, 100_000, '2026-05'), nota(3, 100_000, '2026-06')],
      [titulo(1, 100_000), titulo(2, 100_000), titulo(3, 70_000)],
    )
    expect(gapEhEstrutural(r)).toBe(false)
  })

  it('poucos meses não bastam para declarar estrutura', () => {
    const r = analisarGapContratos([nota(1, 100_000, '2026-06')], [titulo(1, 90_000)])
    expect(gapEhEstrutural(r)).toBe(false)
  })
})
