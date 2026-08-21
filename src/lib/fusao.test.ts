import { describe, it, expect } from 'vitest'
import {
  fundirLancamentos,
  configFusaoPadrao,
  configFusaoEfetiva,
  linhasOrfas,
  type ConfigFusao,
} from './fusao'
import { montarDre } from './dre'
import { mapaEfetivo } from './planoContas'
import { LINHAS_DRE, type LancamentoCanonico } from './tipos'

const mapa = mapaEfetivo([])

function l(
  id: string,
  conta: string,
  valor: number,
  origem: LancamentoCanonico['origem'],
): LancamentoCanonico {
  return { id, data: '2026-06-15', contaSafragold: conta, historico: id, valor, origem }
}

// Cenário realista: as duas fontes cobrem o MESMO mês, cada uma à sua maneira.
const PLANILHA = [
  l('p-receita', '3.1.01', 900_000, 'planilha'), // trading (será preterido)
  l('p-cpv', '4.1.01', 700_000, 'planilha'), // trading (será preterido)
  l('p-folha', '4.3.01', 120_000, 'planilha'), // estrutura (vence)
  l('p-deprec', '4.5.01', 8_627, 'planilha'), // estrutura (vence)
  l('p-juros', '4.4.01', 15_000, 'planilha'), // estrutura (vence)
  l('p-irpj', '4.6.01', 5_000, 'planilha'), // estrutura (vence)
]

const ENOKI = [
  l('e-receita', '3.1.01', 950_000, 'enoki'), // vence
  l('e-cpv', '4.1.01', 720_000, 'enoki'), // vence
  l('e-frete', '4.1.10', 30_000, 'enoki'), // vence
  l('e-deducao', '3.2.06', 4_000, 'enoki'), // vence
  l('e-capex', '5.1.01', 50_000, 'enoki'), // vence
]

describe('configFusaoPadrao', () => {
  it('cobre TODA linha do DRE (nenhuma fica sem fonte)', () => {
    const c = configFusaoPadrao()
    for (const linha of LINHAS_DRE) expect(c[linha], linha).toMatch(/^(enoki|planilha)$/)
  })

  it('trading vem da Enoki, estrutura vem da planilha', () => {
    const c = configFusaoPadrao()
    expect(c.receita_bruta).toBe('enoki')
    expect(c.custo_produto).toBe('enoki')
    expect(c.deducoes).toBe('enoki')
    expect(c.despesas_administrativas).toBe('planilha')
    expect(c.depreciacao_amortizacao).toBe('planilha')
    expect(c.impostos_lucro).toBe('planilha')
  })
})

describe('configFusaoEfetiva', () => {
  it('completa configuração parcial com o padrão', () => {
    const c = configFusaoEfetiva({ receita_bruta: 'planilha' })
    expect(c.receita_bruta).toBe('planilha')
    expect(c.custo_produto).toBe('enoki') // do padrão
  })

  it('ignora valor inválido e ausência', () => {
    expect(configFusaoEfetiva(null)).toEqual(configFusaoPadrao())
    const c = configFusaoEfetiva({ receita_bruta: 'xpto' as never })
    expect(c.receita_bruta).toBe('enoki')
  })
})

