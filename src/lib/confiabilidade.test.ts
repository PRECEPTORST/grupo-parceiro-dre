import { describe, it, expect } from 'vitest'
import { analisarConfiabilidade } from './confiabilidade'
import type { Classificacao, LancamentoCanonico, MapaClassificacao } from './tipos'

const mapa: MapaClassificacao = {
  '3.1.01': 'receita_bruta',
  '4.1.01': 'custo_produto',
  '4.3.01': 'despesas_administrativas',
  '4.4.01': 'despesa_financeira',
  '3.5.01': 'receita_financeira',
}

// Só 4.1.01 tem confiança abaixo do limiar (0.5 < 0.8).
const classificacoes: Classificacao[] = [
  { contaSafragold: '4.1.01', linha: 'custo_produto', confianca: 0.5, justificativa: '' },
]

function lanc(id: string, data: string, conta: string, valor: number, hist = ''): LancamentoCanonico {
  return { id, data, contaSafragold: conta, historico: hist, valor }
}

const lancamentos: LancamentoCanonico[] = [
  // Histórico para média e sumiço
  lanc('h1', '2026-04-10', '3.1.01', 1_000_000),
  lanc('h2', '2026-05-10', '3.1.01', 1_000_000),
  lanc('h3', '2026-03-25', '4.4.01', 30_000),
  lanc('h4', '2026-04-25', '4.4.01', 30_000),
  lanc('h5', '2026-05-25', '4.4.01', 30_000), // 3 meses → "regular"
  // Junho (competência analisada)
  lanc('j1', '2026-06-10', '3.1.01', 3_000_000, 'Venda de soja'), // spike vs média 1M
  lanc('j2', '2026-06-12', '9.9.99', 50_000, 'Conta nova'), // não classificada
  lanc('j3', '2026-06-14', '4.1.01', 500_000, 'Compra de grãos'), // baixa confiança
  lanc('j4', '2026-06-10', '4.3.01', 20_000, 'Aluguel'), // dup 1
  lanc('j5', '2026-06-10', '4.3.01', 20_000, 'Aluguel'), // dup 2
  lanc('j6', '2026-06-20', '3.5.01', 8_000, 'Rendimento'), // data futura (hoje=15)
  // 4.4.01 não aparece em junho → sumiço
]

describe('analisarConfiabilidade', () => {
  const rel = analisarConfiabilidade('2026-06', lancamentos, classificacoes, mapa, {
    hoje: '2026-06-15',
  })
  const achado = (t: string) => rel.achados.find((a) => a.tipo === t)

  it('aponta conta com movimento sem classificação', () => {
    const a = achado('nao_classificada')!
    expect(a.conta).toBe('9.9.99')
    expect(a.valor).toBe(50_000)
  })

  it('aponta classificação de baixa confiança', () => {
    const a = achado('baixa_confianca')!
    expect(a.conta).toBe('4.1.01')
    expect(a.valor).toBe(500_000)
  })

  it('aponta variação atípica vs. média histórica', () => {
    const a = achado('variacao_atipica')!
    expect(a.conta).toBe('3.1.01')
    expect(a.valor).toBe(2_000_000) // |3M - 1M|
  })

  it('aponta possível duplicidade (mesma conta+valor+data)', () => {
    const a = achado('duplicidade')!
    expect(a.conta).toBe('4.3.01')
    expect(a.valor).toBe(40_000) // 20k × 2
  })

  it('aponta conta que sumiu no mês', () => {
    const a = achado('sem_movimento')!
    expect(a.conta).toBe('4.4.01')
    expect(a.valor).toBe(30_000)
  })

  it('aponta lançamento com data futura', () => {
    const a = achado('data_futura')!
    expect(a.conta).toBe('3.5.01')
  })

  it('calcula o índice de confiança e o valor em revisão', () => {
    // Em revisão = não classificada (50k) + baixa confiança (500k) = 550k.
    // Movimento de junho = 3M + 50k + 500k + 20k + 20k + 8k = 3.598M.
    expect(rel.valorEmRevisao).toBe(550_000)
    expect(rel.totalMovimento).toBe(3_598_000)
    expect(rel.indiceConfianca).toBe(85) // round((1 - 550/3598) * 100)
  })

  it('ordena por severidade (alta primeiro)', () => {
    const sevs = rel.achados.map((a) => a.severidade)
    const idxBaixa = sevs.indexOf('baixa')
    const idxAlta = sevs.lastIndexOf('alta')
    if (idxBaixa !== -1 && idxAlta !== -1) expect(idxAlta).toBeLessThan(idxBaixa)
  })
})

describe('materialidade — piso em R$', () => {
  it('marca como imaterial (severidade baixa) o que fica abaixo do piso', () => {
    const l = [lanc('x', '2026-06-05', '9.9.99', 500, 'Pequena')] // 500 < piso 1000
    const rel = analisarConfiabilidade('2026-06', l, [], {}, { pisoMaterialidade: 1000, hoje: '2026-06-30' })
    const a = rel.achados.find((x) => x.tipo === 'nao_classificada')!
    expect(a.material).toBe(false)
    expect(a.severidade).toBe('baixa')
    expect(rel.materiais).toBe(0)
  })

  it('respeita um piso maior configurável', () => {
    const l = [lanc('x', '2026-06-05', '9.9.99', 3_000, 'Média')]
    const rel = analisarConfiabilidade('2026-06', l, [], {}, { pisoMaterialidade: 5000, hoje: '2026-06-30' })
    const a = rel.achados.find((x) => x.tipo === 'nao_classificada')!
    expect(a.material).toBe(false) // 3k < 5k
  })
})

describe('materialidade de duas trilhas (receita = %, custo = R$)', () => {
  const mapaR: MapaClassificacao = { '3.1.01': 'receita_bruta' }
  const hist = [
    lanc('a', '2026-04-10', '3.1.01', 1_000_000),
    lanc('b', '2026-05-10', '3.1.01', 1_000_000),
  ]

  it('receita: variação dispara a partir de 3% da média', () => {
    const l = [...hist, lanc('c', '2026-06-10', '3.1.01', 1_050_000)] // +5%
    const rel = analisarConfiabilidade('2026-06', l, [], mapaR, { hoje: '2026-06-30' })
    const a = rel.achados.find((x) => x.tipo === 'variacao_atipica')
    expect(a?.valor).toBe(50_000)
    expect(a?.material).toBe(true)
  })

  it('receita: variação abaixo de 3% não dispara', () => {
    const l = [...hist, lanc('c', '2026-06-10', '3.1.01', 1_020_000)] // +2%
    const rel = analisarConfiabilidade('2026-06', l, [], mapaR, { hoje: '2026-06-30' })
    expect(rel.achados.find((x) => x.tipo === 'variacao_atipica')).toBeUndefined()
  })

  it('receita: achado abaixo de 3% da própria conta é imaterial', () => {
    const l = [
      lanc('big', '2026-06-05', '3.1.01', 1_000_000),
      lanc('d1', '2026-06-10', '3.1.01', 10_000),
      lanc('d2', '2026-06-10', '3.1.01', 10_000), // duplicidade de 20k
    ]
    const rel = analisarConfiabilidade('2026-06', l, [], mapaR, { hoje: '2026-06-30' })
    const dup = rel.achados.find((x) => x.tipo === 'duplicidade')!
    expect(dup.valor).toBe(20_000)
    expect(dup.material).toBe(false) // 20k < 3% de 1.020.000 (30.6k)
  })
})
