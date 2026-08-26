import { describe, it, expect } from 'vitest'
import { coberturaDaCompetencia, fimDaCompetencia, referenciaMensal } from './cobertura'
import type { LancamentoCanonico } from './tipos'

function l(data: string, valor = 100): LancamentoCanonico {
  return { id: data + valor, data, contaSafragold: '3.1.01', historico: '', valor, origem: 'enoki' }
}

describe('fimDaCompetencia', () => {
  it('acha o último dia de cada mês', () => {
    expect(fimDaCompetencia('2026-01')).toBe('2026-01-31')
    expect(fimDaCompetencia('2026-04')).toBe('2026-04-30')
    expect(fimDaCompetencia('2026-02')).toBe('2026-02-28')
  })

  it('ano bissexto', () => {
    expect(fimDaCompetencia('2028-02')).toBe('2028-02-29')
  })
})

describe('coberturaDaCompetencia', () => {
  it('mês passado com dados até o fim NÃO é parcial', () => {
    const c = coberturaDaCompetencia('2026-07', [l('2026-07-01'), l('2026-07-31')], '2026-08-24')
    expect(c.parcial).toBe(false)
    expect(c.diasCobertos).toBe(31)
    expect(c.fracao).toBe(1)
  })

  it('o caso real: agosto com dados até o dia 5 é PARCIAL', () => {
    const c = coberturaDaCompetencia('2026-08', [l('2026-08-01'), l('2026-08-05')], '2026-08-24')
    expect(c.parcial).toBe(true)
    expect(c.ultimaData).toBe('2026-08-05')
    expect(c.diasCobertos).toBe(5)
    expect(c.diasNoMes).toBe(31)
    expect(c.fracao).toBeCloseTo(5 / 31, 4)
    expect(c.mesCorrente).toBe(true)
  })

  it('mês ANTERIOR truncado também é parcial — a régua é o fim do mês', () => {
    const c = coberturaDaCompetencia('2026-06', [l('2026-06-10')], '2026-08-24')
    expect(c.parcial).toBe(true)
    expect(c.mesCorrente).toBe(false)
  })

  it('no mês corrente a régua é HOJE, não o fim do mês', () => {
    // Dados até ontem, hoje é dia 10: normal, não é alarme.
    const c = coberturaDaCompetencia('2026-08', [l('2026-08-09')], '2026-08-10')
    expect(c.parcial).toBe(true)
    expect(c.diasCobertos).toBe(9)

    // Dados até hoje: cobertura em dia.
    const emDia = coberturaDaCompetencia('2026-08', [l('2026-08-10')], '2026-08-10')
    expect(emDia.parcial).toBe(false)
  })

  it('competência sem nenhum lançamento não é "parcial", é vazia', () => {
    const c = coberturaDaCompetencia('2026-09', [l('2026-08-05')], '2026-09-15')
    expect(c.diasCobertos).toBe(0)
    expect(c.ultimaData).toBe('')
    expect(c.parcial).toBe(false)
  })

  it('ignora lançamentos de outras competências', () => {
    const c = coberturaDaCompetencia('2026-07', [l('2026-08-31'), l('2026-07-15')], '2026-08-24')
    expect(c.ultimaData).toBe('2026-07-15')
  })
})

describe('referenciaMensal', () => {
  const valores: Record<string, number> = {
    '2026-05': 51_860_000,
    '2026-06': 31_260_000,
    '2026-07': 27_550_000,
    '2026-08': 2_520_000, // parcial
  }
  const competencias = Object.keys(valores)

  it('a média ignora os meses parciais — senão o parcial puxa a régua para baixo', () => {
    const media = referenciaMensal(competencias, (c) => valores[c], new Set(['2026-08']))!
    expect(media).toBeCloseTo((51_860_000 + 31_260_000 + 27_550_000) / 3, 0)
    // Com o parcial dentro a média cairia ~25%, e a comparação perderia sentido.
    const errada = referenciaMensal(competencias, (c) => valores[c], new Set())!
    expect(errada).toBeLessThan(media)
  })

  it('sem nenhum mês completo não há referência para dar', () => {
    expect(referenciaMensal(['2026-08'], (c) => valores[c], new Set(['2026-08']))).toBeNull()
    expect(referenciaMensal([], () => 0, new Set())).toBeNull()
  })
})
