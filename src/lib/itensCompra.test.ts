import { describe, it, expect } from 'vitest'
import { resumirCompras, graoDoProduto, emSacas, type ItemCompra, type ProdutoCadastro } from './itensCompra'

const cadastro = new Map<number, ProdutoCadastro>([
  [2, { idProduto: 2, descricao: 'SOJA EM GRÃOS', unidade: 'KG', fatorSaca: 60 }],
  [3, { idProduto: 3, descricao: 'MILHO EM GRÃOS', unidade: 'KG', fatorSaca: 60 }],
  [5, { idProduto: 5, descricao: 'CAFÉ EM GRÃOS', unidade: 'SC', fatorSaca: 60 }],
])

const item = (over: Partial<ItemCompra> = {}): ItemCompra => ({
  dataEmissao: '2026-08-03',
  numeroNf: '5217',
  cfop: '1102',
  idProduto: 3,
  produto: 'MILHO EM GRÃOS',
  contrato: '159/26M',
  quantidade: 38010,
  valorUnitario: 1.03,
  valorTotal: 38960.25,
  ...over,
})

describe('graoDoProduto', () => {
  it('reconhece os quatro grãos, com e sem acento', () => {
    expect(graoDoProduto('MILHO EM GRÃOS')).toBe('milho')
    expect(graoDoProduto('SOJA BENEFICIADO')).toBe('soja')
    expect(graoDoProduto('CAFÉ EM GRÃOS -')).toBe('cafe')
    // O cadastro real tem "SORGO EM GÃOS" — erro de digitação que existe no ERP.
    expect(graoDoProduto('SORGO EM GÃOS')).toBe('sorgo')
  })

  it('o que não é grão devolve null', () => {
    expect(graoDoProduto('ESPONJA DE ACO')).toBeNull()
  })
})

describe('emSacas — a unidade vem do CADASTRO, não de chute', () => {
  it('KG divide pelo fator da saca', () => {
    expect(emSacas(item({ quantidade: 60_000 }), cadastro)).toBe(1000)
  })

  it('SC já está em sacas e NÃO é dividido', () => {
    // O café tem cadastro em SC; dividir por 60 daria 1/60 do volume real.
    expect(emSacas(item({ idProduto: 5, produto: 'CAFÉ EM GRÃOS', quantidade: 500 }), cadastro)).toBe(500)
  })

  it('produto fora do cadastro cai no fator 60, que é o do grão', () => {
    expect(emSacas(item({ idProduto: 999, quantidade: 60_000 }), cadastro)).toBe(1000)
  })
})

describe('resumirCompras', () => {
  it('soma sacas e valor por competência e grão', () => {
    const r = resumirCompras([item(), item({ quantidade: 60_000, valorTotal: 60_000 })], cadastro)
    expect(r.sacas['2026-08'].milho).toBeCloseTo(38010 / 60 + 1000, 2)
    expect(r.valor['2026-08'].milho).toBeCloseTo(98_960.25, 2)
  })

  it('devolução entra NEGATIVA — ela desfaz uma entrada', () => {
    const r = resumirCompras(
      [item({ quantidade: 60_000, valorTotal: 60_000 }), item({ cfop: '1202', quantidade: 6_000, valorTotal: 6_000 })],
      cadastro,
    )
    expect(r.sacas['2026-08'].milho).toBeCloseTo(900, 2)
    expect(r.valor['2026-08'].milho).toBeCloseTo(54_000, 2)
  })

  it('retorno de armazém (1907) NÃO é compra nova', () => {
    // O grão já era nosso; contá-lo dobraria o volume e derrubaria o custo médio.
    const r = resumirCompras([item({ cfop: '1907' })], cadastro)
    expect(r.sacas['2026-08']?.milho).toBeUndefined()
    expect(r.ignorados[0].motivo).toContain('1907')
  })

  it('nada some em silêncio — o ignorado sai com motivo e valor', () => {
    const r = resumirCompras(
      [item({ produto: 'ESPONJA DE ACO', idProduto: 21, valorTotal: 50 }), item({ cfop: '5949', valorTotal: 70 })],
      cadastro,
    )
    expect(r.ignorados.map((x) => x.motivo)).toEqual(
      expect.arrayContaining(['produto_nao_e_grao', 'cfop_5949_nao_e_aquisicao']),
    )
    expect(r.ignorados.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(120, 2)
  })

  it('separa competências diferentes', () => {
    const r = resumirCompras([item(), item({ dataEmissao: '2026-09-02' })], cadastro)
    expect(Object.keys(r.sacas).sort()).toEqual(['2026-08', '2026-09'])
  })
})