describe('fundirLancamentos', () => {
  const config = configFusaoPadrao()

  it('NÃO conta a mesma linha duas vezes', () => {
    const r = fundirLancamentos(PLANILHA, ENOKI, mapa, config)
    const ids = r.lancamentos.map((x) => x.id)
    // Receita e CPV vêm só da Enoki; folha/depreciação/juros/IRPJ só da planilha.
    expect(ids).toContain('e-receita')
    expect(ids).not.toContain('p-receita')
    expect(ids).toContain('p-folha')
    expect(ids).toContain('p-deprec')
    expect(ids).toContain('p-juros')
    expect(ids).toContain('p-irpj')
    expect(ids).not.toContain('p-cpv')
  })

  it('o DRE fundido soma trading da Enoki + estrutura da planilha', () => {
    const r = fundirLancamentos(PLANILHA, ENOKI, mapa, config)
    const dre = montarDre('2026-06', r.lancamentos, mapa)
    const v = (nome: string) => dre.linhas.find((x) => x.linha === nome)!.realizado

    expect(v('receita_bruta')).toBeCloseTo(950_000, 2) // Enoki, não 900.000
    expect(v('deducoes')).toBeCloseTo(4_000, 2)
    expect(v('custo_produto')).toBeCloseTo(750_000, 2) // 720.000 + 30.000 frete
    expect(v('despesas_administrativas')).toBeCloseTo(120_000, 2) // planilha
    expect(v('depreciacao_amortizacao')).toBeCloseTo(8_627, 2)
    expect(v('despesa_financeira')).toBeCloseTo(15_000, 2)
    expect(v('impostos_lucro')).toBeCloseTo(5_000, 2)
    expect(v('investimentos')).toBeCloseTo(50_000, 2)

    // 950.000 − 4.000 − 750.000 − 120.000 − 8.627 − 15.000 − 5.000 = 47.373
    expect(dre.realizado.resultadoLiquido).toBeCloseTo(47_373, 2)
  })

  it('o resumo diz o que entrou e o que foi preterido em cada linha', () => {
    const r = fundirLancamentos(PLANILHA, ENOKI, mapa, config)
    const receita = r.porLinha.find((x) => x.linha === 'receita_bruta')!
    expect(receita.fonte).toBe('enoki')
    expect(receita.aceitos).toBe(1)
    expect(receita.descartados).toBe(1)
    expect(receita.valorAceito).toBeCloseTo(950_000, 2)
    expect(receita.valorDescartado).toBeCloseTo(900_000, 2)
  })

  it('inverter a configuração inverte a leitura', () => {
    const invertida: ConfigFusao = { ...config, receita_bruta: 'planilha' }
    const r = fundirLancamentos(PLANILHA, ENOKI, mapa, invertida)
    const dre = montarDre('2026-06', r.lancamentos, mapa)
    expect(dre.linhas.find((x) => x.linha === 'receita_bruta')!.realizado).toBeCloseTo(900_000, 2)
  })

  it('conta fora do plano (só a planilha tem) é preservada para revisão', () => {
    const comEstranha = [...PLANILHA, l('p-estranha', 'CONTA QUE NAO EXISTE', 1_000, 'planilha')]
    const r = fundirLancamentos(comEstranha, ENOKI, mapa, config)
    expect(r.naoClassificados).toBe(1)
    expect(r.lancamentos.map((x) => x.id)).toContain('p-estranha')
  })

  it('funciona com uma fonte vazia', () => {
    const soEnoki = fundirLancamentos([], ENOKI, mapa, config)
    expect(soEnoki.lancamentos).toHaveLength(ENOKI.length)
    const soPlanilha = fundirLancamentos(PLANILHA, [], mapa, config)
    // Da planilha só sobrevivem as linhas configuradas como 'planilha'.
    expect(soPlanilha.lancamentos.map((x) => x.id).sort()).toEqual([
      'p-deprec',
      'p-folha',
      'p-irpj',
      'p-juros',
    ])
  })
})

describe('linhasOrfas', () => {
  it('denuncia a linha que ficaria com buraco silencioso', () => {
    // A folha só existe na planilha, mas a config manda ler da Enoki.
    const config: ConfigFusao = { ...configFusaoPadrao(), despesas_administrativas: 'enoki' }
    const r = fundirLancamentos(PLANILHA, ENOKI, mapa, config)
    const orfas = linhasOrfas(r)
    expect(orfas.map((o) => o.linha)).toContain('despesas_administrativas')
    expect(orfas.find((o) => o.linha === 'despesas_administrativas')!.valorDescartado).toBeCloseTo(
      120_000,
      2,
    )
  })

  it('sem órfãs na configuração padrão com as duas fontes completas', () => {
    const r = fundirLancamentos(PLANILHA, ENOKI, mapa, configFusaoPadrao())
    expect(linhasOrfas(r)).toHaveLength(0)
  })
})
