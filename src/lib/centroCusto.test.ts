import { describe, it, expect } from 'vitest'
import {
  destinoDeCentroCusto,
  normalizarRotulo,
  REGRAS_CENTRO_CUSTO,
  centrosCustoAConfirmar,
} from './centroCusto'
import { MAPA_PLANO } from './planoContas'

/** Os 43 centros de custo distintos observados na extração real de 2026-08-21
 *  (jan–jul/2026, 5 empresas) — o critério de aceite do item 1.2 é cobrir 100%. */
const CENTROS_REAIS = [
  'ADIANTAMENTO DE CLIENTE',
  'ADIANTAMENTO FORNECEDOR',
  'AGUA',
  'ARMAZENAGEM CAFE',
  'ARMAZENAGEM MILHO',
  'ARMAZENAGEM SOJA',
  'ARMAZENAGEM SORGO',
  'BRINDES',
  'BRINDES PARA COLABORADORES',
  'COMBUSTIVEIS E LUBRIFICANTES',
  'COMPRA CAFE',
  'COMPRA MILHO',
  'COMPRA SOJA',
  'COMPRA SORGO',
  'CONSÓRCIOS CONTEMPLADO',
  'DEVOLUÇÃO MILHO - MERCADO INTERNO',
  'DEVOLUÇÃO SOJA - MERCADO INTERNO',
  'FEIRAS & EVENTOS',
  'FRETE',
  'FÉRIAS',
  'ICMS - SOBRE COMPRAS',
  'ICMS CREDITO PRESUMIDO',
  'IMOBILIZADO',
  'JUROS SOBRE ANTECIPAÇÃO DE RECEBÍVEIS',
  'JUROS SOBRE EMPRÉSTIMOS',
  'MANUTENÇÃO DE VEICULOS',
  'MANUTENÇÃO SOFTWARE & SISTEMA',
  'MARKETING / PROPAGANDA',
  'MATERIAIS DE LIMPEZA',
  'MATERIAL DE ESCRITORIO',
  'MÓVEIS',
  'OBRA - SEDE DO GRUPO',
  'OUTRAS DESPESAS',
  'OUTRAS RECEITAS',
  'RATEIO ENTRE AS EMPRESAS DO GRUPO',
  'RECEITA CAFE - MERCADO INTERNO',
  'RECEITA MILHO - MERCADO INTERNO',
  'RECEITA SERVIÇOS DE CORRETAGEM - MERCADO INTERNO',
  'RECEITA SOJA - MERCADO INTERNO',
  'RECEITA SORGO - MERCADO INTERNO',
  'REFEICOES E LANCHES',
  'SEM CC',
  'UNIFORMES',
]

/** Centros de custo vistos no ERP de PRODUÇÃO (2026-08-26) — os rótulos são
 *  mais específicos que os de homologação e não podem virar resíduo. */
const CENTROS_PRODUCAO = [
  'FRETE SOBRE COMPRA',
  'SOFTWARE & SISTEMA',
  'EMPRESTIMO DE TERCEIROS',
  'SEGUROS',
  'RECUPERAÇÃO DE PREJUIZO - INADIMPLENCIA',
  'COMISSAO TERCEIROS',
  'GRATIFICACOES',
  'FUNRURAL',
]

describe('normalizarRotulo', () => {
  it('tira acento, sobe caixa e colapsa espaço', () => {
    expect(normalizarRotulo('  Consórcios   Contemplado ')).toBe('CONSORCIOS CONTEMPLADO')
    expect(normalizarRotulo('Férias')).toBe('FERIAS')
    expect(normalizarRotulo('DEVOLUÇÃO SOJA')).toBe('DEVOLUCAO SOJA')
  })
})

