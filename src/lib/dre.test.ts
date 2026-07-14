import { describe, it, expect } from 'vitest'
import {
  montarDre,
  compararComOrcamento,
  mapaDeClassificacoes,
  competenciasDisponiveis,
} from './dre'
import type { LancamentoCanonico, Classificacao, Orcamento } from './tipos'

const classificacoes: Classificacao[] = [
  { contaSafragold: '3.1.01', linha: 'receita_bruta', confianca: 1, justificativa: '' },
  { contaSafragold: '3.2.01', linha: 'deducoes', confianca: 1, justificativa: '' },
  { contaSafragold: '4.1.01', linha: 'custo_produto', confianca: 1, justificativa: '' },
  { contaSafragold: '4.2.01', linha: 'despesas_administrativas', confianca: 1, justificativa: '' },
  { contaSafragold: '4.3.01', linha: 'despesa_financeira', confianca: 1, justificativa: '' },
]

const mapa = mapaDeClassificacoes(classificacoes)

function lanc(
  id: string,
  data: string,
  contaSafragold: string,
  valor: number,
): LancamentoCanonico {
  return { id, data, contaSafragold, historico: '', valor }
}

const lancamentos: LancamentoCanonico[] = [
  lanc('1', '2026-06-05', '3.1.01', 1_000_000), // receita bruta
  lanc('2', '2026-06-10', '3.2.01', 180_000), //   deduções
  lanc('3', '2026-06-12', '4.1.01', 600_000), //   CPV
  lanc('4', '2026-06-20', '4.2.01', 90_000), //    desp. adm
  lanc('5', '2026-06-25', '4.3.01', 30_000), //    desp. financeira
  lanc('6', '2026-05-30', '3.1.01', 500_000), //   receita de OUTRA competência
  lanc('7', '2026-06-28', '9.9.99', 12_345), //    conta NÃO classificada
]

describe('montarDre', () => {
  const dre = montarDre('2026-06', lancamentos, mapa)

  it('agrega só a competência pedida', () => {
    const receita = dre.linhas.find((l) => l.linha === 'receita_bruta')!
    expect(receita.valor).toBe(1_000_000) // não inclui os 500k de maio
  })

  it('calcula os subtotais na ordem correta', () => {
    expect(dre.receitaLiquida).toBe(820_000) // 1.000.000 - 180.000
    expect(dre.lucroBruto).toBe(220_000) //     820.000 - 600.000
    expect(dre.resultadoOperacional).toBe(130_000) // 220.000 - 90.000
    expect(dre.resultadoAntesIr).toBe(100_000) //     130.000 - 30.000 (financeiro)
    expect(dre.resultadoLiquido).toBe(100_000) //     sem IRPJ/CSLL no mês
  })

  it('não soma lançamentos de conta desconhecida numa linha; isola em naoClassificado', () => {
    expect(dre.naoClassificado).toBe(12_345)
    expect(dre.contasNaoClassificadas).toEqual(['9.9.99'])
  })
})

describe('compararComOrcamento', () => {
  it('aponta desvio absoluto e percentual por linha', () => {
    const dre = montarDre('2026-06', lancamentos, mapa)
    const orcamento: Orcamento = {
      competencia: '2026-06',
      valores: { receita_bruta: 800_000, custo_produto: 600_000 },
      origem: 'manual',
      atualizadoEm: '2026-06-01T00:00:00Z',
    }
    const desvios = compararComOrcamento(dre, orcamento)
    const receita = desvios.find((d) => d.linha === 'receita_bruta')!
    expect(receita.desvio).toBe(200_000) // realizado 1.0M - orçado 800k
    expect(receita.desvioPct).toBe(25) //   +25%
    const custo = desvios.find((d) => d.linha === 'custo_produto')!
    expect(custo.desvio).toBe(0)
    expect(custo.desvioPct).toBe(0)
  })
})

describe('competenciasDisponiveis', () => {
  it('lista competências únicas, mais recente primeiro', () => {
    expect(competenciasDisponiveis(lancamentos)).toEqual(['2026-06', '2026-05'])
  })
})
