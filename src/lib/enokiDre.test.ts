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
  ehAutorizada,
  competenciasDeLancamentos,
  KG_POR_SACA,
  RAIZES_CNPJ_GRUPO,
  CONTA_SEM_DETALHE_COMPRA,
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
    statusNfe: 'Enviada',
    tipoOperacao: 'SAÍDA',
    finalidade: 'Normal',
    cfop: '6502', // venda com fim específico de exportação (o CFOP dominante real)
    idEmpresa: 1,
    valorTotalNf: '88533.3332',
    destinatarioNome: 'CARGILL AGRICOLA S A',
    destinatarioCpfCnpj: '60498706000904',
    itens: [
      {
        idItem: 14791,
        produto: 'SOJA EM GRÃOS',
        quantidade: '40000.0000',
        valorUnitario: '2.2133333300', // R$/kg → 40.000 kg = 666,67 sacas
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
    descricao: 'Material de escritório | Cont: 094/26M',
    // Default deliberado: uma despesa que NUNCA vem de nota fiscal, e portanto
    // nunca vai virar caso de "ignorar, o valor vem da nota". Grão e frete já
    // migraram para a nota; um teste de data ou de deduplicação apoiado neles
    // passaria a exercitar o caminho do descarte sem que ninguém percebesse.
    centroCusto: 'MATERIAL DE ESCRITORIO',
    idEmpresa: 1,
    ...over,
  }
}

describe('unidade inferida pelo preço unitário (armadilha #1)', () => {
  it('quilos: preço unitário na casa dos reais', () => {
    expect(unidadeDeProduto('SOJA EM GRÃOS', 2.3967)).toBe('kg')
    expect(sacasDeItem('SOJA EM GRÃOS', '36000', 2.3967)).toBeCloseTo(600, 6)
    expect(sacasDeItem('MILHO EM GRÃOS', 360000, 1.3333)).toBeCloseTo(6000, 6)
  })

  it('TONELADAS: mesma soja, preço unitário na casa dos milhares', () => {
    // Caso REAL que estava sendo contado como quilo e subcontava 1000x:
    // 39,97 ton × R$ 2.175/ton = R$ 86.934,75 → 666,17 sacas a R$ 130,50.
    expect(unidadeDeProduto('SOJA EM GRÃOS', 2175)).toBe('tonelada')
    const sacas = sacasDeItem('SOJA EM GRÃOS', 39.97, 2175)
    expect(sacas).toBeCloseTo(666.17, 1)
    expect((39.97 * 2175) / sacas).toBeCloseTo(130.5, 1)
  })

  it('CAFÉ em sacas: preço unitário já é o preço da saca', () => {
    expect(unidadeDeProduto('CAFÉ EM GRÃOS', 1680)).toBe('saca')
    expect(sacasDeItem('CAFÉ EM GRÃOS', '250.0000', 1680)).toBeCloseTo(250, 6)
  })

  it('café por TONELADA não é confundido com café por saca', () => {
    expect(unidadeDeProduto('CAFÉ EM GRÃOS', 28000)).toBe('tonelada')
    expect(sacasDeItem('CAFÉ EM GRÃOS', 1, 28000)).toBeCloseTo(1000 / 60, 4)
  })

  it('as três unidades levam ao MESMO preço por saca — é isso que valida a regra', () => {
    const casos: [string, number, number][] = [
      ['SOJA EM GRÃOS', 36000, 2.3967], // kg
      ['SOJA EM GRÃOS', 36, 2396.7], // tonelada
      ['SOJA EM GRÃOS', 600, 143.8], // saca
    ]
    for (const [produto, qtd, vu] of casos) {
      const sacas = sacasDeItem(produto, qtd, vu)
      expect(sacas, `${produto} ${qtd}`).toBeCloseTo(600, 0)
      expect((qtd * vu) / sacas).toBeCloseTo(143.8, 0)
    }
  })

  it('confere com o contrato real: milho R$ 1,3333/kg × 60 = R$ 80,00/saca', () => {
    const sacas = sacasDeItem('MILHO EM GRÃOS', 360000, 1.3333333)
    const total = 360000 * 1.33333333
    expect(sacas).toBeCloseTo(6000, 4)
    expect(total / sacas).toBeCloseTo(80, 1)
  })

  it('sem preço unitário cai no padrão histórico (café em saca, resto em quilo)', () => {
    expect(unidadeDeProduto('SOJA EM GRÃOS')).toBe('kg')
    expect(unidadeDeProduto('CAFÉ EM GRÃOS')).toBe('saca')
  })

  it('preço fora de qualquer faixa plausível cai no padrão, não inventa', () => {
    expect(unidadeDeProduto('SOJA EM GRÃOS', 0.0001)).toBe('kg')
  })

  it('produto que não é grão não gera saca', () => {
    expect(graoDeProduto('TONER / CILINDRO')).toBeNull()
    expect(sacasDeItem('TONER / CILINDRO', 1, 1950)).toBe(0)
  })

  it('KG_POR_SACA é 60', () => expect(KG_POR_SACA).toBe(60))
})

