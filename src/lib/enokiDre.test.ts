import { describe, it, expect } from 'vitest'
import {
  normalizarEnokiDre,
  sacasDeItem,
  graoDeProduto,
  unidadeDeProduto,
  raizCnpj,
  ehIntragrupo,
  ehVenda,
  ehCancelada,
  competenciasDeLancamentos,
  KG_POR_SACA,
  RAIZES_CNPJ_GRUPO,
} from './enokiDre'
import { montarDre } from './dre'
import { mapaEfetivo } from './planoContas'

// Fixtures espelhando a forma REAL da API (extração de 2026-08-21).
function nfVenda(over: Record<string, unknown> = {}) {
  return {
    idNf: 14621,
    numeroNf: 12285,
    dataEmissao: '2026-06-01T00:00:00-03:00',
    status: 'Finalizada',
    tipoOperacao: 'SAÍDA',
    finalidade: 'Normal',
    idEmpresa: 1,
    valorTotalNf: '88533.3332',
    destinatarioNome: 'CARGILL AGRICOLA S A',
    destinatarioCpfCnpj: '60498706000904',
    itens: [
      {
        idItem: 14791,
        produto: 'SOJA EM GRÃOS',
        quantidade: '40000.0000',
        valorUnitario: '2.2133333300',
        valorTotal: '88533.33320000000000',
      },
    ],
    ...over,
  }
}

function titulo(over: Record<string, unknown> = {}) {
  return {
    idItemLancamento: 65578,
    dataLancamento: '2026-06-10T00:00:00-03:00',
    dataVencimento: '2026-07-10T00:00:00-03:00',
    dataQuitacao: '2026-08-01T00:00:00-03:00',
    quitado: true,
    valor: '24487.9459',
    valorPago: '24487.9459',
    parceiroNome: 'JOÃO EMILIO ROCHETO',
    descricao: 'Fat. NFe entrada | Cont: 094/26M',
    centroCusto: 'COMPRA MILHO',
    idEmpresa: 1,
    ...over,
  }
}

describe('unidade por produto (armadilha #1)', () => {
  it('soja/milho/sorgo vêm em QUILOS → sacas = kg ÷ 60', () => {
    expect(unidadeDeProduto('SOJA EM GRÃOS')).toBe('kg')
    expect(sacasDeItem('SOJA EM GRÃOS', '36000')).toBeCloseTo(600, 6)
    expect(sacasDeItem('MILHO EM GRÃOS', 360000)).toBeCloseTo(6000, 6)
  })

  it('CAFÉ já vem em SACAS — não divide', () => {
    expect(unidadeDeProduto('CAFÉ EM GRÃOS')).toBe('saca')
    expect(sacasDeItem('CAFÉ EM GRÃOS', '250.0000')).toBeCloseTo(250, 6)
  })

  it('confere com o contrato real: milho R$ 1,3333/kg × 60 = R$ 80,00/saca', () => {
    const sacas = sacasDeItem('MILHO EM GRÃOS', 360000)
    const total = 360000 * 1.33333333
    expect(sacas).toBeCloseTo(6000, 4)
    expect(total / sacas).toBeCloseTo(80, 1)
  })

  it('produto que não é grão não gera saca', () => {
    expect(graoDeProduto('TONER / CILINDRO')).toBeNull()
    expect(sacasDeItem('TONER / CILINDRO', 1)).toBe(0)
  })

  it('KG_POR_SACA é 60', () => expect(KG_POR_SACA).toBe(60))
})

describe('typos de cadastro (armadilha #3)', () => {
  it('"SORGO EM GÃOS" e "MILHO EM GRAOS" são reconhecidos', () => {
    expect(graoDeProduto('SORGO EM GÃOS')).toBe('sorgo')
    expect(graoDeProduto('MILHO EM GRAOS')).toBe('milho')
    expect(graoDeProduto('CAFÉ EM GRÃOS')).toBe('cafe')
    expect(sacasDeItem('SORGO EM GÃOS', 6000)).toBeCloseTo(100, 6)
  })
})

