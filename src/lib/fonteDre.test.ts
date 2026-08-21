import { describe, it, expect } from 'vitest'
import {
  fonteDreDe,
  lancamentosDaFonte,
  sacasDaFonte,
  origemDe,
  mapaRegrasEnoki,
  mesclarManuais,
  idLancamentoManual,
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

describe('mapaRegrasEnoki', () => {
  it('vira um mapa chave → conta', () => {
    expect(
      mapaRegrasEnoki([
        { chave: 'SICOOB', conta: '4.4.03', confianca: 0.9, justificativa: '', origem: 'ia' },
        { chave: 'COPASA', conta: '4.3.09', confianca: 0.95, justificativa: '', origem: 'manual' },
      ]),
    ).toEqual({ SICOOB: '4.4.03', COPASA: '4.3.09' })
  })

  it('ignora regra incompleta e lista ausente', () => {
    expect(mapaRegrasEnoki(undefined)).toEqual({})
    expect(
      mapaRegrasEnoki([{ chave: '', conta: '4.4.03', confianca: 1, justificativa: '', origem: 'ia' }]),
    ).toEqual({})
  })
})

describe('mesclarManuais (item 2.4)', () => {
  const planilha = [
    { ...lanc('p-folha'), contaSafragold: '4.3.01', data: '2026-06-30', valor: 100 },
    { ...lanc('p-outro'), contaSafragold: '4.3.05', data: '2026-06-30', valor: 50 },
  ]
  const manuais = [
    { ...lanc('m-folha', 'manual'), contaSafragold: '4.3.01', data: '2026-06-30', valor: 120 },
  ]

  it('o manual SUBSTITUI a planilha na mesma conta e competência (não soma)', () => {
    const r = mesclarManuais(planilha, manuais)
    expect(r.map((x) => x.id).sort()).toEqual(['m-folha', 'p-outro'])
    expect(r.find((x) => x.contaSafragold === '4.3.01')!.valor).toBe(120)
  })

  it('mesma conta em OUTRA competência convive', () => {
    const outroMes = [
      { ...lanc('m-folha-jul', 'manual'), contaSafragold: '4.3.01', data: '2026-07-31', valor: 130 },
    ]
    const r = mesclarManuais(planilha, outroMes)
    expect(r).toHaveLength(3)
  })

  it('valor zero não entra', () => {
    const r = mesclarManuais(planilha, [
      { ...lanc('m-zero', 'manual'), contaSafragold: '4.5.01', data: '2026-06-30', valor: 0 },
    ])
    expect(r.map((x) => x.id)).not.toContain('m-zero')
  })

  it('sem manuais devolve a planilha intacta', () => {
    expect(mesclarManuais(planilha, undefined)).toBe(planilha)
    expect(mesclarManuais(planilha, [])).toBe(planilha)
  })

  it('idLancamentoManual é determinístico', () => {
    expect(idLancamentoManual('4.3.01', '2026-06')).toBe('manual-4.3.01-2026-06')
  })

  it('lancamentosDaFonte na planilha já traz os manuais', () => {
    const e = estado({ lancamentos: planilha, lancamentosManuais: manuais, fonteDre: 'planilha' })
    const r = lancamentosDaFonte(e)
    expect(r.find((x) => x.contaSafragold === '4.3.01')!.valor).toBe(120)
  })
})