describe('typos de cadastro (armadilha #3)', () => {
  it('"SORGO EM GÃOS" e "MILHO EM GRAOS" são reconhecidos', () => {
    expect(graoDeProduto('SORGO EM GÃOS')).toBe('sorgo')
    expect(graoDeProduto('MILHO EM GRAOS')).toBe('milho')
    expect(graoDeProduto('CAFÉ EM GRÃOS')).toBe('cafe')
    expect(sacasDeItem('SORGO EM GÃOS', 6000, 1.05)).toBeCloseTo(100, 6)
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
    expect(ehVenda(nfVenda({ tipoOperacao: 'ENTRADA', cfop: '1202' }))).toBe(false)
    expect(ehVenda(nfVenda({ finalidade: 'Ajuste' }))).toBe(false)
    expect(ehVenda(nfVenda())).toBe(true)
    expect(ehVenda(nfVenda({ finalidade: 'Complementar' }))).toBe(true)
  })

  it('remessa para armazém e transferência NÃO são venda (item 2.3)', () => {
    expect(ehVenda(nfVenda({ cfop: '5905' }))).toBe(false) // remessa p/ armazém geral
    expect(ehVenda(nfVenda({ cfop: '5934' }))).toBe(false) // remessa simbólica
    expect(ehVenda(nfVenda({ cfop: '6152' }))).toBe(false) // transferência
    const r = normalizarEnokiDre({
      nfs: [nfVenda({ cfop: '5905' }), nfVenda({ idNf: 2, cfop: '6152' })],
    })
    expect(r.lancamentos).toHaveLength(0)
    expect(r.descartes.some((d) => d.motivo === 'nf_remessa')).toBe(true)
    expect(r.descartes.some((d) => d.motivo === 'nf_transferencia')).toBe(true)
  })

  it('CFOP desconhecido NÃO vira receita por omissão', () => {
    const r = normalizarEnokiDre({ nfs: [nfVenda({ cfop: '5999' })] })
    expect(r.lancamentos).toHaveLength(0)
    expect(r.descartes.some((d) => d.motivo === 'nf_outra_operacao')).toBe(true)
  })

  it('devolução de VENDA reduz receita e devolve as sacas', () => {
    const r = normalizarEnokiDre({
      nfs: [
        nfVenda(), // venda 88.533,33 / 666,67 sacas
        nfVenda({
          idNf: 7,
          tipoOperacao: 'ENTRADA',
          finalidade: 'Devolução/Retorno',
          cfop: '1202',
          itens: [{ idItem: 70, produto: 'SOJA EM GRÃOS', quantidade: '6000', valorTotal: '13000' }],
        }),
      ],
    })
    const devolucao = r.lancamentos.find((l) => l.contaSafragold === '3.2.06')!
    expect(devolucao.valor).toBeCloseTo(13_000, 2)
    // 40.000 kg vendidos − 6.000 kg devolvidos = 34.000 kg ÷ 60.
    expect(r.sacas['2026-06'].soja).toBeCloseTo(34_000 / 60, 2)
  })

  it('devolução de COMPRA reduz o CPV (valor negativo)', () => {
    const r = normalizarEnokiDre({
      nfs: [
        nfVenda({
          idNf: 8,
          tipoOperacao: 'SAÍDA',
          finalidade: 'Devolução/Retorno',
          cfop: '5202',
          itens: [{ idItem: 80, produto: 'MILHO EM GRÃOS', quantidade: '6000', valorTotal: '8000' }],
        }),
      ],
    })
    const l = r.lancamentos[0]
    expect(l.contaSafragold).toBe('4.1.02') // aquisição de milho
    expect(l.valor).toBeCloseTo(-8_000, 2)
    expect(r.sacas['2026-06']).toBeUndefined() // devolver compra não mexe em venda
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
    expect(r.lancamentos[0].contaSafragold).toBe('4.3.12')
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
    // Recebimento num centro de COMPRA: devolução de dinheiro, reduz o CPV.
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
    // Agrupado pelo PARCEIRO (os dois títulos são do mesmo), não pelo 'SEM CC'.
    const residuo = r.residuos.find((x) => x.chave === 'JOAO EMILIO ROCHETO')!
    expect(residuo.quantidade).toBe(2)
    expect(residuo.valor).toBeCloseTo(500, 2)
    expect(residuo.centroCusto).toBe('SEM CC')
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
      nfs: [
        nfVenda(), // receita 88.533,33 (soja)
        // O CPV nasce da NOTA DE ENTRADA, não do título — contar os dois
        // contaria a mesma compra duas vezes.
        {
          idNf: 4242,
          numeroNf: 4242,
          dataEmissao: '2026-06-12',
          status: 'Finalizada',
          cfop: '1102',
          entrada: true,
          finalidade: 'Normal',
          valorTotalNf: 60000,
          emitenteNome: 'FORNECEDOR Y',
          emitenteCpfCnpj: '11222333000144',
          itens: [],
        },
      ],
      pagar: [
        titulo({ idItemLancamento: 2, centroCusto: 'ARMAZENAGEM SOJA', valor: '5000' }), // CPV
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
    // 10.000 de custo vindos da NOTA de entrada, 2.500 devolvidos pelo título.
    const r = normalizarEnokiDre({
      nfs: [{
        idNf: 4243, numeroNf: 4243, dataEmissao: '2026-06-12', status: 'Finalizada',
        cfop: '1102', entrada: true, finalidade: 'Normal', valorTotalNf: 10000,
        emitenteNome: 'FORNECEDOR Y', emitenteCpfCnpj: '11222333000144', itens: [],
      }],
      receber: [titulo({ idItemLancamento: 77, centroCusto: 'COMPRA SOJA', valor: '2500' })],
    })
    const dre = montarDre('2026-06', r.lancamentos, mapaEfetivo([]))
    expect(dre.linhas.find((l) => l.linha === 'custo_produto')!.realizado).toBeCloseTo(7500, 2)
  })

  it('título de compra PAGO não duplica o custo da nota de entrada', () => {
    // Regressão: em julho a mesma mercadoria aparecia como R$ 20,1M em notas
    // de entrada MAIS R$ 3,8M em títulos de compra.
    const notaCompra = {
      idNf: 4244, numeroNf: 4244, dataEmissao: '2026-06-12', status: 'Finalizada',
      cfop: '1102', entrada: true, finalidade: 'Normal', valorTotalNf: 10000,
      emitenteNome: 'FORNECEDOR Y', emitenteCpfCnpj: '11222333000144', itens: [],
    }
    const r = normalizarEnokiDre({
      nfs: [notaCompra],
      pagar: [titulo({ centroCusto: 'COMPRA SOJA', valor: '10000' })],
    })
    const dre = montarDre('2026-06', r.lancamentos, mapaEfetivo([]))
    expect(dre.linhas.find((l) => l.linha === 'custo_produto')!.realizado).toBeCloseTo(10000, 2)
    expect(r.descartes.find((d) => d.motivo === 'custo_vem_da_nf')?.valor).toBeCloseTo(10000, 2)
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

describe('regras aprendidas para o resíduo (item 1.4)', () => {
  const semCC = [
    titulo({ idItemLancamento: 90, centroCusto: 'SEM CC', valor: '4000', parceiroNome: 'SICOOB', descricao: 'Tarifa mensal' }),
    titulo({ idItemLancamento: 91, centroCusto: 'SEM CC', valor: '1500', parceiroNome: 'SICOOB', descricao: 'Tarifa de TED' }),
    titulo({ idItemLancamento: 92, centroCusto: 'SEM CC', valor: '900', parceiroNome: 'COPASA', descricao: 'Conta de água' }),
  ]

  it('sem regra, tudo vira resíduo agrupado por parceiro', () => {
    const r = normalizarEnokiDre({ pagar: semCC })
    expect(r.lancamentos).toHaveLength(0)
    expect(r.residuos.map((x) => x.chave).sort()).toEqual(['COPASA', 'SICOOB'])
    // Ordenado por valor: SICOOB (5.500) antes de COPASA (900).
    expect(r.residuos[0].chave).toBe('SICOOB')
    expect(r.residuos[0].valor).toBeCloseTo(5500, 2)
  })

  it('com a regra aprendida, o título cai na conta e sai da fila', () => {
    const r = normalizarEnokiDre({ pagar: semCC }, { regras: { SICOOB: '4.4.03' } })
    expect(r.lancamentos).toHaveLength(2)
    expect(r.lancamentos.every((l) => l.contaSafragold === '4.4.03')).toBe(true)
    expect(r.residuos.map((x) => x.chave)).toEqual(['COPASA'])
  })

  it('a regra aprendida chega ao DRE na linha certa', () => {
    const r = normalizarEnokiDre({ pagar: semCC }, { regras: { SICOOB: '4.4.03', COPASA: '4.3.09' } })
    const dre = montarDre('2026-06', r.lancamentos, mapaEfetivo([]))
    expect(dre.linhas.find((l) => l.linha === 'despesa_financeira')!.realizado).toBeCloseTo(5500, 2)
    expect(dre.linhas.find((l) => l.linha === 'despesas_administrativas')!.realizado).toBeCloseTo(900, 2)
    expect(dre.naoClassificadas).toHaveLength(0)
  })

  it('a chave cai na descrição quando não há parceiro', () => {
    const r = normalizarEnokiDre({
      pagar: [titulo({ idItemLancamento: 95, centroCusto: 'SEM CC', parceiroNome: '', descricao: 'Taxa avulsa' })],
    })
    expect(r.residuos[0].chave).toBe('TAXA AVULSA')
  })

  it('centro de custo NOVO no ERP aparece no resíduo com o próprio nome', () => {
    const r = normalizarEnokiDre({
      pagar: [titulo({ idItemLancamento: 96, centroCusto: 'CENTRO NOVO DO ERP', parceiroNome: 'FORNECEDOR Z' })],
    })
    expect(r.residuos[0].centroCusto).toBe('CENTRO NOVO DO ERP')
  })
})

describe('só nota AUTORIZADA vira receita', () => {
  it('Finalizada + Enviada conta', () => {
    expect(ehAutorizada(nfVenda({ status: 'Finalizada', statusNfe: 'Enviada' }))).toBe(true)
  })

  it('em Digitação NÃO conta — a nota ainda está sendo preenchida', () => {
    expect(ehAutorizada(nfVenda({ status: 'Digitação', statusNfe: 'Inutil' }))).toBe(false)
    const r = normalizarEnokiDre({ nfs: [nfVenda({ status: 'Digitação' })] })
    expect(r.lancamentos).toHaveLength(0)
    expect(r.descartes.find((d) => d.motivo === 'nf_nao_autorizada')).toBeTruthy()
  })

  it('"Gerada" NÃO conta — ainda não foi autorizada pela SEFAZ', () => {
    expect(ehAutorizada(nfVenda({ status: 'Gerada', statusNfe: '' }))).toBe(false)
  })

  it('número INUTILIZADO não conta, mesmo com status Finalizada', () => {
    // Caso real: status diz finalizada, mas o número fiscal foi inutilizado.
    expect(ehAutorizada(nfVenda({ status: 'Finalizada', statusNfe: 'Inutil' }))).toBe(false)
    const r = normalizarEnokiDre({ nfs: [nfVenda({ statusNfe: 'Inutil' })] })
    expect(r.lancamentos).toHaveLength(0)
  })

  it('a regra vale só para VENDA — remessa segue com o descarte dela', () => {
    const r = normalizarEnokiDre({ nfs: [nfVenda({ cfop: '5905', status: 'Digitação' })] })
    expect(r.descartes.find((d) => d.motivo === 'nf_remessa')).toBeTruthy()
    expect(r.descartes.find((d) => d.motivo === 'nf_nao_autorizada')).toBeUndefined()
  })
})

describe('NF sem itens (fonte scraper — a grade não expõe produto)', () => {
  const semItens = (over = {}) => nfVenda({ itens: [], ...over })

  it('a receita NÃO some: vira item sintético na conta 3.1.15', () => {
    const r = normalizarEnokiDre({ nfs: [semItens()] })
    expect(r.lancamentos).toHaveLength(1)
    expect(r.lancamentos[0].contaSafragold).toBe('3.1.15')
    expect(r.lancamentos[0].valor).toBeCloseTo(88533.33, 2)
  })

  it('e cai na linha de RECEITA BRUTA, não em outras receitas', () => {
    const r = normalizarEnokiDre({ nfs: [semItens()] })
    const dre = montarDre('2026-06', r.lancamentos, mapaEfetivo([]))
    expect(dre.linhas.find((l) => l.linha === 'receita_bruta')!.realizado).toBeCloseTo(88533.33, 2)
    expect(dre.linhas.find((l) => l.linha === 'outras_receitas_operacionais')!.realizado).toBe(0)
    expect(dre.naoClassificadas).toHaveLength(0)
  })

  it('sem itens NÃO inventa sacas — o volume fica desconhecido, não zero disfarçado', () => {
    const r = normalizarEnokiDre({ nfs: [semItens()] })
    expect(r.sacas).toEqual({})
  })

  it('nota que não é venda continua sem gerar nada', () => {
    const r = normalizarEnokiDre({ nfs: [semItens({ cfop: '5905' })] })
    expect(r.lancamentos).toHaveLength(0)
  })

  it('nota sem itens E sem valor não vira lançamento fantasma', () => {
    const r = normalizarEnokiDre({ nfs: [semItens({ valorTotalNf: '0' })] })
    expect(r.lancamentos).toHaveLength(0)
  })

  it('com itens, o comportamento antigo é preservado (grão e sacas)', () => {
    const r = normalizarEnokiDre({ nfs: [nfVenda()] })
    expect(r.lancamentos[0].contaSafragold).toBe('3.1.01')
    expect(r.sacas['2026-06'].soja).toBeCloseTo(40000 / 60, 2)
  })
})

describe('CPV vem da NOTA DE COMPRA, não dos títulos', () => {
  // Regressão do bug que deixou o CPV de julho em R$ 4,6M contra R$ 22,7M reais:
  // a tela de NF de ENTRADA nunca era lida, e o custo era montado a partir dos
  // títulos financeiros — que só enxergam a fatia que vence dentro da janela.
  const compra = {
    idNf: 900,
    numeroNf: 900,
    dataEmissao: '2026-07-10',
    status: 'Finalizada',
    cfop: '1102',
    entrada: true,
    tipoOperacao: 'ENTRADA',
    finalidade: 'Normal',
    valorTotalNf: 1_000_000,
    emitenteNome: 'FORNECEDOR X',
    emitenteCpfCnpj: '11222333000144',
    itens: [],
  }

  it('nota de compra sem itens vira CPV, não receita', () => {
    const { lancamentos } = normalizarEnokiDre({ nfs: [compra], pagar: [], receber: [] })
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].contaSafragold).toBe(CONTA_SEM_DETALHE_COMPRA)
    expect(lancamentos[0].contaSafragold.startsWith('4.')).toBe(true)
    expect(lancamentos[0].valor).toBe(1_000_000)
  })

  it('compra NÃO soma sacas — o volume vendido é o da nota de saída', () => {
    const comItem = {
      ...compra,
      itens: [{ idItem: 1, produto: 'SOJA EM GRAOS', quantidade: 1000, valorUnitario: 140, valorTotal: 140_000 }],
    }
    const { lancamentos, sacas } = normalizarEnokiDre({ nfs: [comItem], pagar: [], receber: [] })
    expect(lancamentos[0].contaSafragold).toBe('4.1.01')
    expect(sacas).toEqual({})
  })

  it('compra de empresa do próprio grupo é eliminada pelo CNPJ do EMITENTE', () => {
    const intra = { ...compra, emitenteCpfCnpj: '30798330000199' }
    const { lancamentos } = normalizarEnokiDre({ nfs: [intra], pagar: [], receber: [] })
    expect(lancamentos).toHaveLength(0)
  })
})

describe('nota sem itens abertos: nenhuma natureza viva pode sumir', () => {
  // Regressão: o item sintético era criado só para venda e compra, então as 63
  // notas de DEVOLUÇÃO de julho (R$ 1,80M, nenhuma com item aberto) sumiam sem
  // sequer aparecer em descarte — a receita ficava R$ 1M acima da planilha.
  function nfSemItens(over: Record<string, unknown>) {
    return {
      idNf: 700, numeroNf: 700, dataEmissao: '2026-07-10', status: 'Finalizada',
      statusNfe: 'Enviada', finalidade: 'Normal', valorTotalNf: 100_000,
      destinatarioNome: 'CLIENTE X', destinatarioCpfCnpj: '11222333000144',
      itens: [], ...over,
    }
  }

  it('devolução de VENDA sem itens vira dedução', () => {
    const { lancamentos } = normalizarEnokiDre({
      nfs: [nfSemItens({ cfop: '1202', tipoOperacao: 'ENTRADA' })],
    })
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].contaSafragold).toBe('3.2.06')
    expect(lancamentos[0].valor).toBe(100_000)
  })

  it('retorno de lote de exportação sem itens também reduz a receita', () => {
    const { lancamentos } = normalizarEnokiDre({
      nfs: [nfSemItens({ cfop: '2504', tipoOperacao: 'ENTRADA' })],
    })
    expect(lancamentos[0].contaSafragold).toBe('3.2.06')
  })

  it('devolução de COMPRA sem itens REDUZ o CPV', () => {
    const { lancamentos } = normalizarEnokiDre({
      nfs: [nfSemItens({ cfop: '5202' })],
    })
    expect(lancamentos[0].contaSafragold.startsWith('4.')).toBe(true)
    expect(lancamentos[0].valor).toBeLessThan(0)
  })

  it('o que é descartado continua descartado — o item sintético não ressuscita nada', () => {
    const { lancamentos } = normalizarEnokiDre({
      nfs: [
        nfSemItens({ cfop: '5905' }), // remessa
        nfSemItens({ idNf: 701, cfop: '6152' }), // transferência
        nfSemItens({ idNf: 702, cfop: '5106', status: 'Cancelada' }),
      ],
    })
    expect(lancamentos).toHaveLength(0)
  })
})
