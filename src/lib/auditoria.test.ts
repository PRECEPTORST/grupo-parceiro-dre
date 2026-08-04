import { describe, it, expect } from 'vitest'
import { analisarAuditoria } from './auditoria'
import type { LancamentoCanonico, MapaClassificacao } from './tipos'

const mapa: MapaClassificacao = {
  REC: 'receita_bruta',
  DED: 'deducoes',
  CPV: 'custo_produto',
  ADM: 'despesas_administrativas',
  DEP: 'depreciacao_amortizacao',
  IL: 'impostos_lucro',
  PERDA: 'despesas_administrativas',
}

function lanc(id: string, data: string, conta: string, valor: number, hist = ''): LancamentoCanonico {
  return { id, data, contaSafragold: conta, historico: hist, valor }
}

// Dois meses "saudáveis" + um mês com perda concentrada. Receita alta, deduções
// mínimas, sem imposto sobre lucro, depreciação chapada.
const base: LancamentoCanonico[] = [
  // jan
  lanc('r1', '2026-01-31', 'REC', 10_000_000, 'Vendas'),
  lanc('d1', '2026-01-31', 'DED', 5_000, 'ICMS'),
  lanc('c1', '2026-01-31', 'CPV', 9_400_000, 'Compra de cereais'),
  lanc('a1', '2026-01-31', 'ADM', 100_000, 'Salários'),
  lanc('p1', '2026-01-31', 'DEP', 8_627.64, 'Depreciação'),
  // fev
  lanc('r2', '2026-02-28', 'REC', 12_000_000, 'Vendas'),
  lanc('d2', '2026-02-28', 'DED', 6_000, 'ICMS'),
  lanc('c2', '2026-02-28', 'CPV', 11_300_000, 'Compra de cereais'),
  lanc('a2', '2026-02-28', 'ADM', 120_000, 'Salários'),
  lanc('p2', '2026-02-28', 'DEP', 8_627.64, 'Depreciação'),
  // mar — perda concentrada numa conta (inadimplência)
  lanc('r3', '2026-03-31', 'REC', 11_000_000, 'Vendas'),
  lanc('d3', '2026-03-31', 'DED', 5_500, 'ICMS'),
  lanc('c3', '2026-03-31', 'CPV', 10_400_000, 'Compra de cereais'),
  lanc('a3', '2026-03-31', 'ADM', 90_000, 'Salários'),
  lanc('perda3', '2026-03-31', 'PERDA', 900_000, 'Perda com inadimplência'),
  lanc('p3', '2026-03-31', 'DEP', 8_627.64, 'Depreciação'),
]

describe('analisarAuditoria', () => {
  // Só março tem resultado declarado (e diverge de propósito) → só março reconcilia.
  const rel = analisarAuditoria(base, mapa, { '2026-03': -350_000 })
  const cat = (c: string) => rel.achados.find((a) => a.categoria === c)

  it('lista as competências em ordem e soma a receita', () => {
    expect(rel.competencias).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(rel.receitaBrutaTotal).toBe(33_000_000)
  })

  it('acusa tributos sobre vendas quase ausentes (alta)', () => {
    const a = cat('tributos_vendas')
    expect(a?.severidade).toBe('alta')
  })

  it('acusa ausência de IRPJ/CSLL com resultado positivo', () => {
    // jan+fev positivos > mar negativo → antes do IR acumulado > 0.
    expect(cat('imposto_lucro')?.severidade).toBe('alta')
  })

  it('acusa depreciação idêntica em ≥3 meses', () => {
    const a = cat('depreciacao')
    expect(a?.severidade).toBe('media')
    expect(a?.competencias.length).toBe(3)
    expect(a?.valor).toBeCloseTo(8_627.64, 2)
  })

  it('acusa concentração da despesa do mês numa conta (perda de março)', () => {
    const a = cat('concentracao')
    expect(a).toBeTruthy()
    expect(a?.competencias).toEqual(['2026-03'])
    expect(a?.valor).toBe(900_000)
  })

  it('reconcilia contra o resultado declarado e acha a divergência de março', () => {
    const a = cat('reconciliacao')
    expect(a).toBeTruthy()
    expect(a?.competencias).toEqual(['2026-03'])
  })

  it('ordena por severidade (alta primeiro)', () => {
    const sev = rel.achados.map((a) => a.severidade)
    const idx = { alta: 0, media: 1, baixa: 2 } as const
    for (let i = 1; i < sev.length; i++) {
      expect(idx[sev[i]]).toBeGreaterThanOrEqual(idx[sev[i - 1]])
    }
  })

  it('não acusa reconciliação quando não há resultado declarado', () => {
    const semDecl = analisarAuditoria(base, mapa)
    expect(semDecl.achados.find((a) => a.categoria === 'reconciliacao')).toBeUndefined()
  })

  it('não acusa tributos quando a carga é normal', () => {
    const comImposto = [...base, lanc('big-ded', '2026-01-31', 'DED', 900_000, 'PIS/COFINS')]
    const rel2 = analisarAuditoria(comImposto, mapa)
    expect(rel2.achados.find((a) => a.categoria === 'tributos_vendas')).toBeUndefined()
  })
})