describe('intragrupo (armadilha #2)', () => {
  it('raizCnpj pega os 8 primeiros dígitos só de CNPJ', () => {
    expect(raizCnpj('30798330000216')).toBe('30798330')
    expect(raizCnpj('01690616806')).toBe('') // CPF, não CNPJ
    expect(raizCnpj(null)).toBe('')
  })

  it('reconhece as empresas do grupo', () => {
    expect(ehIntragrupo('30798330000135', RAIZES_CNPJ_GRUPO)).toBe(true)
    expect(ehIntragrupo('60498706000904', RAIZES_CNPJ_GRUPO)).toBe(false)
  })

  it('venda para outra empresa do grupo NÃO vira receita', () => {
    const r = normalizarEnokiDre({
      nfs: [nfVenda(), nfVenda({ idNf: 999, destinatarioCpfCnpj: '30798330000135' })],
    })
    expect(r.lancamentos).toHaveLength(1)
    expect(r.descartes.find((d) => d.motivo === 'nf_intragrupo')?.quantidade).toBe(1)
  })
})

describe('notas que não são venda (armadilha #4)', () => {
  it('cancelada, de entrada e de ajuste são descartadas', () => {
    expect(ehCancelada(nfVenda({ status: 'Cancelada' }))).toBe(true)
    expect(ehVenda(nfVenda({ tipoOperacao: 'ENTRADA' }))).toBe(false)
    expect(ehVenda(nfVenda({ finalidade: 'Ajuste' }))).toBe(false)
    expect(ehVenda(nfVenda({ finalidade: 'Devolução/Retorno' }))).toBe(false)
    expect(ehVenda(nfVenda())).toBe(true)
    expect(ehVenda(nfVenda({ finalidade: 'Complementar' }))).toBe(true)
  })

  it('item de crédito de ICMS não vira receita', () => {
    const r = normalizarEnokiDre({
      nfs: [
        nfVenda({
          itens: [
            { idItem: 1, produto: 'CREDITO ICMS RECEBIDO EM TRANSFERENCIA', quantidade: '0', valorTotal: '0' },
          ],
        }),
      ],
    })
    expect(r.lancamentos).toHaveLength(0)
    expect(r.descartes.some((d) => d.motivo === 'nf_ajuste_fiscal')).toBe(true)
  })
})

describe('receita bruta a partir da NF', () => {
  it('cada item vira lançamento na conta de venda do grão, na data de EMISSÃO', () => {
    const r = normalizarEnokiDre({ nfs: [nfVenda()] })
    expect(r.lancamentos).toHaveLength(1)
    const l = r.lancamentos[0]
    expect(l.contaSafragold).toBe('3.1.01') // venda de soja
    expect(l.data).toBe('2026-06-01')
    expect(l.valor).toBeCloseTo(88533.33, 2)
    expect(l.origem).toBe('enoki')
    expect(l.historico).toContain('CARGILL')
  })

  it('acumula sacas por competência e grão', () => {
    const r = normalizarEnokiDre({
      nfs: [
        nfVenda(),
        nfVenda({
          idNf: 2,
          itens: [{ idItem: 9, produto: 'CAFÉ EM GRÃOS', quantidade: '250', valorTotal: '420000' }],
        }),
      ],
    })
    expect(r.sacas['2026-06'].soja).toBeCloseTo(40000 / 60, 2)
    expect(r.sacas['2026-06'].cafe).toBeCloseTo(250, 2)
  })

  it('produto que não é grão cai em outras receitas', () => {
    const r = normalizarEnokiDre({
      nfs: [nfVenda({ itens: [{ idItem: 5, produto: 'TONER / CILINDRO', quantidade: '1', valorTotal: '29.41' }] })],
    })
    expect(r.lancamentos[0].contaSafragold).toBe('3.4.02')
  })
})