describe('cobertura dos centros de custo reais', () => {
  it('todos os 43 centros observados têm destino ou são o resíduo "SEM CC"', () => {
    const semRegra = CENTROS_REAIS.filter((cc) => {
      if (normalizarRotulo(cc) === 'SEM CC') return false // resíduo esperado → IA
      return !destinoDeCentroCusto(cc, 'saida') && !destinoDeCentroCusto(cc, 'entrada')
    })
    expect(semRegra).toEqual([])
  })

  it('os centros de custo de PRODUÇÃO também estão mapeados', () => {
    const semRegra = CENTROS_PRODUCAO.filter(
      (cc) => !destinoDeCentroCusto(cc, 'saida') && !destinoDeCentroCusto(cc, 'entrada'),
    )
    expect(semRegra).toEqual([])
  })

  it('frete de COMPRA vem do CT-e; frete de VENDA continua vindo do título', () => {
    // Assimetria proposital: o CT-e de entrada identifica com segurança o frete
    // sobre compra (R$ 1,78M em julho); o de saída não distingue as pontas.
    const compra = destinoDeCentroCusto('FRETE SOBRE COMPRA', 'saida')!
    expect(compra.ignorar).toBe(true)
    expect(compra.motivo).toBe('custo_vem_da_nf')
    expect(destinoDeCentroCusto('FRETE SOBRE COMPRA', 'entrada')).toMatchObject({ conta: '4.1.10', sinal: -1 })
    // Frete sobre VENDA é despesa comercial e seu título continua valendo.
    expect(destinoDeCentroCusto('FRETE SOBRE VENDA', 'saida')).toMatchObject({ conta: '4.2.03' })
  })

  it('recuperação de inadimplência é RECEITA, não redução de despesa', () => {
    expect(destinoDeCentroCusto('RECUPERAÇÃO DE PREJUIZO - INADIMPLENCIA', 'entrada'))
      .toMatchObject({ conta: '3.4.04', sinal: 1 })
  })

  it('"SEM CC" devolve null (vai para a fila da IA, não some)', () => {
    expect(destinoDeCentroCusto('SEM CC', 'saida')).toBeNull()
    expect(destinoDeCentroCusto('', 'saida')).toBeNull()
    expect(destinoDeCentroCusto('CENTRO QUE NAO EXISTE', 'saida')).toBeNull()
  })

  it('toda conta apontada pelas regras existe no plano de contas', () => {
    const contas = Object.values(REGRAS_CENTRO_CUSTO)
      .flatMap((r) => [r.entrada, r.saida])
      .filter((c): c is string => !!c && c !== 'NF')
    expect(contas.length).toBeGreaterThan(0)
    for (const conta of contas) expect(MAPA_PLANO[conta], `conta ${conta}`).toBeTruthy()
  })
})

describe('direção do fluxo', () => {
  it('compra PAGA é ignorada — o custo vem da nota de entrada', () => {
    // Simétrico à receita: contar a nota E o título contaria a mesma compra
    // duas vezes. Em julho isso eram R$ 20,1M em notas + R$ 3,8M em títulos da
    // MESMA mercadoria. O motivo é próprio ('custo_vem_da_nf') justamente para
    // denunciar no diagnóstico se a nota de entrada faltar na carga.
    for (const cc of ['COMPRA SOJA', 'COMPRA MILHO', 'COMPRA CAFE']) {
      const d = destinoDeCentroCusto(cc, 'saida')!
      expect(d.ignorar, cc).toBe(true)
      expect(d.motivo).toBe('custo_vem_da_nf')
    }
  })

  it('compra RECEBIDA é estorno: reduz o CPV, com sinal negativo', () => {
    // O pagamento é ignorado (o custo vem da nota), mas o RECEBIMENTO não tem
    // nota que o gere — é devolução de dinheiro e tem de reduzir o custo.
    const d = destinoDeCentroCusto('COMPRA SOJA', 'entrada')!
    expect(d.conta).toBe('4.1.01')
    expect(d.ignorar).toBe(false)
    expect(d.sinal).toBe(-1)
    expect(d.motivo).toBe('estorno')
  })

  it('armazenagem tem conta DIFERENTE por direção (custo × receita)', () => {
    expect(destinoDeCentroCusto('ARMAZENAGEM SOJA', 'saida')).toMatchObject({ conta: '4.1.11', sinal: 1 })
    expect(destinoDeCentroCusto('ARMAZENAGEM SOJA', 'entrada')).toMatchObject({ conta: '3.1.09', sinal: 1 })
  })

  it('receita de grão recebida é IGNORADA (o fato gerador é a NF)', () => {
    const d = destinoDeCentroCusto('RECEITA SOJA - MERCADO INTERNO', 'entrada')!
    expect(d.ignorar).toBe(true)
    expect(d.motivo).toBe('receita_vem_da_nf')
  })

  it('receita de grão PAGA é devolução/estorno de venda → deduções', () => {
    expect(destinoDeCentroCusto('RECEITA SOJA - MERCADO INTERNO', 'saida')).toMatchObject({
      conta: '3.2.06',
      sinal: 1,
      ignorar: false,
    })
  })

  it('crédito presumido de ICMS NÃO é dedução de receita', () => {
    // Este teste afirmava o contrário e fixava o erro no lugar: eu tinha
    // assumido, pelo nome, que era ICMS sobre vendas. Não é. São títulos de
    // COMPRA DE GRÃO com o centro de custo errado no ERP — 18 dos 19 em 20
    // meses casam com uma nota CFOP 1102 do mesmo contrato. E crédito presumido
    // é benefício fiscal; benefício nenhum reduz receita bruta.
    expect(destinoDeCentroCusto('ICMS CREDITO PRESUMIDO', 'saida')).toMatchObject({
      ignorar: true,
      motivo: 'custo_vem_da_nf',
    })
  })

  it('juros: pago é despesa financeira, recebido é receita financeira', () => {
    expect(destinoDeCentroCusto('JUROS SOBRE EMPRÉSTIMOS', 'saida')).toMatchObject({ conta: '4.4.01' })
    expect(destinoDeCentroCusto('JUROS SOBRE EMPRÉSTIMOS', 'entrada')).toMatchObject({ conta: '3.5.02' })
  })

  it('capex vai para a linha de investimentos', () => {
    expect(destinoDeCentroCusto('IMOBILIZADO', 'saida')).toMatchObject({ conta: '5.1.01' })
    expect(destinoDeCentroCusto('CONSÓRCIOS CONTEMPLADO', 'saida')).toMatchObject({ conta: '5.1.03' })
    expect(destinoDeCentroCusto('OBRA - SEDE DO GRUPO', 'saida')).toMatchObject({ conta: '5.1.04' })
  })

  it('contas patrimoniais e rateio intragrupo ficam FORA do DRE', () => {
    for (const cc of ['ADIANTAMENTO DE CLIENTE', 'ADIANTAMENTO FORNECEDOR', 'RATEIO ENTRE AS EMPRESAS DO GRUPO']) {
      const d = destinoDeCentroCusto(cc, 'saida')!
      expect(d.ignorar, cc).toBe(true)
      expect(d.motivo).toBe('patrimonial_ou_intragrupo')
    }
  })
})

