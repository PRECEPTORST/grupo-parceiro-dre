import { describe, it, expect, vi } from 'vitest'
import { sincronizarEnokiDre } from './enokiSync'

function resposta(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

const NF = {
  idNf: 1,
  numeroNf: 100,
  dataEmissao: '2026-06-01T00:00:00-03:00',
  status: 'Finalizada',
  tipoOperacao: 'SAÍDA',
  finalidade: 'Normal',
  valorTotalNf: '1000',
  destinatarioNome: 'CLIENTE X',
  destinatarioCpfCnpj: '60498706000904',
  itens: [{ idItem: 1, produto: 'SOJA EM GRÃOS', quantidade: '6000', valorTotal: '1000' }],
}

const TITULO = {
  idItemLancamento: 10,
  dataLancamento: '2026-06-05T00:00:00-03:00',
  valor: '700',
  parceiroNome: 'FORNECEDOR Y',
  centroCusto: 'COMPRA SOJA',
}

describe('sincronizarEnokiDre', () => {
  it('segue o cursor até concluir e acumula os registros', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(
        resposta({
          configurado: true,
          nfs: [NF],
          pagar: [],
          receber: [],
          concluido: false,
          cursor: { tarefa: 1, desdeId: 0 },
          meta: { de: '2026-01-01', ate: '2026-06-30', tarefas: 2, tarefasFeitas: 1, progresso: 50 },
        }),
      )
      .mockResolvedValueOnce(
        resposta({
          configurado: true,
          nfs: [],
          pagar: [TITULO],
          receber: [],
          concluido: true,
          cursor: null,
          meta: { de: '2026-01-01', ate: '2026-06-30', tarefas: 2, tarefasFeitas: 2, progresso: 100, empresas: ['1'] },
        }),
      )

    const passos: number[] = []
    const r = await sincronizarEnokiDre({
      de: '2026-01-01',
      ate: '2026-06-30',
      buscar: buscar as unknown as typeof fetch,
      aoProgredir: (p) => passos.push(p.progresso),
    })

    expect(buscar).toHaveBeenCalledTimes(2)
    expect(r.completo).toBe(true)
    expect(r.configurado).toBe(true)
    expect(passos).toEqual([50, 100])
    // Normalizou: 1 receita (NF) + 1 CPV (título).
    expect(r.lancamentos).toHaveLength(2)
    expect(r.lancamentos.map((l) => l.contaSafragold).sort()).toEqual(['3.1.01', '4.1.01'])
    expect(r.sacas['2026-06'].soja).toBeCloseTo(100, 2)
    expect(r.meta.passos).toBe(2)
    expect(r.meta.registros).toBe(2)
  })

  it('manda o cursor na chamada seguinte', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(
        resposta({ configurado: true, nfs: [], pagar: [], receber: [], concluido: false, cursor: { tarefa: 7, desdeId: 4242 }, meta: {} }),
      )
      .mockResolvedValueOnce(resposta({ configurado: true, nfs: [], pagar: [], receber: [], concluido: true, meta: {} }))

    await sincronizarEnokiDre({ buscar: buscar as unknown as typeof fetch })
    const url = String(buscar.mock.calls[1][0])
    expect(url).toContain('tarefa=7')
    expect(url).toContain('desdeId=4242')
  })

  it('para quando a Enoki não está configurada', async () => {
    const buscar = vi.fn().mockResolvedValue(resposta({ configurado: false, concluido: true }))
    const r = await sincronizarEnokiDre({ buscar: buscar as unknown as typeof fetch })
    expect(r.configurado).toBe(false)
    expect(r.lancamentos).toHaveLength(0)
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('respeita maxPassos e sinaliza que não completou', async () => {
    const buscar = vi.fn().mockResolvedValue(
      resposta({ configurado: true, nfs: [], pagar: [], receber: [], concluido: false, cursor: { tarefa: 1, desdeId: 0 }, meta: {} }),
    )
    const r = await sincronizarEnokiDre({ buscar: buscar as unknown as typeof fetch, maxPassos: 3 })
    expect(buscar).toHaveBeenCalledTimes(3)
    expect(r.completo).toBe(false)
  })

  it('não repete quando o servidor esquece o cursor', async () => {
    const buscar = vi.fn().mockResolvedValue(
      resposta({ configurado: true, nfs: [], pagar: [], receber: [], concluido: false, cursor: null, meta: {} }),
    )
    const r = await sincronizarEnokiDre({ buscar: buscar as unknown as typeof fetch })
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(r.completo).toBe(false)
  })

  it('propaga erro do servidor', async () => {
    const buscar = vi.fn().mockResolvedValue(resposta({ erro: 'Falha ao puxar Enoki: timeout' }, false, 502))
    await expect(sincronizarEnokiDre({ buscar: buscar as unknown as typeof fetch })).rejects.toThrow(/timeout/)
  })

  it('deduplica registros repetidos entre passos', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(
        resposta({ configurado: true, nfs: [], pagar: [TITULO], receber: [], concluido: false, cursor: { tarefa: 1, desdeId: 0 }, meta: {} }),
      )
      .mockResolvedValueOnce(
        resposta({ configurado: true, nfs: [], pagar: [TITULO], receber: [], concluido: true, meta: {} }),
      )
    const r = await sincronizarEnokiDre({ buscar: buscar as unknown as typeof fetch })
    expect(r.lancamentos).toHaveLength(1)
  })
})
