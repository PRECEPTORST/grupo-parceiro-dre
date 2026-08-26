import { describe, it, expect } from 'vitest'
import { divergenciasDaCarga, totalEmAberto } from './divergencias'
import type { EnokiSyncMeta } from './tipos'

function sync(over: Partial<EnokiSyncMeta> = {}): EnokiSyncMeta {
  return {
    atualizadoEm: '2026-08-26T12:00:00Z',
    de: '2026-07-01',
    ate: '2026-07-31',
    registros: 2578,
    lancamentos: 1168,
    homologacao: false,
    completo: true,
    residuos: [],
    descartes: [],
    ...over,
  }
}

describe('divergenciasDaCarga', () => {
  it('traduz cada descarte em decisão, com o valor medido pela carga', () => {
    const d = divergenciasDaCarga(
      sync({ descartes: [{ motivo: 'nf_outra_operacao', quantidade: 333, valor: 23_936 }] }),
    )
    const item = d.find((x) => x.id === 'nf_outra_operacao')!
    expect(item.valor).toBe(23_936)
    expect(item.quantidade).toBe(333)
    expect(item.situacao).toBe('aberta')
    expect(item.quemDecide).toBeTruthy()
    expect(item.seMudar).toBeTruthy()
  })

  it('o que virou convenção fechada aparece como DECIDIDO, com o critério à vista', () => {
    // Intragrupo e retorno de lote deixaram de ser dúvida quando o DRE passou a
    // reproduzir o fechamento do cliente — mas continuam na tela, porque o
    // critério é o que explica o número.
    const d = divergenciasDaCarga(
      sync({
        descartes: [
          { motivo: 'nf_intragrupo', quantidade: 344, valor: 1_190_000 },
          { motivo: 'retorno_lote_exportacao', quantidade: 10, valor: 649_908 },
        ],
      }),
    )
    for (const id of ['nf_intragrupo', 'retorno_lote_exportacao']) {
      const x = d.find((y) => y.id === id)!
      expect(x.situacao, id).toBe('decidida')
      expect(x.valendoHoje, id).toBeTruthy()
    }
  })

  it('o que está em ABERTO vem antes do que já foi decidido', () => {
    const d = divergenciasDaCarga(
      sync({
        descartes: [
          // Decidido e caro vs. aberto e barato: a ordem é pela SITUAÇÃO.
          { motivo: 'nf_cancelada', quantidade: 51, valor: 1_850_000 },
          { motivo: 'data_invalida', quantidade: 1, valor: 10 },
        ],
      }),
    )
    const pos = (id: string) => d.findIndex((x) => x.id === id)
    expect(pos('data_invalida')).toBeLessThan(pos('nf_cancelada'))
  })

  it('dentro da mesma situação, o mais caro vem primeiro', () => {
    const d = divergenciasDaCarga(
      sync({
        descartes: [
          { motivo: 'nf_cancelada', quantidade: 1, valor: 100 },
          { motivo: 'nf_remessa', quantidade: 1, valor: 900 },
        ],
      }),
    )
    const decididas = d.filter((x) => x.situacao === 'decidida')
    expect(decididas[0].id).toBe('nf_remessa')
  })

  it('as decisões que não vêm de descarte aparecem mesmo com a carga vazia', () => {
    const ids = divergenciasDaCarga(sync()).map((d) => d.id)
    expect(ids).toContain('folha-ausente')
    expect(ids).toContain('cfop-exportacao')
    expect(ids).toContain('gap-contratos')
  })

  it('um motivo sem explicação cadastrada aparece como ABERTO, nunca some', () => {
    const d = divergenciasDaCarga(
      sync({ descartes: [{ motivo: 'motivo_novo_qualquer', quantidade: 3, valor: 500 }] }),
    )
    const novo = d.find((x) => x.id === 'motivo_novo_qualquer')!
    expect(novo.situacao).toBe('aberta')
    expect(novo.valor).toBe(500)
  })

  it('descarte zerado não ocupa espaço na tela', () => {
    const d = divergenciasDaCarga(
      sync({ descartes: [{ motivo: 'valor_zero', quantidade: 0, valor: 0 }] }),
    )
    expect(d.find((x) => x.id === 'valor_zero')).toBeUndefined()
  })

  it('o gap de contratos ganha o valor real quando a carga o traz', () => {
    const d = divergenciasDaCarga(
      sync({
        gapContratos: {
          totalNf: 40_000_000, totalTitulo: 36_400_000, gapTotal: -3_600_000,
          gapPct: 9.1, razaoMediana: 0.96, contratos: 412,
          distribuicao: {}, estrutural: true, porCompetencia: {},
        },
      }),
    )
    const gap = d.find((x) => x.id === 'gap-contratos')!
    expect(gap.valor).toBe(3_600_000)
    expect(gap.quantidade).toBe(412)
  })

  it('sem carga nenhuma não quebra', () => {
    expect(divergenciasDaCarga(undefined).length).toBeGreaterThan(0)
  })
})

describe('totalEmAberto', () => {
  it('soma só o que ainda depende de decisão', () => {
    const d = divergenciasDaCarga(
      sync({
        descartes: [
          { motivo: 'nf_outra_operacao', quantidade: 1, valor: 1_000_000 },
          { motivo: 'nf_cancelada', quantidade: 1, valor: 9_000_000 },
        ],
      }),
    )
    // Só o aberto conta; as decisões fixas da lista não têm valor medido.
    expect(totalEmAberto(d)).toBe(1_000_000 + 240_168.91)
  })
})
