/**
 * DRE com apropriação de ESTOQUE — o CPV vira custo do que foi VENDIDO.
 *
 * O DRE de agosto/2026 fechou com -13% de margem, e o número estava certo para o
 * método e errado para a realidade: o custo lançado era a COMPRA DO MÊS, não o
 * custo do que saiu. Num mês em que a empresa estoca, isso vira prejuízo
 * contábil sem prejuízo econômico.
 *
 * Aqui a conta é a de sempre no comércio de commodity fungível — média ponderada
 * móvel por grão:
 *
 *     custo médio   = (estoque inicial + comprado) ÷ (sacas iniciais + compradas)
 *     CPV           = sacas VENDIDAS × custo médio
 *     estoque final = o que sobrou, ao mesmo custo
 *
 * As três peças, e de onde cada uma vem:
 *   • sacas VENDIDAS  → itens da nota de saída, da API de produção;
 *   • sacas COMPRADAS → relatório de movimentação por CFOP (robot/scrape-itens-compra.mjs);
 *   • valor comprado  → o mesmo relatório.
 *
 * A terceira era a que faltava, e é o que este script finalmente permite usar.
 *
 *   npx tsx scripts/dre-com-estoque.mjs 2026-07 2026-08
 */
import { readFileSync, existsSync } from 'node:fs'
import { normalizarEnokiDre } from '../src/lib/enokiDre.ts'
import { montarDre } from '../src/lib/dre.ts'
import { mapaEfetivo } from '../src/lib/planoContas.ts'
import { resumirCompras } from '../src/lib/itensCompra.ts'
import { custoMedioMovel, montarMovimentosEstoque, ajusteEstoque } from '../src/lib/custoMedio.ts'
import { GRAOS, ROTULO_GRAO } from '../src/lib/tipos.ts'

const meses = process.argv.slice(2).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort()
if (!meses.length) {
  console.error('uso: npx tsx scripts/dre-com-estoque.mjs 2026-07 2026-08')
  process.exit(1)
}

const brl = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const num = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

// Cadastro de produtos: diz KG ou SC e o fator da saca. Sem ele a conversão
// seria chute — e o café, cadastrado em SC, sairia com 1/60 do volume.
const env = readFileSync('.env.local', 'utf8')
const BASE = env.match(/ENOKI_BASE_URL="?([^"\n]+)"?/)?.[1]
const KEY = env.match(/ENOKI_API_KEY="?([^"\n]+)"?/)?.[1]
const produtos = await fetch(`${BASE}/api/Customizados/v1/ParceiroDoGrao/Produtos?top=500`, {
  headers: { 'X-Api-Key': KEY, accept: 'application/json' },
}).then((r) => r.json())
const cadastro = new Map(
  produtos.map((p) => [p.idProduto, { ...p, fatorSaca: Number(p.fatorSaca) || 60 }]),
)

const lancamentos = []
const sacasVendidas = {}
const sacasCompradas = {}
const valorComprado = {}
let semItens = []

for (const mes of meses) {
  const arqDre = `robot/out/api-producao-${mes}.json`
  if (!existsSync(arqDre)) { console.error(`falta ${arqDre}`); process.exit(1) }
  const e = normalizarEnokiDre(JSON.parse(readFileSync(arqDre, 'utf8')))
  lancamentos.push(...e.lancamentos)
  sacasVendidas[mes] = e.sacas[mes] ?? {}

  const arqItens = `robot/out/itens-compra-${mes}.json`
  if (!existsSync(arqItens)) { semItens.push(mes); continue }
  const bruto = JSON.parse(readFileSync(arqItens, 'utf8'))

  // MÊS INCOMPLETO NÃO SERVE PARA CUSTO MÉDIO.
  //
  // Faltando compras, o volume de entrada fica menor do que foi e o custo médio
  // sai BARATO — o que barateia o CPV e infla o lucro. O erro é silencioso e a
  // conta continua fechando, então a recusa tem de ser aqui.
  if (bruto.parcial) {
    const falhas = (bruto.falhas ?? []).length
    console.error(`\n✗ ${mes}: leitura PARCIAL (${falhas} intervalo(s)/nota(s) não lido(s)).`)
    console.error('  Custo médio com compra faltando sai barato demais e infla o lucro.')
    console.error(`  Rode de novo: node robot/scrape-itens-compra.mjs --meses=${mes}`)
    process.exit(1)
  }
  const { itens } = bruto
  const r = resumirCompras(itens, cadastro)
  sacasCompradas[mes] = r.sacas[mes] ?? {}
  valorComprado[mes] = r.valor[mes] ?? {}
  const ignorado = r.ignorados.reduce((s, x) => s + x.valor, 0)
  console.log(`${mes}: ${itens.length} itens de compra · ${brl(Object.values(r.valor[mes] ?? {}).reduce((s, v) => s + v, 0))}` +
    (ignorado ? ` · ${brl(ignorado)} ignorado (${r.ignorados.map((x) => x.motivo).join(', ')})` : ''))
}

