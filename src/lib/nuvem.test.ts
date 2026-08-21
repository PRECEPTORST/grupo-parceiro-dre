import { describe, it, expect } from 'vitest'
import { separarFatiaEnoki, juntarFatiaEnoki, CAMPOS_ENOKI } from './nuvem'
import { estadoDreVazio, type EstadoDre, type LancamentoCanonico } from './tipos'

function lanc(id: string, origem?: LancamentoCanonico['origem']): LancamentoCanonico {
  return { id, data: '2026-06-30', contaSafragold: '3.1.01', historico: id, valor: 100, origem }
}

const completo: EstadoDre = {
  ...estadoDreVazio(),
  lancamentos: [lanc('planilha-1')],
  lancamentosEnoki: [lanc('enoki-1', 'enoki'), lanc('enoki-2', 'enoki')],
  sacasEnoki: { '2026-06': { soja: 100 } },
  enokiSync: {
    atualizadoEm: '2026-06-30T12:00:00.000Z',
    de: '2026-01-01',
    ate: '2026-06-30',
    registros: 10,
    lancamentos: 2,
    homologacao: true,
    completo: true,
    residuos: [],
    descartes: [],
  },
  fonteDre: 'enoki',
}

describe('separarFatiaEnoki', () => {
  it('o documento LEVE não leva nenhum campo pesado', () => {
    const { leve } = separarFatiaEnoki(completo)
    for (const campo of CAMPOS_ENOKI) {
      expect(campo in leve, campo).toBe(false)
    }
  })

  it('o leve preserva todo o resto', () => {
    const { leve } = separarFatiaEnoki(completo)
    expect(leve.lancamentos).toHaveLength(1)
    expect(leve.fonteDre).toBe('enoki')
  })

  it('a fatia leva os três campos pesados', () => {
    const { enoki } = separarFatiaEnoki(completo)
    expect(enoki.lancamentosEnoki).toHaveLength(2)
    expect(enoki.sacasEnoki?.['2026-06'].soja).toBe(100)
    expect(enoki.enokiSync?.lancamentos).toBe(2)
  })

  it('não muta o estado original', () => {
    separarFatiaEnoki(completo)
    expect(completo.lancamentosEnoki).toHaveLength(2)
  })

  it('estado sem Enoki gera fatia vazia, não quebra', () => {
    const { leve, enoki } = separarFatiaEnoki({ ...estadoDreVazio(), lancamentos: [lanc('a')] })
    expect(enoki.lancamentosEnoki).toEqual([])
    expect(leve.lancamentos).toHaveLength(1)
  })
})

describe('juntarFatiaEnoki', () => {
  it('separar e juntar é ida e volta fiel', () => {
    const { leve, enoki } = separarFatiaEnoki(completo)
    expect(juntarFatiaEnoki(leve, enoki)).toEqual(completo)
  })

  it('sem fatia devolve o leve intacto (usuário sem permissão de ler a Enoki)', () => {
    const { leve } = separarFatiaEnoki(completo)
    expect(juntarFatiaEnoki(leve, null)).toBe(leve)
  })

  it('fatia vazia não injeta campos vazios', () => {
    const { leve } = separarFatiaEnoki(completo)
    const r = juntarFatiaEnoki(leve, { lancamentosEnoki: [] })
    expect(r.lancamentosEnoki).toBeUndefined()
  })
})
