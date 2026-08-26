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

  it('crédito presumido de ICMS recebido REDUZ a dedução', () => {
    expect(destinoDeCentroCusto('ICMS CREDITO PRESUMIDO', 'saida')).toMatchObject({ conta: '3.2.01', sinal: 1 })
    expect(destinoDeCentroCusto('ICMS CREDITO PRESUMIDO', 'entrada')).toMatchObject({ conta: '3.2.01', sinal: -1 })
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
