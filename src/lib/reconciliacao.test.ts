import { describe, it, expect } from 'vitest'
import { reconciliar } from './reconciliacao'
import { mapaEfetivo } from './planoContas'
import type { LancamentoCanonico } from './tipos'

const mapa = mapaEfetivo([])

function l(
  id: string,
  conta: string,
  valor: number,
  data = '2026-06-15',
  origem: LancamentoCanonico['origem'] = 'planilha',
): LancamentoCanonico {
  return { id, data, contaSafragold: conta, historico: id, valor, origem }
}

describe('reconciliar', () => {
  it('linhas que batem não viram achado', () => {
    const planilha = [l('p1', '3.1.01', 1_000_000)]
    const enoki = [l('e1', '3.1.01', 1_000_000, '2026-06-15', 'enoki')]
    const r = reconciliar(planilha, enoki, mapa)
    expect(r.divergencias).toHaveLength(0)
    expect(r.competencias).toEqual(['2026-06'])
  })

  it('ignora ruído de arredondamento (abaixo do piso E do percentual)', () => {
    const planilha = [l('p1', '3.1.01', 40_000_000)]
    const enoki = [l('e1', '3.1.01', 40_000_800, '2026-06-15', 'enoki')]
    const r = reconciliar(planilha, enoki, mapa)
    expect(r.divergencias).toHaveLength(0)
  })

  it('pega um mês inteiro classificado errado (R$ 910k numa linha de R$ 3M)', () => {
    // Espelha o achado real: inadimplência de R$ 910k que a API não vê.
    const planilha = [l('p1', '4.3.01', 3_000_000)]
    const enoki = [l('e1', '4.3.01', 2_090_000, '2026-06-15', 'enoki')]
    const r = reconciliar(planilha, enoki, mapa)
    expect(r.divergencias).toHaveLength(1)
    const d = r.divergencias[0]
    expect(d.linha).toBe('despesas_administrativas')
    expect(d.diferenca).toBeCloseTo(-910_000, 2)
    expect(d.diferencaPct).toBeCloseTo(30.3, 1)
    expect(d.severidade).toBe('alta')
  })

  it('linha que só existe na planilha é explicada como "a API não vê"', () => {
    const planilha = [l('p-dep', '4.5.01', 8_627)]
    const r = reconciliar(planilha, [l('e1', '3.1.01', 100, '2026-06-15', 'enoki')], mapa)
    const dep = r.divergencias.find((d) => d.linha === 'depreciacao_amortizacao')!
    expect(dep.enoki).toBe(0)
    expect(dep.detalhe).toContain('não passa pelo módulo financeiro')
  })

  it('linha que só existe na API é explicada como "a planilha esqueceu"', () => {
    const enoki = [l('e-ded', '3.2.06', 20_000, '2026-06-15', 'enoki')]
    const r = reconciliar([l('p1', '3.1.01', 100)], enoki, mapa)
    const ded = r.divergencias.find((d) => d.linha === 'deducoes')!
    expect(ded.planilha).toBe(0)
    expect(ded.detalhe).toContain('planilha não tem nada')
  })

  it('severidade: valor grande é ALTA mesmo com percentual pequeno', () => {
    const planilha = [l('p1', '3.1.01', 40_000_000)]
    const enoki = [l('e1', '3.1.01', 39_400_000, '2026-06-15', 'enoki')]
    const r = reconciliar(planilha, enoki, mapa)
    expect(r.divergencias[0].severidade).toBe('alta') // R$ 600k > piso de alta
    expect(r.divergencias[0].diferencaPct).toBeLessThan(2.1)
  })

  it('ordena por severidade e depois por valor', () => {
    const planilha = [l('p1', '3.1.01', 10_000_000), l('p2', '4.3.01', 100_000)]
    const enoki = [
      l('e1', '3.1.01', 9_000_000, '2026-06-15', 'enoki'), // −1M, alta
      l('e2', '4.3.01', 80_000, '2026-06-15', 'enoki'), // −20k, 20% → média
    ]
    const r = reconciliar(planilha, enoki, mapa)
    expect(r.divergencias.map((d) => d.severidade)).toEqual(['alta', 'media'])
  })

  it('só reconcilia competências que existem nas DUAS fontes', () => {
    const planilha = [l('p-jun', '3.1.01', 100_000, '2026-06-15'), l('p-mai', '3.1.01', 90_000, '2026-05-15')]
    const enoki = [
      l('e-jun', '3.1.01', 100_000, '2026-06-15', 'enoki'),
      l('e-jul', '3.1.01', 80_000, '2026-07-15', 'enoki'),
    ]
    const r = reconciliar(planilha, enoki, mapa)
    expect(r.competencias).toEqual(['2026-06'])
    expect(r.competenciasSoPlanilha).toEqual(['2026-05'])
    expect(r.competenciasSoEnoki).toEqual(['2026-07'])
  })

  it('resume os totais das duas fontes no período comum', () => {
    const planilha = [l('p1', '3.1.01', 1_000_000), l('p2', '4.1.01', 800_000)]
    const enoki = [
      l('e1', '3.1.01', 1_100_000, '2026-06-15', 'enoki'),
      l('e2', '4.1.01', 800_000, '2026-06-15', 'enoki'),
    ]
    const r = reconciliar(planilha, enoki, mapa)
    expect(r.receitaBruta.enoki).toBeCloseTo(1_100_000, 2)
    expect(r.receitaBruta.planilha).toBeCloseTo(1_000_000, 2)
    expect(r.receitaBruta.diferenca).toBeCloseTo(100_000, 2)
    expect(r.resultadoLiquido.diferenca).toBeCloseTo(100_000, 2)
  })

  it('descasamento de COMPETÊNCIA aparece nos dois meses, com sinais opostos', () => {
    // Estorno lançado em abril na planilha e em maio na API — o caso real.
    const planilha = [l('p-abr', '3.2.06', 910_000, '2026-04-30')]
    const enoki = [
      l('e-abr', '3.1.01', 5_000_000, '2026-04-15', 'enoki'),
      l('e-mai', '3.2.06', 910_000, '2026-05-20', 'enoki'),
    ]
    const planilhaCompleta = [...planilha, l('p-mai', '3.1.01', 5_000_000, '2026-05-10')]
    const r = reconciliar(planilhaCompleta, enoki, mapa)
    const abr = r.divergencias.find((d) => d.competencia === '2026-04' && d.linha === 'deducoes')!
    const mai = r.divergencias.find((d) => d.competencia === '2026-05' && d.linha === 'deducoes')!
    expect(abr.diferenca).toBeCloseTo(-910_000, 2) // falta na API em abril
    expect(mai.diferenca).toBeCloseTo(910_000, 2) // sobra na API em maio
  })

  it('opções de materialidade são configuráveis', () => {
    const planilha = [l('p1', '3.1.01', 100_000)]
    const enoki = [l('e1', '3.1.01', 96_000, '2026-06-15', 'enoki')]
    expect(reconciliar(planilha, enoki, mapa).divergencias).toHaveLength(0) // R$ 4k < piso
    expect(reconciliar(planilha, enoki, mapa, { piso: 1_000 }).divergencias).toHaveLength(1)
  })
})
