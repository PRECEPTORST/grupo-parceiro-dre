/**
 * Confronto LINHA A LINHA com a planilha do cliente, no desenho dela.
 *
 * POR QUE ESTE EXISTE, SE JÁ HÁ `conferir-planilha.mjs`
 * ----------------------------------------------------
 * Aquele compara dois totais — receita e compra — e dizia "ok, 1,0% e 2,1%".
 * Estava certo e era insuficiente: dois totais podem fechar com todas as linhas
 * erradas, e foi o que aconteceu. Com o detalhe aberto aparece que a despesa da
 * API é R$ 21,6 mil onde a planilha tem R$ 505,5 mil — 4% dela — e nenhum
 * total de receita ou compra denunciava isso.
 *
 * E o conferir-planilha tinha um erro meu que este expõe: ele somava as contas
 * 3.* inteiras, de modo que ICMS e devolução ENTRAVAM na receita em vez de sair.
 * Com isso a receita de agosto aparecia como R$ 18,92M (-1,0% da planilha)
 * quando a bruta é R$ 18,39M (-3,7%) e a líquida R$ 17,86M (-6,5%).
 *
 * A estrutura da planilha, confirmada ao centavo em agosto/2026:
 *   CUSTO TOTAL  = COMPRA + ARMAZENAGEM + FRETE + COMISSÃO + CLASSIFICAÇÃO + QUEBRAS
 *   LUCRO BRUTO  = RECEITA LÍQUIDA - CUSTO TOTAL
 *
 * MODO PLANILHA (--modo-planilha)
 * ------------------------------
 * Copia as convenções do cliente em vez das nossas, para separar o que é
 * ESCOLHA de método do que é DADO que falta:
 *
 *   • sem apropriação de estoque — a COMPRA vira a nota do mês, como lá;
 *   • sem deduzir devolução de venda — a linha DEVOLUÇÃO deles é zero.
 *
 * O que sobrar de diferença depois disso não é convenção: é dado.
 *
 *   npx tsx scripts/conferir-linhas.mjs [--modo-planilha] [2026-08]
 */
import { existsSync } from 'node:fs'
import { apurar, arquivoDaCarga, ajustesDeEstoque } from './_apuracao.mjs'
import { EMPRESA_DA_PLANILHA } from '../src/lib/empresas.ts'

/** DRE real do cliente, aba "DRE ACUM (2)". Uma coluna por competência. */
const PLANILHA = {
  '2026-01': { receitaBruta: 9_030_088.30, impostos: 0, devolucao: 0, compra: 7_909_884.41, armazenagem: 0, frete: 634_974.03, comissao: 41_110.47, classificacao: 6_119.63, quebras: 5_289.00, despesaTotal: 250_408.62 },
  '2026-02': { receitaBruta: 12_601_230.59, impostos: 0, devolucao: 0, compra: 11_317_769.48, armazenagem: 0, frete: 879_357.24, comissao: 56_739.02, classificacao: 5_760.00, quebras: 19_068.11, despesaTotal: 273_700.25 },
  '2026-03': { receitaBruta: 40_429_003.18, impostos: 0, devolucao: 0, compra: 36_666_215.64, armazenagem: 0, frete: 3_168_207.66, comissao: 118_872.97, classificacao: 0, quebras: 13_996.71, despesaTotal: 111_237.53 },
  '2026-04': { receitaBruta: 43_280_410.49, impostos: 0, devolucao: 0, compra: 39_169_661.25, armazenagem: 2_396.78, frete: 3_677_499.20, comissao: 135_905.49, classificacao: 230.00, quebras: 16_159.78, despesaTotal: 1_256_844.27 },
  '2026-05': { receitaBruta: 45_584_688.98, impostos: 0, devolucao: 0, compra: 40_983_340.14, armazenagem: 0, frete: 3_654_379.11, comissao: 184_203.70, classificacao: 2_130.00, quebras: 16_935.47, despesaTotal: 434_879.71 },
  '2026-06': { receitaBruta: 25_296_202.48, impostos: 0, devolucao: 0, compra: 22_841_085.15, armazenagem: 0, frete: 1_846_286.70, comissao: 88_396.62, classificacao: 150.00, quebras: 26_553.87, despesaTotal: 417_225.98 },
  '2026-07': { receitaBruta: 23_187_057.86, impostos: 0, devolucao: 0, compra: 20_943_757.86, armazenagem: 0, frete: 1_666_350.81, comissao: 98_487.91, classificacao: 1_700.00, quebras: 20_658.65, despesaTotal: 226_112.81 },
  '2026-08': { receitaBruta: 19_103_526.18, impostos: 0, devolucao: 0, compra: 16_695_193.02, armazenagem: 0, frete: 1_822_629.78, comissao: 68_275.48, classificacao: 4_496.00, quebras: 5_481.93, despesaTotal: 505_543.19 },
}