describe('auditoria', () => {
  it('expõe as classificações a confirmar com o cliente', () => {
    const lista = centrosCustoAConfirmar()
    expect(lista.map((x) => x.centroCusto)).toContain('MOVEIS')
    expect(lista[0].nota).toBeTruthy()
  })
})

describe('regra por FAMÍLIA — o ERP renomeia centro de custo sem avisar', () => {
  // Em agosto/2026 o ERP passou a usar "RECEITA MILHO" (sem "- MERCADO INTERNO"),
  // "FRETE (CMV)" e "FRETE (USO & CONSUMO)". Rótulos novos para as MESMAS
  // operações jogaram R$ 9,07 milhões na fila de resíduo, que é para o que
  // ninguém sabe classificar — não para o que mudou de nome.
  it('receita de grão é ignorada em qualquer variação do rótulo', () => {
    for (const cc of ['RECEITA MILHO', 'RECEITA SOJA - EXPORTAÇÃO', 'RECEITA SORGO']) {
      const d = destinoDeCentroCusto(cc, 'entrada')!
      expect(d.ignorar, cc).toBe(true)
      expect(d.motivo).toBe('receita_vem_da_nf')
    }
  })

  it('frete em qualquer variação vem da nota, não do título', () => {
    for (const cc of ['FRETE (CMV)', 'FRETE (USO & CONSUMO)', 'FRETE SOBRE COMPRA']) {
      const d = destinoDeCentroCusto(cc, 'saida')!
      expect(d.ignorar, cc).toBe(true)
      expect(d.motivo).toBe('custo_vem_da_nf')
    }
  })

  it('o estorno de compra segue o cereal do rótulo, mesmo em variação nova', () => {
    expect(destinoDeCentroCusto('COMPRA MILHO SAFRINHA', 'entrada')).toMatchObject({
      conta: '4.1.02',
      sinal: -1,
    })
  })

  it('classificação de qualquer grão é CPV, não despesa', () => {
    expect(destinoDeCentroCusto('CLASSIFICACAO SORGO', 'saida')).toMatchObject({ conta: '4.1.13' })
  })

  it('a tabela EXATA continua vencendo a família', () => {
    // "FRETE SOBRE VENDA" é despesa comercial, e o prefixo /^FRETE/ diria o
    // contrário. A regra específica tem de ganhar.
    expect(destinoDeCentroCusto('FRETE SOBRE VENDA', 'saida')).toMatchObject({ conta: '4.2.03' })
  })

  it('o que não é de família nenhuma continua indo para a fila', () => {
    expect(destinoDeCentroCusto('ALGO QUE NINGUEM VIU', 'saida')).toBeNull()
  })
})

