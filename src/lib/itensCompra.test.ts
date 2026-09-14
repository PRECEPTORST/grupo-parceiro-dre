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

describe('emSacas — a unidade vem do PREÇO, porque o cadastro mente', () => {
  it('milho em quilos: preço na casa do real por kg', () => {
    expect(emSacas(item({ quantidade: 60_000, valorUnitario: 1.02 }), cadastro)).toBeCloseTo(1000, 0)
  })

  it('café do MESMO produto, duas unidades — decide pelo preço', () => {
    // O produto 5 é cadastrado como SC, e aparece nas notas das duas formas:
    // 30.000 a R$ 33,00 é QUILO (R$ 1.980/saca); 220,93 a R$ 1.625 é SACA.
    // Seguir o cadastro transformaria 30.000 kg em 30.000 sacas.
    const porQuilo = item({ idProduto: 5, produto: 'CAFÉ EM GRÃOS', quantidade: 30_000, valorUnitario: 33, valorTotal: 990_000 })
    const porSaca = item({ idProduto: 5, produto: 'CAFÉ EM GRÃOS', quantidade: 220.93, valorUnitario: 1625, valorTotal: 359_011.25 })
    expect(emSacas(porQuilo, cadastro)).toBeCloseTo(500, 0)
    expect(emSacas(porSaca, cadastro)).toBeCloseTo(220.93, 2)
  })

  it('sem preço unitário, o cadastro serve de desempate', () => {
    expect(emSacas(item({ quantidade: 60_000, valorUnitario: 0 }), cadastro)).toBe(1000)
    expect(emSacas(item({ idProduto: 5, produto: 'CAFÉ EM GRÃOS', quantidade: 500, valorUnitario: 0 }), cadastro)).toBe(500)
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

  it('retorno de armazém (1907) É entrada de estoque', () => {
    // Parecia que não: "o grão já era nosso". Mas em 20 meses a soja comprava
    // 2.203.640 sacas e vendia 2.348.549 — furo de 144.909 que nunca fechava.
    // Somando o retorno, o saldo fecha em -4.860 sacas (0,2%). A remessa PARA o
    // armazém não é contada como saída, então o retorno não pode ser ignorado
    // como entrada.
    const r = resumirCompras([item({ cfop: '1907', quantidade: 60_000 })], cadastro)
    expect(r.sacas['2026-08'].milho).toBeCloseTo(1000, 0)
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