describe('títulos → competência pela dataLancamento', () => {
  it('usa a data do LANÇAMENTO, não a da quitação', () => {
    const r = normalizarEnokiDre({ pagar: [titulo()] })
    expect(r.lancamentos[0].data).toBe('2026-06-10') // não 2026-08-01
    expect(r.lancamentos[0].contaSafragold).toBe('4.1.02')
    expect(r.lancamentos[0].valor).toBeCloseTo(24487.95, 2)
  })

  it('título a receber de RECEITA de grão é ignorado (evita dupla contagem)', () => {
    const r = normalizarEnokiDre({
      receber: [titulo({ centroCusto: 'RECEITA SOJA - MERCADO INTERNO', valor: '1000' })],
    })
    expect(r.lancamentos).toHaveLength(0)
    expect(r.descartes.find((d) => d.motivo === 'receita_vem_da_nf')?.valor).toBeCloseTo(1000, 2)
  })

  it('estorno entra com valor NEGATIVO', () => {
    const r = normalizarEnokiDre({
      receber: [titulo({ centroCusto: 'COMPRA SOJA', valor: '500' })],
    })
    expect(r.lancamentos[0].valor).toBeCloseTo(-500, 2)
    expect(r.lancamentos[0].contaSafragold).toBe('4.1.01')
  })

  it('centro de custo desconhecido vira RESÍDUO (não some)', () => {
    const r = normalizarEnokiDre({
      pagar: [
        titulo({ centroCusto: 'SEM CC', valor: '300', descricao: 'Pagamento diverso' }),
        titulo({ idItemLancamento: 2, centroCusto: '', valor: '200' }),
      ],
    })
    expect(r.lancamentos).toHaveLength(0)
    const residuo = r.residuos.find((x) => x.centroCusto === 'SEM CC')!
    expect(residuo.quantidade).toBe(2)
    expect(residuo.valor).toBeCloseTo(500, 2)
    expect(residuo.amostras.length).toBeGreaterThan(0)
  })

  it('descarta data inválida e valor zero', () => {
    const r = normalizarEnokiDre({
      pagar: [titulo({ dataLancamento: null, dataVencimento: null }), titulo({ idItemLancamento: 3, valor: '0' })],
    })
    expect(r.lancamentos).toHaveLength(0)
    expect(r.descartes.some((d) => d.motivo === 'data_invalida')).toBe(true)
    expect(r.descartes.some((d) => d.motivo === 'valor_zero')).toBe(true)
  })
})

describe('deduplicação', () => {
  it('o mesmo título repetido na borda da paginação entra uma vez só', () => {
    const r = normalizarEnokiDre({ pagar: [titulo(), titulo()] })
    expect(r.lancamentos).toHaveLength(1)
  })
})

describe('integração com o motor do DRE', () => {
  it('os lançamentos montam um DRE coerente', () => {
    const r = normalizarEnokiDre({
      nfs: [nfVenda()], // receita 88.533,33 (soja)
      pagar: [
        titulo({ centroCusto: 'COMPRA SOJA', valor: '60000' }), // CPV
        titulo({ idItemLancamento: 2, centroCusto: 'FRETE', valor: '5000' }), // CPV
        titulo({ idItemLancamento: 3, centroCusto: 'RECEITA SOJA - MERCADO INTERNO', valor: '1000' }), // devolução
        titulo({ idItemLancamento: 4, centroCusto: 'MATERIAL DE ESCRITORIO', valor: '500' }), // adm
        titulo({ idItemLancamento: 5, centroCusto: 'IMOBILIZADO', valor: '9000' }), // capex
      ],
    })
    const dre = montarDre('2026-06', r.lancamentos, mapaEfetivo([]))
    const linha = (nome: string) => dre.linhas.find((l) => l.linha === nome)!.realizado

    expect(linha('receita_bruta')).toBeCloseTo(88533.33, 2)
    expect(linha('deducoes')).toBeCloseTo(1000, 2)
    expect(linha('custo_produto')).toBeCloseTo(65000, 2)
    expect(linha('despesas_administrativas')).toBeCloseTo(500, 2)
    expect(linha('investimentos')).toBeCloseTo(9000, 2)

    // Receita líquida = 88.533,33 − 1.000; lucro bruto = − 65.000.
    expect(dre.realizado.receitaLiquida).toBeCloseTo(87533.33, 2)
    expect(dre.realizado.lucroBruto).toBeCloseTo(22533.33, 2)
    expect(dre.realizado.resultadoLiquido).toBeCloseTo(22033.33, 2)
    // Capex fica ABAIXO do resultado (§19).
    expect(dre.realizado.resultadoAposInvestimentos).toBeCloseTo(13033.33, 2)
    expect(dre.naoClassificadas).toHaveLength(0)
  })

  it('estorno reduz a conta no DRE', () => {
    const r = normalizarEnokiDre({
      pagar: [titulo({ centroCusto: 'COMPRA SOJA', valor: '10000' })],
      receber: [titulo({ idItemLancamento: 77, centroCusto: 'COMPRA SOJA', valor: '2500' })],
    })
    const dre = montarDre('2026-06', r.lancamentos, mapaEfetivo([]))
    expect(dre.linhas.find((l) => l.linha === 'custo_produto')!.realizado).toBeCloseTo(7500, 2)
  })
})

describe('competenciasDeLancamentos', () => {
  it('lista as competências em ordem, sem repetir', () => {
    const r = normalizarEnokiDre({
      nfs: [nfVenda(), nfVenda({ idNf: 3, dataEmissao: '2026-04-15T00:00:00-03:00' })],
    })
    expect(competenciasDeLancamentos(r.lancamentos)).toEqual(['2026-04', '2026-06'])
  })
})
