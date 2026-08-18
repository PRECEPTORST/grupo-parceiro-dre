import { describe, it, expect } from 'vitest'
import { paraMovimento, normalizarMovimentos, numeroEnoki, DATA_MIGRACAO } from './enoki'

const receb = {
  idItemLancamento: 18,
  quitado: true,
  dataQuitacao: '2026-08-19T00:00:00-03:00',
  dataVencimento: '2026-08-15T00:00:00-03:00',
  valor: '40161.5498',
  valorPago: '40161.5498',
  parceiroNome: 'FOX AGRONEGOCIO LTDA ',
  centroCusto: 'RECEITA SORGO - MERCADO INTERNO',
}

describe('numeroEnoki', () => {
  it('lê string, number e vírgula', () => {
    expect(numeroEnoki('40161.5498')).toBeCloseTo(40161.55, 2)
    expect(numeroEnoki("1234,56")).toBeCloseTo(1234.56, 2)
    expect(numeroEnoki(10)).toBe(10)
    expect(numeroEnoki(null)).toBe(0)
  })
})

describe('paraMovimento', () => {
  it('quitado → data de quitação e valorPago', () => {
    const m = paraMovimento(receb, 'entrada')!
    expect(m.data).toBe('2026-08-19')
    expect(m.tipo).toBe('entrada')
    expect(m.valor).toBeCloseTo(40161.55, 2)
    expect(m.descricao).toContain('FOX')
  })

  it('em aberto → data de vencimento e valor de face', () => {
    const m = paraMovimento({ ...receb, quitado: false, dataQuitacao: null }, 'entrada')!
    expect(m.data).toBe('2026-08-15')
    expect(m.valor).toBeCloseTo(40161.55, 2)
  })

  it('descarta o lote de abertura de saldo (migração)', () => {
    expect(paraMovimento({ ...receb, dataQuitacao: `${DATA_MIGRACAO}T00:00:00-03:00` }, 'entrada')).toBeNull()
  })

  it('descarta valor zero e data inválida', () => {
    expect(paraMovimento({ ...receb, quitado: false, dataVencimento: null }, 'entrada')).toBeNull()
    expect(paraMovimento({ ...receb, valorPago: '0', valor: '0' }, 'entrada')).toBeNull()
  })

  it('pagamento vira saída', () => {
    expect(paraMovimento(receb, 'saida')!.tipo).toBe('saida')
  })
})

describe('normalizarMovimentos', () => {
  it('mapeia o lote e deduplica por id', () => {
    const out = normalizarMovimentos([receb, receb, { ...receb, idItemLancamento: 19 }], 'entrada')
    expect(out).toHaveLength(2)
    expect(out.every((m) => m.tipo === 'entrada' && m.valor > 0)).toBe(true)
  })
})