describe('o prefixo da família tolera como o ERP de fato escreve', () => {
  // Agosto/2026: R$ 17,0M em "COMPRA DE MILHO" e R$ 1,02M em "FRETES - CMV"
  // caíram no resíduo porque a regra dizia "COMPRA MILHO" e /^FRETE\b/.
  const vemDaNf = [
    'COMPRA DE MILHO',
    'COMPRA DE SOJA',
    'COMPRA DE SORGO',
    'COMPRA MILHO',
    'FRETES - CMV',
    'FRETE (USO & CONSUMO)',
    'FRETE (CMV)',
    'FRETE SOBRE COMPRA',
  ]
  for (const rotulo of vemDaNf) {
    it(`"${rotulo}" é custo que vem da NF, não resíduo`, () => {
      // Se virasse despesa, dobraria o custo: ele já veio da nota.
      const d = destinoDeCentroCusto(rotulo, 'saida')
      expect(d).not.toBeNull()
      expect(d!.ignorar).toBe(true)
      expect(d!.motivo).toBe('custo_vem_da_nf')
    })
  }

  it('a receita de grão continua vindo da nota, com "DE" ou sem', () => {
    for (const r of ['RECEITA DE MILHO - MERCADO INTERNO', 'RECEITAS MILHO']) {
      expect(destinoDeCentroCusto(r, 'entrada')?.motivo).toBe('receita_vem_da_nf')
    }
  })

  it('classificação e armazenagem no plural também entram', () => {
    expect(destinoDeCentroCusto('CLASSIFICACAO - MILHO', 'saida')?.conta).toBe('4.1.13')
    expect(destinoDeCentroCusto('ARMAZENAGENS DE TERCEIROS', 'saida')?.conta).toBe('4.1.11')
  })

  it('não engole o que NÃO é da família', () => {
    // "COMPRA DE MÓVEIS" não é grão e não pode virar custo-da-NF em silêncio.
    const d = destinoDeCentroCusto('COMPRA DE MOVEIS', 'saida')
    expect(d?.motivo).not.toBe('custo_vem_da_nf')
  })
})

describe('ICMS crédito presumido não deduz receita', () => {
  it('é compra de grão com rótulo errado — o custo vem da nota', () => {
    // 18 dos 19 títulos assim rotulados em 20 meses casam, pelo idContrato, com
    // uma nota CFOP 1102 a menos de 2% de distância. Crédito presumido é
    // benefício fiscal; nunca foi dedução de receita.
    const d = destinoDeCentroCusto('ICMS CREDITO PRESUMIDO', 'saida')
    expect(d?.ignorar).toBe(true)
    expect(d?.motivo).toBe('custo_vem_da_nf')
    expect(d?.conta).not.toBe('3.2.01')
  })

  // Havia aqui um "ICMS que É imposto continua deduzindo", escrito por mim na
  // mesma hora em que corrigi o crédito presumido. Repeti o erro no teste
  // seguinte: assumi, de novo pelo NOME, que DIFAL e parcelamento eram ICMS
  // sobre vendas. Não são — ver o bloco 'imposto nenhum deduz a receita'.
})

describe('imposto nenhum deduz a receita de grão', () => {
  // A venda de grão em MG é ICMS diferido: a linha IMPOSTOS da planilha do
  // cliente é ZERO em todos os meses de 2026. Tudo que eu mandava para 3.2.01
  // era outra coisa com "ICMS" no nome.
  it('DIFAL é custo da compra — veio de pneu e veículo, não de grão', () => {
    expect(destinoDeCentroCusto('ICMS - DIFAL', 'saida')?.conta).toBe('4.3.14')
  })

  it('parcelamento de ICMS é despesa, como na planilha do cliente', () => {
    expect(destinoDeCentroCusto('PARCELAMENTO ICMS', 'saida')?.conta).toBe('4.3.17')
  })

  it('nenhum centro de custo com ICMS no nome cai em dedução de receita', () => {
    for (const cc of ['ICMS - DIFAL', 'PARCELAMENTO ICMS', 'ICMS CREDITO PRESUMIDO', 'ICMS - SOBRE COMPRAS']) {
      expect(destinoDeCentroCusto(cc, 'saida')?.conta, cc).not.toBe('3.2.01')
    }
  })
})
