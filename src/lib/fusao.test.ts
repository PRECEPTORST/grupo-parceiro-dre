import { describe, it, expect } from 'vitest'
import {
  fundirLancamentos,
  configFusaoPadrao,
  configFusaoEfetiva,
  linhasSubstituidas,
  type ConfigFusao,
  coberturaFusao,
  competenciasNaoFundiveis,
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
  // Capex e "descontos obtidos" só existem na planilha — a conferência de
  // julho/2026 mostrou o ERP com zero nas duas.
  l('p-capex', '5.1.01', 50_000, 'planilha'), // estrutura (vence)
  l('p-outras', '3.4.04', 21_283, 'planilha'), // estrutura (vence)
]

const ENOKI = [
  l('e-receita', '3.1.01', 950_000, 'enoki'), // vence
  l('e-cpv', '4.1.01', 720_000, 'enoki'), // vence
  l('e-frete', '4.1.10', 30_000, 'enoki'), // vence
  l('e-deducao', '3.2.06', 4_000, 'enoki'), // vence
  l('e-capex', '5.1.01', 300, 'enoki'), // preterido: capex vem da planilha
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
    expect(v('investimentos')).toBeCloseTo(50_000, 2) // planilha, não os 300 do ERP
    expect(v('outras_receitas_operacionais')).toBeCloseTo(21_283, 2) // planilha

    // 950.000 − 4.000 − 750.000 − 120.000 + 21.283 − 8.627 − 15.000 − 5.000
    expect(dre.realizado.resultadoLiquido).toBeCloseTo(68_656, 2)
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

  it('com UMA fonte só, ela preenche tudo — e a troca fica registrada', () => {
    // Sem isto, agosto/2026 saía com despesa administrativa ZERO: a planilha não
    // cobria o mês, a regra mandava ler dela, e os R$ 161 mil que o ERP trouxe
    // eram jogados fora.
    const soEnoki = fundirLancamentos([], ENOKI, mapa, config)
    expect(soEnoki.lancamentos.map((x) => x.id).sort()).toEqual([
      'e-capex',
      'e-cpv',
      'e-deducao',
      'e-frete',
      'e-receita',
    ])
    expect(soEnoki.substituicoes.map((s) => s.linha)).toContain('investimentos')
    // E o mesmo vale ao contrário: com só a planilha, ela preenche o DRE inteiro.
    const soPlanilha = fundirLancamentos(PLANILHA, [], mapa, config)
    expect(soPlanilha.lancamentos.map((x) => x.id).sort()).toEqual([
      'p-capex',
      'p-cpv',
      'p-deprec',
      'p-folha',
      'p-irpj',
      'p-juros',
      'p-outras',
      'p-receita',
    ])
  })
})

describe('linhasOrfas', () => {
  it('PREENCHE a linha cuja fonte escolhida está vazia, em vez de zerá-la', () => {
    // A folha só existe na planilha, mas a config manda ler da Enoki. Avisar não
    // bastava: o DRE saía com despesa zero enquanto o alerta piscava ao lado.
    const config: ConfigFusao = { ...configFusaoPadrao(), despesas_administrativas: 'enoki' }
    const r = fundirLancamentos(PLANILHA, ENOKI, mapa, config)
    const dre = montarDre('2026-06', r.lancamentos, mapa)
    expect(dre.linhas.find((l) => l.linha === 'despesas_administrativas')!.realizado)
      .toBeCloseTo(120_000, 2)

    const troca = linhasSubstituidas(r).find((t) => t.linha === 'despesas_administrativas')!
    expect(troca.usada).toBe('planilha')
    expect(troca.valor).toBeCloseTo(120_000, 2)
  })

  it('a fonte configurada VENCE quando ela tem dado — substituição é só para o vazio', () => {
    const r = fundirLancamentos(PLANILHA, ENOKI, mapa, configFusaoPadrao())
    const dre = montarDre('2026-06', r.lancamentos, mapa)
    // Receita existe nas duas; a configurada (Enoki) manda.
    expect(dre.linhas.find((l) => l.linha === 'receita_bruta')!.realizado).toBeCloseTo(950_000, 2)
    expect(linhasSubstituidas(r)).toHaveLength(0)
  })
})

describe('coberturaFusao — a fusão só vale onde as duas fontes cobrem', () => {
  // Regressão do −R$ 1.615.888,01: o Enoki cobria só julho, a planilha jan–jul,
  // e o acumulado do modo fundido subtraiu sete meses de estrutura de um mês de
  // margem bruta. Nada na tela dizia isso.
  const l = (data: string, conta = '3.1.01', valor = 100): LancamentoCanonico => ({
    id: `x-${data}-${conta}`, data, contaSafragold: conta, historico: '', valor,
  })

  it('marca como NÃO fundível o mês em que só uma fonte tem dados', () => {
    const cob = coberturaFusao(
      [l('2026-06-30'), l('2026-07-31')],
      [l('2026-07-15')],
    )
    const jun = cob.find((c) => c.competencia === '2026-06')!
    const jul = cob.find((c) => c.competencia === '2026-07')!
    expect(jun.fundivel).toBe(false)
    expect(jun.temPlanilha).toBe(true)
    expect(jun.temEnoki).toBe(false)
    expect(jul.fundivel).toBe(true)
  })

  it('o mês só do Enoki também não é fundível', () => {
    const cob = coberturaFusao([], [l('2026-08-10')])
    expect(cob[0].fundivel).toBe(false)
    expect(cob[0].temPlanilha).toBe(false)
  })

  it('competenciasNaoFundiveis lista exatamente o que não pode ser lido', () => {
    const nf = competenciasNaoFundiveis(
      [l('2026-05-31'), l('2026-06-30'), l('2026-07-31')],
      [l('2026-07-15')],
    )
    expect(nf.map((c) => c.competencia)).toEqual(['2026-05', '2026-06'])
  })

  it('com as duas fontes cobrindo tudo, não sobra nada em aberto', () => {
    expect(
      competenciasNaoFundiveis([l('2026-07-31')], [l('2026-07-15')]),
    ).toEqual([])
  })

  it('sem dado nenhum não quebra', () => {
    expect(coberturaFusao([], [])).toEqual([])
  })
})