/** Cada linha da planilha e as contas do nosso plano que a alimentam. */
const LINHAS = [
  { chave: 'receitaBruta', rotulo: 'RECEITA BRUTA', contas: (c) => c.startsWith('3.1.') },
  { chave: 'impostos', rotulo: 'IMPOSTOS', contas: (c) => /^3\.2\.0[1-5]$/.test(c) },
  { chave: 'devolucao', rotulo: 'DEVOLUÇÃO', contas: (c) => c === '3.2.06' || c === '3.2.07' },
  { chave: 'compra', rotulo: 'COMPRA DE CEREAIS', contas: (c) => /^4\.1\.(01|02|03|04|05|06|18)$/.test(c) },
  { chave: 'armazenagem', rotulo: 'ARMAZENAGEM', contas: (c) => c === '4.1.11' },
  { chave: 'frete', rotulo: 'FRETE', contas: (c) => c === '4.1.10' },
  { chave: 'comissao', rotulo: 'COMISSÃO', contas: (c) => c === '4.2.01' || c === '4.2.02' },
  { chave: 'classificacao', rotulo: 'CLASSIFICAÇÃO', contas: (c) => c === '4.1.13' },
  { chave: 'quebras', rotulo: 'QUEBRAS / QUALIDADE', contas: (c) => c === '4.1.14' },
  { chave: 'despesaTotal', rotulo: 'DESPESA TOTAL', contas: (c) => /^4\.[23]\./.test(c) && c !== '4.2.01' && c !== '4.2.02' },
]

const modoPlanilha = process.argv.includes('--modo-planilha')
const meses = process.argv.slice(2).filter((m) => /^\d{4}-\d{2}$/.test(m))
const alvos = meses.length ? meses : Object.keys(PLANILHA)

// A cadeia começa na primeira carga: o estoque de um mês é o inicial do seguinte.
const TODOS = []
for (let a = 2025; a <= 2026; a++) {
  for (let m = 1; m <= 12; m++) {
    const s = `${a}-${String(m).padStart(2, '0')}`
    if (existsSync(arquivoDaCarga(s))) TODOS.push(s)
  }
}
const { lancamentos: base, rel } = await apurar(TODOS, undefined, EMPRESA_DA_PLANILHA)
// COM a apropriação de estoque: é o que o site publica. Sem ela a linha COMPRA
// aparece 9,8% acima da planilha quando na verdade fica 9,3% abaixo.
const lancamentos = modoPlanilha
  ? base.filter((l) => l.contaSafragold !== '3.2.06' && l.contaSafragold !== '3.2.07')
  : [...base, ...ajustesDeEstoque(base, rel, TODOS)]
if (modoPlanilha) console.log('MODO PLANILHA: sem apropriação de estoque, sem deduzir devolução.\n')

const num = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const delta = (a, b) => (b === 0 ? (a === 0 ? '     —' : '  falta na planilha') : `${((a / b - 1) * 100).toFixed(1)}%`.padStart(8))

