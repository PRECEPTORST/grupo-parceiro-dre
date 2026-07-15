import { describe, it, expect } from 'vitest'
import { resumoGraos } from './graos'
import { mapaDeClassificacoes } from './dre'
import type { Classificacao, LancamentoCanonico } from './tipos'

const classificacoes: Classificacao[] = [
  { contaSafragold: '3.1.01', linha: 'receita_bruta', confianca: 1, justificativa: '' },
  { contaSafragold: '3.1.02', linha: 'receita_bruta', confianca: 1, justificativa: '' },
  { contaSafragold: '3.2.01', linha: 'deducoes', confianca: 1, justificativa: '' },
  { contaSafragold: '4.1.01', linha: 'custo_produto', confianca: 1, justificativa: '' },
  { contaSafragold: '4.1.02', linha: 'custo_produto', confianca: 1, justificativa: '' },
  { contaSafragold: '4.1.10', linha: 'custo_produto', confianca: 1, justificativa: '' }, // frete (compartilhado)
]
const mapa = mapaDeClassificacoes(classificacoes)

function lanc(id: string, conta: string, valor: number): LancamentoCanonico {
  return { id, data: '2026-06-10', contaSafragold: conta, historico: '', valor }
}

const lancamentos = [
  lanc('r1', '3.1.01', 1_000_000), // soja
  lanc('r2', '3.1.02', 500_000), // milho
  lanc('d1', '3.2.01', 150_000), // deduções (10% da receita)
  lanc('c1', '4.1.01', 600_000), // aquisição soja
  lanc('c2', '4.1.02', 300_000), // aquisição milho
  lanc('c3', '4.1.10', 60_000), // frete (CPV compartilhado)
]

describe('resumoGraos', () => {
  const r = resumoGraos('2026-06', lancamentos, mapa, { soja: 10_000, milho: 5_000 })
  const soja = r.graos.find((g) => g.grao === 'soja')!
  const milho = r.graos.find((g) => g.grao === 'milho')!

  it('quebra receita, deduções (rateio por receita) e lucro bruto por grão', () => {
    expect(soja.receitaBruta).toBe(1_000_000)
    expect(soja.deducoes).toBe(100_000) // 150k × 1M/1.5M
    expect(soja.receitaLiquida).toBe(900_000)
    // custo = aquisição 600k + frete rateado por volume (60k × 10k/15k = 40k) = 640k
    expect(soja.custo).toBe(640_000)
    expect(soja.lucroBruto).toBe(260_000)
  })

  it('rateia o custo compartilhado por volume de sacas', () => {
    // milho: frete 60k × 5k/15k = 20k; custo = 300k + 20k = 320k
    expect(milho.custo).toBe(320_000)
    expect(milho.lucroBruto).toBe(130_000) // 450k líq − 320k
  })

  it('calcula resultados por saca de cada grão', () => {
    expect(soja.receitaLiquidaPorSaca).toBe(90) // 900k / 10k
    expect(soja.lucroBrutoPorSaca).toBe(26) // 260k / 10k
    expect(milho.lucroBrutoPorSaca).toBe(26) // 130k / 5k
  })

  it('grão sem venda/sacas fica zerado e sem valor por saca', () => {
    const cafe = r.graos.find((g) => g.grao === 'cafe')!
    expect(cafe.receitaBruta).toBe(0)
    expect(cafe.lucroBrutoPorSaca).toBeNull()
  })

  it('reconcilia com o DRE e calcula os resultados por saca globais', () => {
    expect(r.sacasTotal).toBe(15_000)
    // soma dos lucros brutos por grão = lucro bruto total do DRE
    expect(soja.lucroBruto + milho.lucroBruto).toBe(r.lucroBruto)
    expect(r.lucroBruto).toBe(390_000)
    expect(r.receitaLiquidaPorSaca).toBe(90) // 1.35M / 15k
    expect(r.lucroBrutoPorSaca).toBe(26) // 390k / 15k
    expect(r.lucroLiquidoPorSaca).toBe(26)
  })

  it('sem sacas informadas, os valores por saca ficam nulos', () => {
    const sem = resumoGraos('2026-06', lancamentos, mapa, {})
    expect(sem.sacasTotal).toBe(0)
    expect(sem.lucroLiquidoPorSaca).toBeNull()
    expect(sem.graos[0].lucroBrutoPorSaca).toBeNull()
  })
})
