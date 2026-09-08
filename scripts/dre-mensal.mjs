/**
 * DRE de um mês no MESMO desenho da planilha do cliente (`DRE_JULHO 2026.xlsx`,
 * aba "DRE ACUM (2)"): receita → custo → lucro bruto → despesas → resultado.
 *
 * Existe porque o cliente lê o DRE nesse formato há anos. Entregar o mesmo mês
 * num layout diferente obriga quem confere a traduzir antes de comparar — e é
 * exatamente na tradução que a conferência morre.
 *
 * Roda o normalizador do site, não uma segunda implementação: o que sai aqui é
 * o que o app mostra.
 *
 *   npx tsx scripts/dre-mensal.mjs 2026-08
 */
import { readFileSync, existsSync } from 'node:fs'
import { normalizarEnokiDre } from '../src/lib/enokiDre.ts'
import { montarDre } from '../src/lib/dre.ts'
import { mapaEfetivo, MAPA_PLANO, PLANO_CONTAS } from '../src/lib/planoContas.ts'

const mes = process.argv[2]
if (!/^\d{4}-\d{2}$/.test(mes ?? '')) {
  console.error('uso: npx tsx scripts/dre-mensal.mjs AAAA-MM')
  process.exit(1)
}
const [ano, m] = mes.split('-')
const ultimo = new Date(Date.UTC(Number(ano), Number(m), 0)).getUTCDate()
const arquivo = `robot/out/enoki-dre-${mes}-01_${mes}-${String(ultimo).padStart(2, '0')}.json`
if (!existsSync(arquivo)) {
  console.error(`não achei ${arquivo} — rode o robô para este mês primeiro`)
  process.exit(1)
}

const bruto = JSON.parse(readFileSync(arquivo, 'utf8'))
const r = normalizarEnokiDre(bruto)
const mapa = mapaEfetivo([])
const dre = montarDre(mes, r.lancamentos, mapa)
const desc = Object.fromEntries(PLANO_CONTAS.map((c) => [c.conta, c.descricao]))

const brl = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const linha = (nome, valor, forte = false) => {
  const n = forte ? nome.toUpperCase() : nome
  console.log(`  ${n.padEnd(46)}${brl(valor).padStart(20)}`)
}
const regua = () => console.log('  ' + '-'.repeat(66))

/** Contas de uma linha do DRE, da maior para a menor — o "analítico" aberto. */
function contasDe(nomeLinha) {
  const acc = {}
  for (const l of r.lancamentos) {
    if (MAPA_PLANO[l.contaSafragold] !== nomeLinha) continue
    acc[l.contaSafragold] = (acc[l.contaSafragold] ?? 0) + l.valor
  }
  return Object.entries(acc).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
}

const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO']
console.log(`\nDRE GERENCIAL — ${MESES[Number(m) - 1]} ${ano}`)
console.log(`${bruto.empresa ?? ''}${bruto.parcial ? '   ⚠ CARGA PARCIAL' : ''}`)
console.log(`fonte: ERP Enoki (produção) · ${bruto.nfs.length} notas · ${(bruto.pagar?.length ?? 0) + (bruto.receber?.length ?? 0)} títulos\n`)

const v = (n) => dre.linhas.find((l) => l.linha === n)?.realizado ?? 0

linha('Receita bruta de vendas', v('receita_bruta'), true)
for (const [c, val] of contasDe('receita_bruta')) linha(`    ${desc[c] ?? c}`, val)
linha('(−) Deduções', v('deducoes'))
for (const [c, val] of contasDe('deducoes')) linha(`    ${desc[c] ?? c}`, val)
regua()
linha('Receita líquida', dre.realizado.receitaLiquida, true)

console.log('')
linha('(−) Custo dos produtos vendidos', v('custo_produto'), true)
for (const [c, val] of contasDe('custo_produto')) linha(`    ${desc[c] ?? c}`, val)
regua()
linha('Lucro bruto', dre.realizado.lucroBruto, true)
const margem = dre.realizado.receitaLiquida
  ? (dre.realizado.lucroBruto / dre.realizado.receitaLiquida) * 100
  : 0
console.log(`  ${'Margem bruta'.padEnd(46)}${(margem.toFixed(2) + '%').padStart(20)}`)

console.log('')
for (const [nome, chave] of [
  ['(−) Despesas comerciais', 'despesas_comerciais'],
  ['(−) Despesas administrativas', 'despesas_administrativas'],
  ['(−) Depreciação e amortização', 'depreciacao_amortizacao'],
  ['(+) Outras receitas operacionais', 'outras_receitas_operacionais'],
  ['(+) Receita financeira', 'receita_financeira'],
  ['(−) Despesa financeira', 'despesa_financeira'],
  ['(−) Impostos sobre o lucro', 'impostos_lucro'],
]) {
  if (!v(chave)) continue
  linha(nome, v(chave), true)
  for (const [c, val] of contasDe(chave)) linha(`    ${desc[c] ?? c}`, val)
}
regua()
linha('RESULTADO LÍQUIDO', dre.realizado.resultadoLiquido, true)
if (v('investimentos')) {
  console.log('')
  linha('(−) Investimentos (capex, abaixo da linha)', v('investimentos'), true)
  for (const [c, val] of contasDe('investimentos')) linha(`    ${desc[c] ?? c}`, val)
  linha('Resultado após investimentos', dre.realizado.resultadoAposInvestimentos, true)
}

// O que ficou de fora, e por quê. Um DRE sem isto esconde a própria margem de erro.
console.log('\n  Fora do resultado, por regra:')
for (const d of [...r.descartes].sort((a, b) => b.valor - a.valor))
  console.log(`    ${d.motivo.padEnd(28)}${brl(d.valor).padStart(18)}  (${d.quantidade})`)
if (r.residuos.length)
  console.log(`\n  ⚠ ${r.residuos.length} grupo(s) sem regra determinística (fila de classificação)`)
if (r.colisoes.length)
  console.log(`  ⚠ ${r.colisoes.length} colisão(ões) de id — documentos distintos com a mesma chave`)