if (semItens.length) {
  console.log(`\n⚠ SEM itens de compra em ${semItens.join(', ')} — rode robot/scrape-itens-compra.mjs.`)
  console.log('  Sem eles o custo médio não existe e o CPV continua sendo a compra do mês.')
  process.exit(1)
}

const mapa = mapaEfetivo([])
const movimentos = montarMovimentosEstoque(meses, lancamentos, sacasVendidas, sacasCompradas)

// O valor comprado do relatório é mais fiel que o dos lançamentos: vem do mesmo
// documento que a quantidade, então preço e volume descrevem a MESMA compra.
for (const m of movimentos) {
  const v = valorComprado[m.competencia]?.[m.grao]
  if (v != null) m.valorComprado = v
}

const rel = custoMedioMovel(meses, movimentos)

console.log('\n═══ MOVIMENTO DE ESTOQUE (sacas)')
console.log('MÊS      GRÃO     inicial   compradas   vendidas    final   custo médio')
for (const p of rel.posicoes) {
  if (!p.sacasCompradas && !p.sacasVendidas && !p.sacasIniciais) continue
  console.log(
    `  ${p.competencia}  ${ROTULO_GRAO[p.grao].padEnd(7)}` +
    `${num(p.sacasIniciais).padStart(9)}${num(p.sacasCompradas).padStart(12)}` +
    `${num(p.sacasVendidas).padStart(11)}${num(p.sacasFinais).padStart(9)}` +
    `${('R$ ' + p.custoMedio.toFixed(2)).padStart(14)}` +
    (p.estoqueNegativo ? '  ⚠ estoque negativo' : '') +
    (p.volumeSemValor ? '  ⚠ volume sem valor' : ''),
  )
}

console.log('\n═══ DRE: COMPRA DO MÊS  ×  CUSTO DO QUE FOI VENDIDO')
for (const mes of meses) {
  const dre = montarDre(mes, lancamentos, mapa)
  const rl = dre.realizado.receitaLiquida
  const cpvAtual = dre.linhas.find((l) => l.linha === 'custo_produto').realizado
  const cpvMedio = rel.cpvPorCompetencia[mes] ?? 0
  const ajuste = ajusteEstoque(rel, mes)
  const lbAtual = rl - cpvAtual
  const lbNovo = rl - cpvMedio
  console.log(`\n  ${mes}`)
  console.log(`    receita líquida        ${brl(rl).padStart(20)}`)
  console.log(`    CPV hoje (compras)     ${brl(cpvAtual).padStart(20)}   margem ${(lbAtual / rl * 100).toFixed(2)}%`)
  console.log(`    CPV pelo custo médio   ${brl(cpvMedio).padStart(20)}   margem ${(lbNovo / rl * 100).toFixed(2)}%`)
  console.log(`    → estoque formado      ${brl(-ajuste).padStart(20)}   (grão que entrou e não saiu)`)
}

if (rel.competenciasComAlerta.length) {
  console.log(`\n⚠ meses com alerta: ${rel.competenciasComAlerta.join(', ')}`)
  console.log('  Estoque negativo = vendeu mais do que o disponível: falta compra ou estoque de abertura.')
}
