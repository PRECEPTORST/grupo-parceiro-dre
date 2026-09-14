import { describe, it, expect } from 'vitest'
import {
  PLANILHA_CLIENTE,
  LINHAS_CONFERENCIA,
  custoTotal,
  receitaLiquida,
} from './planilhaCliente'

describe('a referência da planilha é internamente coerente', () => {
  it('CUSTO TOTAL fecha ao centavo com a soma das suas linhas', () => {
    // Foi assim que a estrutura dela foi descoberta: compra + armazenagem +
    // frete + comissão + classificação + quebras. Agosto/2026 = 18.596.076,21.
    expect(custoTotal(PLANILHA_CLIENTE['2026-08'])).toBeCloseTo(18_596_076.21, 2)
  })

  it('a receita líquida de 2026 é a bruta: a planilha não deduz nada', () => {
    // Venda de grão em MG é ICMS diferido e a linha DEVOLUÇÃO é zero. Não é
    // omissão dela — é o regime, e o nosso DRE foi corrigido para o mesmo.
    for (const [mes, l] of Object.entries(PLANILHA_CLIENTE)) {
      expect(receitaLiquida(l), mes).toBeCloseTo(l.receitaBruta, 2)
    }
  })

  it('o lucro bruto de agosto confere com o da planilha', () => {
    const ago = PLANILHA_CLIENTE['2026-08']
    expect(receitaLiquida(ago) - custoTotal(ago)).toBeCloseTo(507_449.97, 2)
  })
})

describe('o mapa de linhas cobre o DRE sem sobrepor', () => {
  it('nenhuma conta é somada em duas linhas diferentes', () => {
    // Uma conta em duas linhas inflaria o custo sem que a tela avisasse.
    const contas = [
      '3.1.01', '3.1.02', '3.1.15', '3.2.01', '3.2.06', '4.1.01', '4.1.02',
      '4.1.10', '4.1.11', '4.1.13', '4.1.14', '4.1.18', '4.2.01', '4.2.03',
      '4.3.01', '4.3.14', '4.4.01', '4.4.04',
    ]
    for (const c of contas) {
      const casam = LINHAS_CONFERENCIA.filter((l) => l.conta(c)).map((l) => l.chave)
      expect(casam.length, `${c} casou com ${casam.join(', ')}`).toBeLessThanOrEqual(1)
    }
  })

  it('despesa total pega administrativa, comercial e financeira — menos comissão', () => {
    const despesa = LINHAS_CONFERENCIA.find((l) => l.chave === 'despesaTotal')!
    expect(despesa.conta('4.3.01')).toBe(true) // salários
    expect(despesa.conta('4.4.04')).toBe(true) // IOF
    expect(despesa.conta('4.2.03')).toBe(true) // frete sobre venda
    expect(despesa.conta('4.2.01')).toBe(false) // comissão tem linha própria
    expect(despesa.conta('4.1.10')).toBe(false) // frete de compra é custo
  })

  it('a devolução é marcada como só-nossa', () => {
    // Sem a marca, a linha aparece como -100% e parece erro de leitura.
    expect(LINHAS_CONFERENCIA.find((l) => l.chave === 'devolucao')?.somenteApurado).toBe(true)
  })
})
