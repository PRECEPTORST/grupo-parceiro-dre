/// <reference types="node" />
// Regressão contra a EXTRAÇÃO REAL da Enoki — pulada por padrão.
//
// Os dados do cliente NÃO ficam no repositório. Para rodar, aponte a variável
// para um JSON `{ nfs, pagar, receber }` capturado da API:
//   ENOKI_FIXTURE=/caminho/extracao.json npm test
//
// Os números esperados vêm da validação de 2026-08-21 (jan–jul/2026, 5 empresas,
// homologação) registrada na §27 do context.md. Servem de âncora: se a
// normalização mudar de comportamento, este teste denuncia.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { normalizarEnokiDre } from './enokiDre'
import { montarDre } from './dre'
import { mapaEfetivo } from './planoContas'

const CAMINHO = process.env.ENOKI_FIXTURE ?? ''
const temFixture = !!CAMINHO && existsSync(CAMINHO)

const MESES = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']

/** Lê e normaliza a fixture uma única vez, só quando os testes de fato rodam. */
let cache: ReturnType<typeof normalizarEnokiDre> | null = null
function extracao() {
  if (!cache) {
    const cru = JSON.parse(readFileSync(CAMINHO, 'utf8'))
    cache = normalizarEnokiDre({ nfs: cru.nfs, pagar: cru.pagar, receber: cru.receber })
  }
  return cache
}
function dresReais() {
  const mapa = mapaEfetivo([])
  return MESES.map((m) => montarDre(m, extracao().lancamentos, mapa))
}

describe.skipIf(!temFixture)('extração real jan–jul/2026', () => {
  const totalLinha = (nome: string) =>
    dresReais().reduce((s, d) => s + d.linhas.find((l) => l.linha === nome)!.realizado, 0)

  it('receita bruta bate com a validação (~R$ 261M)', () => {
    expect(totalLinha('receita_bruta') / 1e6).toBeGreaterThan(255)
    expect(totalLinha('receita_bruta') / 1e6).toBeLessThan(266)
  })

  it('elimina ~R$ 18,2M de venda intragrupo', () => {
    const d = extracao().descartes.find((x) => x.motivo === 'nf_intragrupo')!
    expect(d.valor / 1e6).toBeGreaterThan(17)
    expect(d.valor / 1e6).toBeLessThan(20)
  })

  it('nenhuma conta fica sem classificação no DRE', () => {
    for (const d of dresReais()) expect(d.naoClassificadas, d.competencia).toHaveLength(0)
  })

  it('o resíduo para a IA é pequeno (< 2% do movimento)', () => {
    const { residuos } = extracao()
    const residuo = residuos.reduce((s, x) => s + x.valor, 0)
    expect(residuo / 1e6).toBeLessThan(5)
    expect(residuos.every((x) => x.centroCusto === 'SEM CC')).toBe(true)
  })

  it('extrai sacas de todos os grãos, em toda competência', () => {
    for (const m of MESES) {
      const s = extracao().sacas[m] ?? {}
      expect((s.soja ?? 0) + (s.milho ?? 0), m).toBeGreaterThan(0)
    }
  })
})
