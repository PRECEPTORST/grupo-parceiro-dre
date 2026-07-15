import { describe, it, expect } from 'vitest'
import { projetarCaixa, projetarCaixaDiario, addMeses, addDiasISO } from './caixa'
import { mapaDeClassificacoes } from './dre'
import { premissasCaixaPadrao } from './tipos'
import type {
  Classificacao,
  LancamentoCanonico,
  Orcamento,
  PremissasCaixa,
  MovimentoCaixa,
} from './tipos'

const classificacoes: Classificacao[] = [
  { contaSafragold: '3.1.01', linha: 'receita_bruta', confianca: 1, justificativa: '' },
  { contaSafragold: '4.1.01', linha: 'custo_produto', confianca: 1, justificativa: '' },
  { contaSafragold: '5.0.00', linha: 'depreciacao_amortizacao', confianca: 1, justificativa: '' },
]
const mapa = mapaDeClassificacoes(classificacoes)

function lanc(id: string, data: string, conta: string, valor: number): LancamentoCanonico {
  return { id, data, contaSafragold: conta, historico: '', valor }
}

function premissas(over: Partial<PremissasCaixa> = {}): PremissasCaixa {
  return {
    ...premissasCaixaPadrao(),
    saldoInicial: 100_000,
    competenciaSaldo: '2026-07',
    horizonteMeses: 3,
    prazoRecebimentoDias: 30,
    prazoPagamentoDias: 30,
    prazoImpostosDias: 30,
    metodoProjecao: 'orcamento_historico',
    mesesBaseHistorico: 3,
    ...over,
  }
}

describe('addMeses', () => {
  it('avança e vira o ano', () => {
    expect(addMeses('2026-07', 6)).toBe('2027-01')
    expect(addMeses('2026-01', -1)).toBe('2025-12')
  })
})

describe('projetarCaixa — deslocamento por prazo', () => {
  // Receita de junho (competência) com prazo 30d cai como ENTRADA em julho.
  const lancamentos = [lanc('r', '2026-06-10', '3.1.01', 500_000)]

  it('recebível de junho entra no caixa de julho', () => {
    const p = premissas({ metodoProjecao: 'orcamento' }) // sem orçamento futuro → sem projeção
    const proj = projetarCaixa(lancamentos, mapa, [], p)
    const jul = proj.meses.find((m) => m.competencia === '2026-07')!
    expect(jul.entradas).toBe(500_000)
    expect(jul.saldoFinal).toBe(600_000) // 100k inicial + 500k
  })

  it('não conta o mesmo recebível duas vezes', () => {
    const p = premissas({ metodoProjecao: 'orcamento' })
    const proj = projetarCaixa(lancamentos, mapa, [], p)
    const total = proj.meses.reduce((s, m) => s + m.entradas, 0)
    expect(total).toBe(500_000)
  })
})

describe('projetarCaixa — depreciação é não-caixa', () => {
  it('ignora depreciação no fluxo', () => {
    const lancamentos = [lanc('d', '2026-07-10', '5.0.00', 80_000)]
    const p = premissas({ prazoPagamentoDias: 0, metodoProjecao: 'orcamento' })
    const proj = projetarCaixa(lancamentos, mapa, [], p)
    const totalSaidas = proj.meses.reduce((s, m) => s + m.saidas, 0)
    expect(totalSaidas).toBe(0)
  })
})

describe('projetarCaixa — saldo negativo e menor saldo', () => {
  it('sinaliza o primeiro mês negativo e o menor saldo', () => {
    // Custo de julho (prazo 0) = saída em julho, maior que o saldo inicial.
    const lancamentos = [lanc('c', '2026-07-05', '4.1.01', 150_000)]
    const p = premissas({ prazoPagamentoDias: 0, metodoProjecao: 'orcamento' })
    const proj = projetarCaixa(lancamentos, mapa, [], p)
    const jul = proj.meses.find((m) => m.competencia === '2026-07')!
    expect(jul.saldoFinal).toBe(-50_000)
    expect(jul.negativo).toBe(true)
    expect(proj.primeiroMesNegativo).toBe('2026-07')
    expect(proj.menorSaldo).toEqual({ competencia: '2026-07', saldo: -50_000 })
  })
})

