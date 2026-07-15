import { describe, it, expect } from 'vitest'
import { montarDre, mapaDeClassificacoes, contasPorLinha, competenciasDisponiveis } from './dre'
import type { LancamentoCanonico, Classificacao, Orcamento } from './tipos'

const classificacoes: Classificacao[] = [
  { contaSafragold: '3.1.01', linha: 'receita_bruta', confianca: 1, justificativa: '' },
  { contaSafragold: '3.2.01', linha: 'deducoes', confianca: 1, justificativa: '' },
  { contaSafragold: '4.1.01', linha: 'custo_produto', confianca: 1, justificativa: '' },
  { contaSafragold: '4.2.01', linha: 'despesas_administrativas', confianca: 1, justificativa: '' },
  { contaSafragold: '4.3.01', linha: 'despesa_financeira', confianca: 1, justificativa: '' },
]
const mapa = mapaDeClassificacoes(classificacoes)

function lanc(id: string, data: string, conta: string, valor: number, hist = ''): LancamentoCanonico {
  return { id, data, contaSafragold: conta, historico: hist, valor }
}

const lancamentos: LancamentoCanonico[] = [
  lanc('1', '2026-06-05', '3.1.01', 700_000, 'Venda soja'),
  lanc('1b', '2026-06-06', '3.1.01', 300_000, 'Venda soja 2'), // mesma conta → agrega
  lanc('2', '2026-06-10', '3.2.01', 180_000),
  lanc('3', '2026-06-12', '4.1.01', 600_000),
  lanc('4', '2026-06-20', '4.2.01', 90_000),
  lanc('5', '2026-06-25', '4.3.01', 30_000),
  lanc('6', '2026-05-30', '3.1.01', 500_000), // outra competência
  lanc('7', '2026-06-28', '9.9.99', 12_345), // não classificada
]

describe('montarDre — analítico', () => {
  const dre = montarDre('2026-06', lancamentos, mapa)

  it('agrega a conta somando seus lançamentos, só da competência', () => {
    const receita = dre.linhas.find((l) => l.linha === 'receita_bruta')!
    expect(receita.realizado).toBe(1_000_000) // 700k + 300k (não os 500k de maio)
    expect(receita.contas).toHaveLength(1)
    expect(receita.contas[0]).toMatchObject({ conta: '3.1.01', realizado: 1_000_000 })
  })

  it('calcula os subtotais do realizado', () => {
    expect(dre.realizado.receitaLiquida).toBe(820_000)
    expect(dre.realizado.lucroBruto).toBe(220_000)
    expect(dre.realizado.resultadoOperacional).toBe(130_000)
    expect(dre.realizado.resultadoAntesIr).toBe(100_000)
    expect(dre.realizado.resultadoLiquido).toBe(100_000)
  })

  it('isola contas sem classificação', () => {
    expect(dre.naoClassificado).toBe(12_345)
    expect(dre.naoClassificadas.map((c) => c.conta)).toEqual(['9.9.99'])
  })
})

describe('montarDre — orçamento por conta', () => {
  const orcamento: Orcamento = {
    competencia: '2026-06',
    valores: { '3.1.01': 800_000, '4.1.01': 600_000, '5.5.55': 50_000 },
    origem: 'manual',
    atualizadoEm: '2026-06-01T00:00:00Z',
  }
  const dre = montarDre('2026-06', lancamentos, mapa, orcamento)

  it('soma o orçado por conta no total da linha', () => {
    const receita = dre.linhas.find((l) => l.linha === 'receita_bruta')!
    expect(receita.orcado).toBe(800_000)
    const conta = receita.contas.find((c) => c.conta === '3.1.01')!
    expect(conta.orcado).toBe(800_000)
    expect(conta.realizado).toBe(1_000_000)
  })

  it('mostra conta orçada sem realizado (aparece com realizado 0)', () => {
    // 5.5.55 não está classificada → cai em naoClassificadas com orçado 50k
    const c = dre.naoClassificadas.find((x) => x.conta === '5.5.55')!
    expect(c.realizado).toBe(0)
    expect(c.orcado).toBe(50_000)
  })

  it('calcula subtotais do orçado', () => {
    expect(dre.orcado.lucroBruto).toBe(200_000) // 800k receita - 600k custo
  })
})

describe('contasPorLinha', () => {
  it('agrupa contas conhecidas por linha e separa as não classificadas', () => {
    const { grupos, naoClassificadas } = contasPorLinha(lancamentos, mapa)
    const receita = grupos.find((g) => g.linha === 'receita_bruta')!
    expect(receita.contas.map((c) => c.conta)).toEqual(['3.1.01'])
    expect(naoClassificadas.map((c) => c.conta)).toEqual(['9.9.99'])
  })
})

describe('competenciasDisponiveis', () => {
  it('lista competências únicas, recente primeiro', () => {
    expect(competenciasDisponiveis(lancamentos)).toEqual(['2026-06', '2026-05'])
  })
})
