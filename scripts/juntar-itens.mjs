/**
 * Junta a leitura do RELATÓRIO com a leitura NOTA A NOTA, para fechar o mês.
 *
 * O relatório lê o mês em minutos, mas não alcança um dia que tenha mais de uma
 * página — a recursão por período não pode partir abaixo de um dia. Em
 * agosto/2026 isso deixou R$ 896 mil (5%) de fora, num único dia.
 *
 * O leitor nota a nota alcança qualquer dia, e é lento demais para o mês
 * inteiro. Cada um cobre a fraqueza do outro; este script costura os dois.
 *
 * A chave de deduplicação é (nota, produto, quantidade): a mesma nota lida pelas
 * duas fontes não pode entrar duas vezes, e uma nota com dois itens do mesmo
 * produto em quantidades diferentes são dois itens de verdade.
 *
 *   node scripts/juntar-itens.mjs 2026-08
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'

const mes = process.argv[2]
if (!/^\d{4}-\d{2}$/.test(mes ?? '')) {
  console.error('uso: node scripts/juntar-itens.mjs 2026-08')
  process.exit(1)
}

const brl = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const base = `robot/out/itens-compra-${mes}.json`
if (!existsSync(base)) { console.error(`falta ${base}`); process.exit(1) }

const doc = JSON.parse(readFileSync(base, 'utf8'))
const chave = (x) => `${x.numeroNf}|${x.produto}|${x.quantidade}`
const porChave = new Map(doc.itens.map((x) => [chave(x), x]))
const antes = porChave.size

// Todo arquivo `itens-nf-*` que caia dentro do mês entra na costura.
const complementos = readdirSync('robot/out')
  .filter((f) => f.startsWith('itens-nf-') && f.endsWith('.json'))
const usados = []
for (const f of complementos) {
  const d = JSON.parse(readFileSync(`robot/out/${f}`, 'utf8'))
  const dentro = (d.itens ?? []).filter((x) => (x.dataEmissao ?? '').startsWith(mes))
  if (!dentro.length) continue
  let novos = 0
  for (const x of dentro) {
    if (porChave.has(chave(x))) continue
    porChave.set(chave(x), x)
    novos++
  }
  usados.push(`${f}: ${dentro.length} do mês, ${novos} novo(s)`)
}

let itens = [...porChave.values()].sort((a, b) => a.dataEmissao.localeCompare(b.dataEmissao))

// ─────────────────────────────────────────────────────────────────────────────
// VALIDAR CADA NOTA CONTRA O TOTAL DELA — NÃO CONFIAR EM NENHUMA DAS FONTES.
//
// A leitura nota a nota já produziu dado velho duas vezes: a janela de detalhe
// não trocava e eu relia a nota anterior, sem erro nenhum. Na primeira vez foram
// oito notas com o mesmo valor; na segunda, 14/08 saiu com R$ 3,13M contra
// R$ 2,39M reais.
//
// O total de cada nota vem de OUTRA fonte (a grade de notas de entrada, que a
// API e o robô leem igual, conferido no centavo). Somar os itens de uma nota e
// comparar com o total dela é a checagem mais barata que existe aqui — e é a
// única que pega leitura repetida, porque dado velho tem cara de dado bom.
const arqNotas = `robot/out/api-producao-${mes}.json`
if (existsSync(arqNotas)) {
  const totalPorNf = new Map()
  for (const n of JSON.parse(readFileSync(arqNotas, 'utf8')).nfs ?? []) {
    if (!n.entrada) continue
    totalPorNf.set(String(n.numeroNf), Number(n.valorTotalNf) || 0)
  }
  const soma = new Map()
  for (const x of itens) {
    const k = String(x.numeroNf)
    soma.set(k, (soma.get(k) ?? 0) + x.valorTotal)
  }
  const suspeitas = new Set()
  for (const [nf, s] of soma) {
    const esperado = totalPorNf.get(nf)
    if (esperado == null) continue // nota fora da varredura: não dá para julgar
    if (Math.abs(s - esperado) > Math.max(1, esperado * 0.02)) suspeitas.add(nf)
  }
  if (suspeitas.size) {
    const antesFiltro = itens.length
    const descartado = itens.filter((x) => suspeitas.has(String(x.numeroNf)))
      .reduce((s, x) => s + x.valorTotal, 0)
    itens = itens.filter((x) => !suspeitas.has(String(x.numeroNf)))
    console.log(`   ⚠ ${suspeitas.size} nota(s) com itens que NÃO fecham com o total — descartadas`)
    console.log(`     ${antesFiltro - itens.length} item(ns), ${brl(descartado)}`)
    console.log(`     (leitura repetida: o detalhe não trocou de nota)`)
  }
}
const cobertos = new Set(itens.map((x) => x.dataEmissao))
// Uma falha deixa de valer quando o dia dela passou a ter item de outra fonte.
const falhasRestantes = (doc.falhas ?? []).filter((f) => !(f.de === f.ate && cobertos.has(f.de)))

writeFileSync(base, JSON.stringify({
  ...doc,
  fonte: 'relatorio-cfop-entrada + nf-entrada-detalhe',
  parcial: falhasRestantes.length > 0,
  falhas: falhasRestantes,
  itens,
}, null, 1), 'utf8')

console.log(`${mes}: ${antes} → ${itens.length} itens`)
for (const u of usados) console.log(`   ${u}`)
console.log(`   soma: ${brl(itens.reduce((s, x) => s + x.valorTotal, 0))}`)
console.log(`   parcial: ${falhasRestantes.length > 0}${falhasRestantes.length ? ` (${falhasRestantes.map((f) => f.de).join(', ')})` : ''}`)
