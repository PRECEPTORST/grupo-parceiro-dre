/**
 * Confronta o DRE apurado da API com a planilha real do cliente, mês a mês.
 *
 * POR QUE O TESTE É O *RATIO*, E NÃO O VALOR
 * ------------------------------------------
 * Comparar receita com receita esconde o que interessa. A planilha do cliente
 * tem uma assinatura muito mais reveladora: a razão compra/receita fica entre
 * 87% e 91% TODOS os meses de 2026. A nossa, com CPV = compra do mês, vai de 84%
 * a 153%.
 *
 * Essa estabilidade é o retrato de custo casado com a venda — o custo de cada
 * venda é o do lote que saiu. A oscilação é o retrato do contrário. Por isso o
 * alvo desta conferência é o RATIO: ele diz se a apuração está com o método
 * certo, e não apenas se um mês bateu por acaso.
 *
 * Roda sem planilha nenhuma: os valores de referência estão aqui, extraídos uma
 * vez de `DRE ACUMULADO _CEREAIS`. O objetivo é justamente poder verificar a
 * apuração sem depender do arquivo.
 *
 *   npx tsx scripts/conferir-planilha.mjs
 */
import { readFileSync, existsSync } from 'node:fs'

/** Faixa em que o cliente opera, observada em 8 meses de 2026. */
export const FAIXA_COMPRA_RECEITA = { min: 0.87, max: 0.91 }

/** DRE real do cliente (aba "DRE ACUM (2)"), por competência. */
const PLANILHA = {
  '2026-01': { receita: 9_030_088.30, compra: 7_909_884.41, custoTotal: 8_597_377.54 },
  '2026-02': { receita: 12_601_230.59, compra: 11_317_769.48, custoTotal: 12_278_693.85 },
  '2026-03': { receita: 40_429_003.18, compra: 36_666_215.64, custoTotal: 39_967_292.98 },
  '2026-04': { receita: 43_280_410.49, compra: 39_169_661.25, custoTotal: 43_001_852.50 },
  '2026-05': { receita: 45_584_688.98, compra: 40_983_340.14, custoTotal: 44_840_988.42 },
  '2026-06': { receita: 25_296_202.48, compra: 22_841_085.15, custoTotal: 24_802_472.34 },
  '2026-07': { receita: 23_187_057.86, compra: 20_943_757.86, custoTotal: 22_730_955.23 },
  '2026-08': { receita: 19_103_526.18, compra: 16_695_193.02, custoTotal: 18_596_076.21 },
}

const VENDA = new Set(['5106', '6106', '6502', '5102', '5502'])
const FRETE = new Set(['1353', '2353'])
const brl = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const pct = (v) => `${(v * 100).toFixed(1)}%`

console.log('MÊS        receita API   receita plan.    compra/receita          margem')
console.log('                                          API     plan.      API     plan.')
for (const [mes, alvo] of Object.entries(PLANILHA)) {
  const arq = `robot/out/api-producao-${mes}.json`
  if (!existsSync(arq)) { console.log(`  ${mes}   (sem carga)`); continue }
  const fin = JSON.parse(readFileSync(arq, 'utf8')).nfs
    .filter((n) => n.status === 'Finalizada' && n.idEmpresa === 1)
  const cfop = (n) => String(n.cfop ?? '').slice(0, 4)
  const soma = (f) => fin.filter(f).reduce((s, n) => s + (Number(n.valorTotalNf) || 0), 0)
  const receita = soma((n) => !n.entrada && VENDA.has(cfop(n)))
  const compra = soma((n) => n.entrada && cfop(n) === '1102')
  const frete = soma((n) => n.entrada && FRETE.has(cfop(n)))

  const rApi = receita ? compra / receita : 0
  const rPlan = alvo.compra / alvo.receita
  const mApi = receita ? (receita - compra - frete) / receita : 0
  const mPlan = (alvo.receita - alvo.custoTotal) / alvo.receita
  const fora = rApi < FAIXA_COMPRA_RECEITA.min || rApi > FAIXA_COMPRA_RECEITA.max
  console.log(
    `  ${mes}  ${brl(receita).padStart(16)}${brl(alvo.receita).padStart(16)}` +
    `${pct(rApi).padStart(8)}${pct(rPlan).padStart(9)}` +
    `${pct(mApi).padStart(9)}${pct(mPlan).padStart(9)}${fora ? '  ⚠' : '  ok'}`,
  )
}
console.log(`\n  ⚠ = compra/receita fora de ${pct(FAIXA_COMPRA_RECEITA.min)}–${pct(FAIXA_COMPRA_RECEITA.max)},`)
console.log('    a faixa em que o cliente opera. Fora dela, o CPV está descrevendo')
console.log('    a COMPRA do mês e não o custo do que foi VENDIDO.')
