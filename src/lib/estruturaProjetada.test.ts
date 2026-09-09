import { describe, it, expect } from 'vitest'
import { projetarEstrutura, LINHAS_PROJETAVEIS } from './estruturaProjetada'
import { mapaEfetivo } from './planoContas'
import type { LancamentoCanonico } from './tipos'

const mapa = mapaEfetivo([])
const l = (id: string, conta: string, valor: number, data: string): LancamentoCanonico => ({
  id,
  data,
  contaSafragold: conta,
  historico: id,
  valor,
  origem: 'planilha',
})

// Julho da planilha real: folha, pró-labore, depreciação, juros e capex.
const JULHO = [
  l('p-salarios', '4.3.01', 78_220.2, '2026-07-31'),
  l('p-prolabore', '4.3.03', 27_000, '2026-07-31'),
  l('p-deprec', '4.5.01', 8_627.64, '2026-07-31'),
  l('p-juros', '4.4.01', 28_297.16, '2026-07-31'),
  l('p-capex', '5.1.01', 25_000, '2026-07-31'),
  // Trading — NUNCA deve ser projetado.
  l('p-receita', '3.1.01', 23_187_057.86, '2026-07-31'),
  l('p-cpv', '4.1.01', 22_730_955.23, '2026-07-31'),
]

describe('projetarEstrutura', () => {
  it('repete a estrutura de julho em agosto, com data de fechamento', () => {
    const r = projetarEstrutura(JULHO, '2026-08', mapa)
    expect(r.resumo?.base).toBe('2026-07')
    expect(r.resumo?.alvo).toBe('2026-08')
    expect(r.lancamentos.every((x) => x.data === '2026-08-31')).toBe(true)
    expect(r.lancamentos.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(167_145, 0)
  })

  it('NUNCA projeta receita nem custo — isso seria inventar o resultado', () => {
    const r = projetarEstrutura(JULHO, '2026-08', mapa)
    const contas = r.lancamentos.map((x) => x.contaSafragold)
    expect(contas).not.toContain('3.1.01')
    expect(contas).not.toContain('4.1.01')
    expect(LINHAS_PROJETAVEIS).not.toContain('receita_bruta')
    expect(LINHAS_PROJETAVEIS).not.toContain('custo_produto')
  })

  it('marca cada lançamento como projetado, para nenhuma tela achar que é real', () => {
    const r = projetarEstrutura(JULHO, '2026-08', mapa)
    expect(r.lancamentos.every((x) => x.origem === 'projetado')).toBe(true)
    expect(r.lancamentos.every((x) => x.id.startsWith('projetado-'))).toBe(true)
    expect(r.lancamentos[0].historico).toContain('projetado de 2026-07')
  })

  it('dado real VENCE estimativa: com a planilha cobrindo o mês, não projeta', () => {
    const comAgosto = [...JULHO, l('p-sal-ago', '4.3.01', 80_000, '2026-08-31')]
    const r = projetarEstrutura(comAgosto, '2026-08', mapa)
    expect(r.lancamentos).toEqual([])
    expect(r.resumo).toBeNull()
  })

  it('usa o mês fechado mais RECENTE antes do alvo', () => {
    const comJunho = [...JULHO, l('p-sal-jun', '4.3.01', 60_000, '2026-06-30')]
    const r = projetarEstrutura(comJunho, '2026-08', mapa)
    expect(r.resumo?.base).toBe('2026-07')
  })

  it('não projeta para trás — sem mês anterior, não inventa', () => {
    const r = projetarEstrutura(JULHO, '2026-06', mapa)
    expect(r.resumo).toBeNull()
  })

  it('sem planilha nenhuma não quebra', () => {
    expect(projetarEstrutura([], '2026-08', mapa).lancamentos).toEqual([])
  })

  it('o resumo abre por linha, para a tela poder mostrar o que foi estimado', () => {
    const r = projetarEstrutura(JULHO, '2026-08', mapa)
    const linhas = r.resumo!.linhas.map((x) => x.linha)
    expect(linhas).toContain('despesas_administrativas')
    expect(linhas).toContain('depreciacao_amortizacao')
    expect(linhas).toContain('investimentos')
  })
})