const acum = { api: {}, plan: {} }
for (const mes of alvos) {
  const alvo = PLANILHA[mes]
  if (!alvo) { console.log(`${mes}: sem referência da planilha`); continue }
  const doMes = lancamentos.filter((l) => l.data.slice(0, 7) === mes)
  const soma = (f) => doMes.filter((l) => f(l.contaSafragold)).reduce((s, l) => s + l.valor, 0)

  console.log(`\n═══ ${mes} — FILIAL MG`)
  console.log('LINHA                          API         planilha        Δ')
  const nosso = {}
  for (const l of LINHAS) {
    nosso[l.chave] = soma(l.contas)
    console.log(`  ${l.rotulo.padEnd(22)}${num(nosso[l.chave]).padStart(15)}${num(alvo[l.chave]).padStart(16)}${delta(nosso[l.chave], alvo[l.chave])}`)
  }

  const liqN = nosso.receitaBruta - nosso.impostos - nosso.devolucao
  const liqP = alvo.receitaBruta - alvo.impostos - alvo.devolucao
  const custoN = nosso.compra + nosso.armazenagem + nosso.frete + nosso.comissao + nosso.classificacao + nosso.quebras
  const custoP = alvo.compra + alvo.armazenagem + alvo.frete + alvo.comissao + alvo.classificacao + alvo.quebras
  console.log('  ' + '─'.repeat(59))
  console.log(`  ${'RECEITA LÍQUIDA'.padEnd(22)}${num(liqN).padStart(15)}${num(liqP).padStart(16)}${delta(liqN, liqP)}`)
  console.log(`  ${'CUSTO TOTAL'.padEnd(22)}${num(custoN).padStart(15)}${num(custoP).padStart(16)}${delta(custoN, custoP)}`)
  console.log(`  ${'LUCRO BRUTO'.padEnd(22)}${num(liqN - custoN).padStart(15)}${num(liqP - custoP).padStart(16)}`)
  console.log(`  ${'margem bruta'.padEnd(22)}${(liqN ? ((liqN - custoN) / liqN * 100).toFixed(2) + '%' : '—').padStart(15)}${(((liqP - custoP) / liqP * 100).toFixed(2) + '%').padStart(16)}`)
  console.log(`  ${'RESULTADO'.padEnd(22)}${num(liqN - custoN - nosso.despesaTotal).padStart(15)}${num(liqP - custoP - alvo.despesaTotal).padStart(16)}`)
  for (const l of LINHAS) {
    acum.api[l.chave] = (acum.api[l.chave] ?? 0) + nosso[l.chave]
    acum.plan[l.chave] = (acum.plan[l.chave] ?? 0) + alvo[l.chave]
  }
}

// O ACUMULADO é o que separa diferença de CORTE de diferença de DADO: uma nota
// que cai no mês errado some no acumulado; uma que falta, não.
if (alvos.length > 1) {
  console.log(`\n═══ ACUMULADO ${alvos[0]} a ${alvos.at(-1)}`)
  console.log('LINHA                          API         planilha        Δ')
  for (const l of LINHAS) {
    console.log(`  ${l.rotulo.padEnd(22)}${num(acum.api[l.chave]).padStart(15)}${num(acum.plan[l.chave]).padStart(16)}${delta(acum.api[l.chave], acum.plan[l.chave])}`)
  }
  const liqN = acum.api.receitaBruta - acum.api.impostos - acum.api.devolucao
  const liqP = acum.plan.receitaBruta - acum.plan.impostos - acum.plan.devolucao
  const custo = (x) => x.compra + x.armazenagem + x.frete + x.comissao + x.classificacao + x.quebras
  console.log('  ' + '─'.repeat(59))
  console.log(`  ${'RECEITA LÍQUIDA'.padEnd(22)}${num(liqN).padStart(15)}${num(liqP).padStart(16)}${delta(liqN, liqP)}`)
  console.log(`  ${'CUSTO TOTAL'.padEnd(22)}${num(custo(acum.api)).padStart(15)}${num(custo(acum.plan)).padStart(16)}${delta(custo(acum.api), custo(acum.plan))}`)
  console.log(`  ${'LUCRO BRUTO'.padEnd(22)}${num(liqN - custo(acum.api)).padStart(15)}${num(liqP - custo(acum.plan)).padStart(16)}`)
}
