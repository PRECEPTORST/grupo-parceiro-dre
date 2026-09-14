import { describe, it, expect } from 'vitest'
import { naturezaDeCfop, sufixoCfop, digitosCfop, cfopDeEntrada } from './cfop'

describe('leitura do código', () => {
  it('extrai dígitos e sufixo', () => {
    expect(digitosCfop('5.102')).toBe('5102')
    expect(sufixoCfop('6502')).toBe('502')
    expect(sufixoCfop('abc')).toBe('')
    expect(cfopDeEntrada('1202')).toBe(true)
    expect(cfopDeEntrada('5102')).toBe(false)
  })
})

describe('naturezaDeCfop — CFOPs reais da extração de 2026-08-21', () => {
  it('vendas (R$ 240M do faturamento real)', () => {
    for (const c of ['6502', '5502', '5106', '6106', '5102', '5117', '5922']) {
      expect(naturezaDeCfop(c, false), c).toBe('venda')
    }
  })

  it('remessa para armazém NÃO é venda (R$ 21,1M reais)', () => {
    for (const c of ['5905', '5934', '5909', '5927']) {
      expect(naturezaDeCfop(c, false), c).toBe('remessa')
    }
  })

  it('transferência entre estabelecimentos NÃO é venda (R$ 18,2M reais)', () => {
    for (const c of ['6152', '5152']) {
      expect(naturezaDeCfop(c, false), c).toBe('transferencia')
    }
  })

  it('devolução de venda entra reduzindo a receita (R$ 15,0M reais)', () => {
    for (const c of ['1202', '2202', '1204', '1504', '2504', '1503']) {
      expect(naturezaDeCfop(c, true), c).toBe('devolucao_venda')
    }
  })

  it('a MESMA família de CFOP muda de sentido conforme a direção', () => {
    expect(naturezaDeCfop('1202', true)).toBe('devolucao_venda') // cliente devolveu p/ nós
    expect(naturezaDeCfop('5202', false)).toBe('devolucao_compra') // devolvemos ao fornecedor
  })

  it('ajuste e desconhecido ficam fora do DRE', () => {
    expect(naturezaDeCfop('1949', true)).toBe('remessa') // 949 = outra entrada/ajuste
    expect(naturezaDeCfop('5999', false)).toBe('outro')
    expect(naturezaDeCfop('', false)).toBe('outro')
    expect(naturezaDeCfop(null, false)).toBe('outro')
  })

  it('CFOP de venda chegando como ENTRADA é COMPRA — nunca receita', () => {
    // 1102 é a contrapartida exata do 5102: mesma mercadoria, sentido oposto.
    // Enquanto isso caía em 'outro', o CPV do mês inteiro desaparecia.
    expect(naturezaDeCfop('1102', true)).toBe('compra')
    expect(naturezaDeCfop('2101', true)).toBe('compra')
    expect(naturezaDeCfop('1102', true)).not.toBe('venda')
  })
})

describe('remessa simbólica (5934) é remessa — a promoção a venda foi revertida', () => {
  it('5934 saindo NÃO é venda', () => {
    // Em 2026-09-14 eu o promovi a venda porque fechava o acumulado de 8 meses
    // em -0,1%. Onze meses desmentiram: base+5934 dá 23,7 pts de erro mensal,
    // base+6152-devolução dá 4,0. Um termo livre que ajusta um total não é prova.
    expect(naturezaDeCfop('5934', false)).toBe('remessa')
  })

  it('o retorno de armazém (1907) segue sendo remessa na natureza fiscal', () => {
    // Vira COMPRA só na convenção da filial (enokiDre), que é outra pergunta.
    expect(naturezaDeCfop('1907', true)).toBe('remessa')
  })
})
