import { describe, it, expect } from 'vitest'
import {
  fonteDreDe,
  lancamentosDaFonte,
  sacasDaFonte,
  origemDe,
  estadoDreVazio,
  type EstadoDre,
  type LancamentoCanonico,
} from './tipos'

function lanc(id: string, origem?: LancamentoCanonico['origem']): LancamentoCanonico {
  return { id, data: '2026-06-30', contaSafragold: '3.1.01', historico: id, valor: 100, origem }
}

function estado(over: Partial<EstadoDre> = {}): EstadoDre {
  return { ...estadoDreVazio(), ...over }
}

describe('origemDe', () => {
  it('lançamento sem origem é tratado como planilha (retrocompatível)', () => {
    expect(origemDe(lanc('a'))).toBe('planilha')
    expect(origemDe(lanc('b', 'enoki'))).toBe('enoki')
    expect(origemDe(lanc('c', 'manual'))).toBe('manual')
  })
})

describe('fonteDreDe', () => {
  it('ausente = planilha', () => {
    expect(fonteDreDe(estado())).toBe('planilha')
    expect(fonteDreDe(estado({ fonteDre: 'enoki' }))).toBe('enoki')
  })
})

describe('lancamentosDaFonte', () => {
  const e = estado({
    lancamentos: [lanc('planilha-1')],
    lancamentosEnoki: [lanc('enoki-1', 'enoki'), lanc('enoki-2', 'enoki')],
  })

  it('nunca soma as duas fontes (isso seria dupla contagem)', () => {
    expect(lancamentosDaFonte({ ...e, fonteDre: 'planilha' }).map((l) => l.id)).toEqual(['planilha-1'])
    expect(lancamentosDaFonte({ ...e, fonteDre: 'enoki' }).map((l) => l.id)).toEqual(['enoki-1', 'enoki-2'])
  })

  it('fonte Enoki sem carga devolve lista vazia, não a planilha', () => {
    const semEnoki = estado({ lancamentos: [lanc('planilha-1')], fonteDre: 'enoki' })
    expect(lancamentosDaFonte(semEnoki)).toEqual([])
  })
})

describe('sacasDaFonte', () => {
  const base = estado({
    sacas: { '2026-06': { soja: 999 } },
    sacasEnoki: { '2026-06': { soja: 100, milho: 200 }, '2026-07': { milho: 50 } },
  })

  it('na planilha usa só o que foi digitado', () => {
    expect(sacasDaFonte({ ...base, fonteDre: 'planilha' })).toEqual({ '2026-06': { soja: 999 } })
  })

  it('na Enoki o valor digitado à mão VENCE o automático', () => {
    const r = sacasDaFonte({ ...base, fonteDre: 'enoki' })
    expect(r['2026-06'].soja).toBe(999) // manual vence
    expect(r['2026-06'].milho).toBe(200) // automático preenche o resto
    expect(r['2026-07'].milho).toBe(50)
  })

  it('funciona sem nenhuma das duas', () => {
    expect(sacasDaFonte(estado({ fonteDre: 'enoki' }))).toEqual({})
  })
})
