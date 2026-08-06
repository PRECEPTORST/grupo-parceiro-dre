import { describe, it, expect } from 'vitest'
import { serieMargemContribuicao } from './margemContribuicao'
import type { LancamentoCanonico, MapaClassificacao } from './tipos'

const mapa: MapaClassificacao = {
  REC: 'receita_bruta',
  DED: 'deducoes',
  CPV: 'custo_produto',
  ADM: 'despesas_administrativas',
}
const L = (id: string, data: string, conta: string, valor: number): LancamentoCanonico => ({
  id,
  data,
  contaSafragold: conta,
  historico: '',
  valor,
})

describe('serieMargemContribuicao', () => {
  const lanc = [
    // jan: receita 1000, dedução 100 → líquida 900; CPV 600 → MC 300 (33,33%)
    L('r1', '2026-01-31', 'REC', 1000),
    L('d1', '2026-01-31', 'DED', 100),
    L('c1', '2026-01-31', 'CPV', 600),
    L('a1', '2026-01-31', 'ADM', 50), // não afeta a MC
    // fev: receita 2000, sem dedução; CPV 1000 → MC 1000 (50%)
    L('r2', '2026-02-28', 'REC', 2000),
    L('c2', '2026-02-28', 'CPV', 1000),
  ]
  const serie = serieMargemContribuicao(['2026-02', '2026-01'], lanc, mapa)

  it('ordena cronologicamente', () => {
    expect(serie.map((p) => p.competencia)).toEqual(['2026-01', '2026-02'])
  })

  it('MC = receita líquida − CPV (despesas fixas não entram)', () => {
    expect(serie[0].mc).toBe(300)
    expect(serie[1].mc).toBe(1000)
  })

  it('calcula o % sobre a receita líquida', () => {
    expect(serie[0].mcPct).toBeCloseTo(33.333, 2)
    expect(serie[1].mcPct).toBe(50)
  })

  it('% é null quando não há receita', () => {
    const so = serieMargemContribuicao(['2026-03'], [L('x', '2026-03-31', 'CPV', 100)], mapa)
    expect(so[0].mcPct).toBeNull()
  })
})
