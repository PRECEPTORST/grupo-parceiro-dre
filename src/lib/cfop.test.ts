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

  it('remessa FÍSICA para armazém NÃO é venda (R$ 21,1M reais)', () => {
    // O 5934 saiu desta lista: ele é remessa SIMBÓLICA, e simbólica quer dizer
    // que o grão não se move — quem muda é o dono. Ver o teste abaixo.
    for (const c of ['5905', '5909', '5927']) {
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

describe('remessa simbólica (5934) é venda, remessa física (5905) não é', () => {
  it('5934 saindo é VENDA', () => {
    // "Simbólica" quer dizer que o grão não se move: quem muda é o dono. São
    // R$ 9,11M em 2026 na filial MG, e sem eles a receita de 8 meses fica 4,3%
    // abaixo da planilha do cliente; com eles, 0,1%.
    expect(naturezaDeCfop('5934', false)).toBe('venda')
    expect(naturezaDeCfop('6934', false)).toBe('venda')
  })

  it('5905 continua remessa — ali o grão sai e volta, e o dono é o mesmo', () => {
    expect(naturezaDeCfop('5905', false)).toBe('remessa')
  })

  it('1934 entrando é compra, por simetria', () => {
    expect(naturezaDeCfop('1934', true)).toBe('compra')
  })

  it('o retorno de armazém (1907) segue sendo remessa na natureza fiscal', () => {
    // Ele conta como ENTRADA DE ESTOQUE (ver itensCompra.ts), que é outra
    // pergunta: volume físico, não natureza do documento.
    expect(naturezaDeCfop('1907', true)).toBe('remessa')
  })
})
