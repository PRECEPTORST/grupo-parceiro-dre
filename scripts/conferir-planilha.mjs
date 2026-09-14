/**
 * Confronta o DRE apurado da API com a planilha real do cliente, mês a mês.
 *
 * O QUE ESTA CONFERÊNCIA DESCOBRIU
 * --------------------------------
 * A pergunta era por que a razão custo/receita do cliente fica presa entre 87%
 * e 91% todo mês enquanto a nossa ia de 84% a 153%. A hipótese que perseguimos
 * por muito tempo foi a de que eles casavam custo com venda lote a lote, e nós
 * não. Estava errada, e são DOIS erros nossos somados:
 *
 *   1. ESCOPO. A planilha é a EMPRESA 1 ("DRE ACUMULADO _CEREAIS"). Somávamos
 *      as cinco, e as empresas 2 e 3 acrescentavam R$ 4,7 milhões de receita
 *      em agosto — outra linha de negócio, num DRE separado. Isso sozinho
 *      inflava a receita em 24%.
 *
 *   2. A PLANILHA NÃO APROPRIA ESTOQUE. A "compra" dela é a nota de compra do
 *      mês, CFOP 1102, e mais nada. Comprovado: 8 meses de 2026 somam
 *      R$ 196,53 milhões na planilha e R$ 192,46 milhões nas notas — 2,1% de
 *      diferença. A receita idem: R$ 218,51 milhões contra R$ 220,72 milhões,
 *      1,0%.
 *
 * Ou seja: os NOSSOS DADOS JÁ BATEM. O que oscila mês a mês é a DATA em que
 * cada nota cai (janeiro fica 27% abaixo, junho 10% acima, e o acumulado
 * fecha), e a estabilidade do ratio deles vem do controle de carregamento, que
 * lança a compra no mesmo mês da venda do mesmo lote.
 *
 * POR ISSO O TESTE MUDOU
 * ----------------------
 * Ele mede duas coisas diferentes:
 *
 *   • ACUMULADO — receita e compra contra a planilha. É o teste de que a
 *     LEITURA da API está certa. Tem que fechar em poucos por cento.
 *   • MÊS A MÊS — a diferença de corte de competência. NÃO é para fechar: é a
 *     divergência que o cliente precisa decidir, e o número dela é este.
 *
 * Roda sem planilha nenhuma: os valores de referência estão aqui, extraídos uma
 * vez de `DRE ACUMULADO _CEREAIS`. O objetivo é justamente poder verificar a
 * apuração sem depender do arquivo.
 *
 *   npx tsx scripts/conferir-planilha.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { apurar, arquivoDaCarga } from './_apuracao.mjs'
import { EMPRESA_DA_PLANILHA } from '../src/lib/empresas.ts'

/**
 * Tolerância do ACUMULADO. Passar daqui significa que estamos lendo notas a
 * menos (ou a mais) da API, não que o corte de competência é outro.
 */
export const TOLERANCIA_ACUMULADO = 0.05


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

// A cadeia PRECISA começar na primeira carga que temos, não em janeiro/2026: o
// estoque de um mês é o inicial do seguinte, e começar no meio jogaria fora o
// grão comprado antes. 2026-01 sem 2025 dá 153% de custo/receita.
const TODOS = []
for (let a = 2025; a <= 2026; a++) {
  for (let m = 1; m <= 12; m++) {
    const mes = `${a}-${String(m).padStart(2, '0')}`
    if (existsSync(arquivoDaCarga(mes))) TODOS.push(mes)
  }
}

const { lancamentos, rel, abertura } = await apurar(TODOS, undefined, EMPRESA_DA_PLANILHA)

/** Compra de grão do mês: nota de entrada CFOP 1102, que é o que a planilha usa. */
function compraDoMes(mes) {
  return JSON.parse(readFileSync(arquivoDaCarga(mes), 'utf8')).nfs
    .filter((n) => n.entrada && n.status === 'Finalizada' && n.idEmpresa === EMPRESA_DA_PLANILHA)
    .filter((n) => String(n.cfop ?? '').slice(0, 4) === '1102')
    .reduce((s, n) => s + (n.itens ?? []).reduce((t, i) => t + (Number(i.valorTotal) || 0), 0), 0)
}

const brl = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// Sem o 'R$': em coluna, o prefixo repetido só rouba largura do número.
const num = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (v) => `${(v * 100).toFixed(1)}%`
const dif = (a, b) => `${((a / b - 1) * 100).toFixed(1)}%`.padStart(8)

if (Object.keys(abertura).length) {
  console.log('estoque de abertura inferido (piso que as notas denunciam):')
  for (const [g, a] of Object.entries(abertura)) {
    console.log(`   ${g.padEnd(6)} ${a.sacas.toLocaleString('pt-BR')} sacas · ${brl(a.valor)}`)
  }
  console.log('')
}

console.log('                      RECEITA                     │              COMPRA DE GRÃO')
console.log('MÊS             nossa       planilha        Δ    │       nossa       planilha        Δ')
let sR = 0, sRp = 0, sC = 0, sCp = 0
for (const [mes, alvo] of Object.entries(PLANILHA)) {
  const receita = lancamentos
    .filter((l) => l.data.slice(0, 7) === mes && l.contaSafragold.startsWith('3.'))
    .reduce((s, l) => s + l.valor, 0)
  const compra = compraDoMes(mes)
  sR += receita; sRp += alvo.receita; sC += compra; sCp += alvo.compra
  console.log(
    `  ${mes}${num(receita).padStart(15)}${num(alvo.receita).padStart(15)}${dif(receita, alvo.receita)}` +
    ` │${num(compra).padStart(15)}${num(alvo.compra).padStart(15)}${dif(compra, alvo.compra)}`,
  )
}
console.log(
  `  TOTAL${num(sR).padStart(15)}${num(sRp).padStart(15)}${dif(sR, sRp)}` +
  ` │${num(sC).padStart(15)}${num(sCp).padStart(15)}${dif(sC, sCp)}`,
)

const okR = Math.abs(sR / sRp - 1) <= TOLERANCIA_ACUMULADO
const okC = Math.abs(sC / sCp - 1) <= TOLERANCIA_ACUMULADO
console.log(`\n  ACUMULADO (é o teste da leitura da API, tolerância ${pct(TOLERANCIA_ACUMULADO)}):`)
console.log(`     receita ${okR ? 'ok' : '⚠'} ${pct(Math.abs(sR / sRp - 1))}    compra ${okC ? 'ok' : '⚠'} ${pct(Math.abs(sC / sCp - 1))}`)
console.log('\n  MÊS A MÊS não fecha, e não é para fechar: a planilha lança a compra no')
console.log('  mês da venda do mesmo lote (controle de carregamento) e não apropria')
console.log('  estoque. A diferença de cada mês é o tamanho dessa divergência de corte.')
console.log(`\n  Nosso CPV com apropriação de estoque, para comparação:`)
for (const mes of Object.keys(PLANILHA)) {
  const receita = lancamentos
    .filter((l) => l.data.slice(0, 7) === mes && l.contaSafragold.startsWith('3.'))
    .reduce((s, l) => s + l.valor, 0)
  const cpv = rel.cpvPorCompetencia[mes] ?? 0
  console.log(`     ${mes}  CPV ${num(cpv).padStart(15)}   ${pct(cpv / receita).padStart(7)} da receita`)
}
if (!okR || !okC) process.exitCode = 1
