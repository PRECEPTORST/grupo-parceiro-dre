import { describe, it, expect } from 'vitest'
import {
  parseCompetenciaCabecalho,
  analisarMatriz,
  ultimoDiaDoMes,
  chaveConta,
  type Matriz,
} from './importarDre'

describe('parseCompetenciaCabecalho', () => {
  it('lê nome do mês + ano', () => {
    expect(parseCompetenciaCabecalho('JANEIRO 2026')).toBe('2026-01')
    expect(parseCompetenciaCabecalho('março 2026')).toBe('2026-03')
    expect(parseCompetenciaCabecalho('jan/26')).toBe('2026-01')
    expect(parseCompetenciaCabecalho('Dez-2025')).toBe('2025-12')
  })
  it('lê formatos numéricos', () => {
    expect(parseCompetenciaCabecalho('2026-02')).toBe('2026-02')
    expect(parseCompetenciaCabecalho('03/2026')).toBe('2026-03')
  })
  it('rejeita o que não é mês', () => {
    expect(parseCompetenciaCabecalho('RECEITA')).toBeNull()
    expect(parseCompetenciaCabecalho('')).toBeNull()
    expect(parseCompetenciaCabecalho(null)).toBeNull()
    expect(parseCompetenciaCabecalho(1240)).toBeNull()
  })
})

describe('ultimoDiaDoMes', () => {
  it('resolve o último dia', () => {
    expect(ultimoDiaDoMes('2026-01')).toBe('2026-01-31')
    expect(ultimoDiaDoMes('2026-02')).toBe('2026-02-28')
    expect(ultimoDiaDoMes('2026-04')).toBe('2026-04-30')
  })
})

describe('analisarMatriz', () => {
  // Planilha no estilo da DRE gerencial do cliente: cabeçalho com meses, contas,
  // subtotais e uma linha de resultado. Números já vêm como number (SheetJS).
  const matriz: Matriz = [
    ['DRE GERENCIAL', null, null, null],
    [null, 'JANEIRO 2026', 'FEVEREIRO 2026', 'MARÇO 2026'],
    ['RECEITA BRUTA', 1_000_000, 1_200_000, 1_500_000],
    ['COMPRA DE CEREAIS', 900_000, 1_050_000, 1_300_000],
    ['LUCRO BRUTO', 100_000, 150_000, 200_000], // subtotal
    ['SALÁRIOS', 30_000, 32_000, 31_000],
    ['REVERSÃO DESPESAS', 0, 0, -400], // valor negativo preservado
    ['MARGEM ================>', 0.1, 0.12, 0.13], // subtotal/percentual
    ['LUCRO/PREJUÍZO', 70_000, 118_000, 169_000], // linha de resultado
    ['LINHA VAZIA', null, null, null], // sem valor → ignorada
  ]
  const a = analisarMatriz(matriz)

  it('detecta as 3 competências na ordem', () => {
    expect(a.meses.map((m) => m.competencia)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(a.linhaCabecalho).toBe(1)
  })

  it('extrai as contas com valores (ignora linha sem número)', () => {
    const labels = a.linhas.map((l) => l.label)
    expect(labels).toContain('RECEITA BRUTA')
    expect(labels).toContain('SALÁRIOS')
    expect(labels).not.toContain('LINHA VAZIA')
  })

  it('preserva o sinal do valor', () => {
    const rev = a.linhas.find((l) => l.label === 'REVERSÃO DESPESAS')
    expect(rev?.valores['2026-03']).toBe(-400)
    expect(rev?.total).toBe(400)
  })

  it('sinaliza subtotais e a linha de resultado', () => {
    expect(a.linhas.find((l) => l.label === 'LUCRO BRUTO')?.ehSubtotal).toBe(true)
    expect(a.linhas.find((l) => l.label.startsWith('MARGEM'))?.ehSubtotal).toBe(true)
    const res = a.linhas.find((l) => l.label === 'LUCRO/PREJUÍZO')
    expect(res?.ehResultado).toBe(true)
    expect(res?.ehSubtotal).toBe(true)
    // Conta comum não é subtotal nem resultado.
    const sal = a.linhas.find((l) => l.label === 'SALÁRIOS')
    expect(sal?.ehSubtotal).toBe(false)
    expect(sal?.ehResultado).toBe(false)
  })

  it('lê valores em texto (padrão BR) quando a célula não é número', () => {
    const m2: Matriz = [
      ['', 'jan/2026'],
      ['FRETE', 'R$ 1.234,56'],
    ]
    const r = analisarMatriz(m2)
    expect(r.linhas[0].valores['2026-01']).toBeCloseTo(1234.56, 2)
  })

  it('descarta a repetição do cabeçalho como se fosse conta', () => {
    // Uma 2ª linha de cabeçalho (só nomes de mês) não tem número → não vira conta.
    const m3: Matriz = [
      ['', 'JANEIRO 2026', 'FEVEREIRO 2026'],
      ['SALÁRIOS', 10, 20],
      ['DESPESAS', 'JANEIRO 2026', 'FEVEREIRO 2026'], // repetição do cabeçalho
    ]
    const r = analisarMatriz(m3)
    expect(r.linhas.map((l) => l.label)).toEqual(['SALÁRIOS'])
  })
})

describe('chaveConta', () => {
  it('normaliza espaços', () => {
    expect(chaveConta('  COMPRA   DE  CEREAIS ')).toBe('COMPRA DE CEREAIS')
  })
})