describe('projetarCaixa — projeção futura por orçamento/histórico', () => {
  const lancamentos = [
    lanc('r5', '2026-05-10', '3.1.01', 400_000),
    lanc('r6', '2026-06-10', '3.1.01', 600_000),
  ]

  it('usa o orçamento da competência futura quando existe', () => {
    const orc: Orcamento = {
      competencia: '2026-08',
      valores: { '3.1.01': 1_000_000 },
      origem: 'manual',
      atualizadoEm: '2026-07-01T00:00:00Z',
    }
    // Ago competência com prazo 30d → entra em set.
    const p = premissas({ horizonteMeses: 4, metodoProjecao: 'orcamento_historico' })
    const proj = projetarCaixa(lancamentos, mapa, [orc], p)
    const set = proj.meses.find((m) => m.competencia === '2026-09')!
    expect(set.entradas).toBe(1_000_000)
  })

  it('cai na média do histórico quando não há orçamento', () => {
    // Média de mai+jun = (400k+600k)/2 = 500k. Julho (futuro, sem orçamento) →
    // projeta 500k de competência → entra no caixa em agosto (prazo 30d).
    const p = premissas({ horizonteMeses: 3, mesesBaseHistorico: 3 })
    const proj = projetarCaixa(lancamentos, mapa, [], p)
    const ago = proj.meses.find((m) => m.competencia === '2026-08')!
    expect(ago.entradas).toBe(500_000)
  })
})

describe('projetarCaixa — seam do Enoki (movimentos reais)', () => {
  it('sobrepõe a estimativa por prazo com o movimento real do mês', () => {
    const lancamentos = [lanc('r', '2026-06-10', '3.1.01', 500_000)]
    const reais: MovimentoCaixa[] = [
      { id: 'e1', data: '2026-07-20', tipo: 'entrada', valor: 320_000 },
    ]
    const p = premissas({ metodoProjecao: 'orcamento' })
    const proj = projetarCaixa(lancamentos, mapa, [], p, reais)
    const jul = proj.meses.find((m) => m.competencia === '2026-07')!
    expect(jul.entradas).toBe(320_000) // real (320k) no lugar da estimativa (500k)
    expect(proj.usouReais).toBe(true)
  })
})

describe('addDiasISO', () => {
  it('avança dias respeitando o calendário', () => {
    expect(addDiasISO('2026-06-10', 30)).toBe('2026-07-10')
    expect(addDiasISO('2026-01-31', 1)).toBe('2026-02-01')
  })
})

describe('projetarCaixaDiario — dia a dia dentro do mês', () => {
  // Receita 2026-06-10 (prazo 30) → entra no caixa em 2026-07-10.
  const lancamentos = [lanc('r', '2026-06-10', '3.1.01', 500_000)]

  it('coloca a entrada no dia exato e roda o saldo pelos dias', () => {
    const p = premissas({ metodoProjecao: 'orcamento' })
    const d = projetarCaixaDiario('2026-07', lancamentos, mapa, [], p)
    expect(d.dias).toHaveLength(31)
    const d9 = d.dias.find((x) => x.data === '2026-07-09')!
    const d10 = d.dias.find((x) => x.data === '2026-07-10')!
    expect(d9.saldoFinal).toBe(100_000) // saldo inicial, antes da entrada
    expect(d10.entradas).toBe(500_000)
    expect(d10.saldoFinal).toBe(600_000)
    expect(d.saldoFechamento).toBe(600_000)
  })

  it('o diário fecha igual ao mensal (mesma base de eventos)', () => {
    const p = premissas({ metodoProjecao: 'orcamento' })
    const mensal = projetarCaixa(lancamentos, mapa, [], p)
    const jul = mensal.meses.find((m) => m.competencia === '2026-07')!
    const d = projetarCaixaDiario('2026-07', lancamentos, mapa, [], p)
    const entradasDiarias = d.dias.reduce((s, x) => s + x.entradas, 0)
    expect(entradasDiarias).toBe(jul.entradas)
    expect(d.saldoFechamento).toBe(jul.saldoFinal)
  })

  it('marca dias negativos e o menor saldo do mês', () => {
    // Custo 2026-07-05 (prazo 0) derruba o caixa a partir do dia 5.
    const comCusto = [lanc('c', '2026-07-05', '4.1.01', 150_000)]
    const p = premissas({ prazoPagamentoDias: 0, metodoProjecao: 'orcamento' })
    const d = projetarCaixaDiario('2026-07', comCusto, mapa, [], p)
    expect(d.dias.find((x) => x.data === '2026-07-04')!.saldoFinal).toBe(100_000)
    expect(d.dias.find((x) => x.data === '2026-07-05')!.saldoFinal).toBe(-50_000)
    expect(d.menorSaldo).toEqual({ data: '2026-07-05', saldo: -50_000 })
    expect(d.diasNegativos).toBe(27) // dias 5..31
  })
})
