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

  it('receita bruta bate com a validação (~R$ 238M: CFOP de venda + autorizada)', () => {
    expect(totalLinha('receita_bruta') / 1e6).toBeGreaterThan(233)
    expect(totalLinha('receita_bruta') / 1e6).toBeLessThan(243)
  })

  it('exclui as notas não autorizadas (~R$ 1,5M de receita fantasma)', () => {
    const d = extracao().descartes.find((x) => x.motivo === 'nf_nao_autorizada')!
    expect(d).toBeTruthy()
    expect(d.valor / 1e6).toBeGreaterThan(0.5)
    expect(d.valor / 1e6).toBeLessThan(3)
  })

  it('soja tem preço por saca de MERCADO — o teste que pegou o erro de unidade', () => {
    const { lancamentos, sacas } = extracao()
    const sc = MESES.reduce((s, m) => s + (sacas[m]?.soja ?? 0), 0)
    const receita = lancamentos
      .filter((l) => l.contaSafragold === '3.1.01')
      .reduce((s, l) => s + l.valor, 0)
    const porSaca = receita / sc
    expect(sc).toBeGreaterThan(800_000)
    expect(porSaca).toBeGreaterThan(100)
    expect(porSaca).toBeLessThan(200)
  })

  it('exclui remessa para armazém (~R$ 21M) e transferência (~R$ 18M)', () => {
    const { descartes } = extracao()
    const remessa = descartes.find((x) => x.motivo === 'nf_remessa')!
    const transf = descartes.find((x) => x.motivo === 'nf_transferencia')!
    expect(remessa.valor / 1e6).toBeGreaterThan(18)
    expect(transf.valor / 1e6).toBeGreaterThan(16)
  })

  it('as devoluções entram como dedução (~R$ 20M)', () => {
    expect(totalLinha('deducoes') / 1e6).toBeGreaterThan(15)
    expect(totalLinha('deducoes') / 1e6).toBeLessThan(25)
  })

  it('a margem bruta fica em patamar de trading (entre 3% e 15%)', () => {
    const rb = totalLinha('receita_bruta')
    const liq = rb - totalLinha('deducoes')
    const margem = ((liq - totalLinha('custo_produto')) / liq) * 100
    expect(margem).toBeGreaterThan(3)
    expect(margem).toBeLessThan(15)
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

  it('milho fica na faixa de volume observada (60k–290k sacas/mês)', () => {
    for (const m of MESES) {
      const milho = extracao().sacas[m]?.milho ?? 0
      expect(milho, m).toBeGreaterThan(50_000)
      expect(milho, m).toBeLessThan(300_000)
    }
  })
})
