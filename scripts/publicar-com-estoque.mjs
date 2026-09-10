/**
 * Publica o DRE com APROPRIAÇÃO DE ESTOQUE.
 *
 * Junta as três peças e grava no Blob que o app lê:
 *   • notas e títulos da API de produção (receita, CPV bruto, despesas);
 *   • sacas vendidas dos itens da nota de saída;
 *   • sacas e valor comprados do relatório de movimentação por CFOP.
 *
 * O ajuste entra como LANÇAMENTO na conta 4.1.19 ("Variação de estoque"), e não
 * como um CPV corrigido em silêncio: um custo que encolhe sem explicação é
 * indefensável numa reunião, e como linha ele aparece no analítico e pode ser
 * conferido contra o armazém.
 *
 *   npx tsx scripts/publicar-com-estoque.mjs 2026-08
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { normalizarEnokiDre } from '../src/lib/enokiDre.ts'
import { mapaEfetivo } from '../src/lib/planoContas.ts'
import { resumirCompras } from '../src/lib/itensCompra.ts'
import { custoMedioMovel, montarMovimentosEstoque, lancamentosDeEstoque, ajusteEstoque } from '../src/lib/custoMedio.ts'
import { montarDre } from '../src/lib/dre.ts'

const meses = process.argv.slice(2).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort()
if (!meses.length) { console.error('uso: npx tsx scripts/publicar-com-estoque.mjs 2026-08'); process.exit(1) }

const brl = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const env = readFileSync('.env.local', 'utf8')
const BASE = env.match(/ENOKI_BASE_URL="?([^"\n]+)"?/)?.[1]
const KEY = env.match(/ENOKI_API_KEY="?([^"\n]+)"?/)?.[1]
const produtos = await fetch(`${BASE}/api/Customizados/v1/ParceiroDoGrao/Produtos?top=500`, {
  headers: { 'X-Api-Key': KEY, accept: 'application/json' },
}).then((r) => r.json())
const cadastro = new Map(produtos.map((p) => [p.idProduto, { ...p, fatorSaca: Number(p.fatorSaca) || 60 }]))

const lancamentos = []
const sacas = {}
const sacasVendidas = {}
const sacasCompradas = {}
const valorComprado = {}

for (const mes of meses) {
  const arq = `robot/out/api-producao-${mes}.json`
  if (!existsSync(arq)) { console.error(`falta ${arq}`); process.exit(1) }
  const e = normalizarEnokiDre(JSON.parse(readFileSync(arq, 'utf8')))
  lancamentos.push(...e.lancamentos)
  Object.assign(sacas, e.sacas)
  sacasVendidas[mes] = e.sacas[mes] ?? {}

  const arqItens = `robot/out/itens-compra-${mes}.json`
  if (!existsSync(arqItens)) { console.error(`falta ${arqItens} — sem ele não há custo médio`); process.exit(1) }
  const bruto = JSON.parse(readFileSync(arqItens, 'utf8'))
  if (bruto.parcial) { console.error(`${mes}: leitura PARCIAL — recuse, o custo médio sairia barato`); process.exit(1) }
  const r = resumirCompras(bruto.itens, cadastro)
  sacasCompradas[mes] = r.sacas[mes] ?? {}
  valorComprado[mes] = r.valor[mes] ?? {}
}

const mapa = mapaEfetivo([])
const movimentos = montarMovimentosEstoque(meses, lancamentos, sacasVendidas, sacasCompradas)
// O valor vem do MESMO documento que a quantidade: preço e volume da mesma compra.
for (const m of movimentos) {
  const v = valorComprado[m.competencia]?.[m.grao]
  if (v != null) m.valorComprado = v
}
const rel = custoMedioMovel(meses, movimentos)

// ─────────────────────────────────────────────────────────────────────────────
// A BASE DO AJUSTE É O QUE ESTÁ NO DRE, NÃO O QUE O RELATÓRIO LEU.
//
// `ajusteEstoque` compara o CPV pelo custo médio com o valor comprado dos
// MOVIMENTOS — que vem do relatório de itens. Mas quem está lançado no DRE é o
// valor das NOTAS, e as duas coisas diferem pela cobertura da leitura (96,8% em
// agosto/2026). Usar a base errada deixou o ajuste em -R$ 1,31M quando o certo
// era -R$ 3,03M, e a margem em -5,95% em vez de +3,69%.
//
// O ajuste correto é: (custo do que foi vendido) − (aquisição lançada no DRE).
const CONTAS_AQUISICAO = new Set(['4.1.18', '4.1.01', '4.1.02', '4.1.03', '4.1.05'])
const ajustes = []
for (const mes of meses) {
  const aquisicaoNoDre = lancamentos
    .filter((l) => l.data.slice(0, 7) === mes && CONTAS_AQUISICAO.has(l.contaSafragold))
    .reduce((s, l) => s + l.valor, 0)
  const cpvCorreto = rel.cpvPorCompetencia[mes] ?? 0
  const valor = Math.round((cpvCorreto - aquisicaoNoDre) * 100) / 100
  if (Math.abs(valor) < 0.005) continue
  const [a, m] = mes.split('-').map(Number)
  ajustes.push({
    id: `estoque-${mes}`,
    data: `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`,
    contaSafragold: '4.1.19',
    historico: valor < 0
      ? 'Grão comprado e não vendido no mês (sai do custo, fica no estoque)'
      : 'Grão vendido de estoque anterior (entra no custo)',
    valor,
    origem: 'enoki',
  })
  console.log(`   ${mes}: aquisição no DRE ${brl(aquisicaoNoDre)} · custo do vendido ${brl(cpvCorreto)}`)
}

for (const mes of meses) {
  const antes = montarDre(mes, lancamentos, mapa)
  const depois = montarDre(mes, [...lancamentos, ...ajustes], mapa)
  const m = (d) => (d.realizado.lucroBruto / d.realizado.receitaLiquida * 100).toFixed(2)
  console.log(`\n${mes}`)
  const aj = ajustes.find((x) => x.data.startsWith(mes))?.valor ?? 0
  console.log(`   variação de estoque      ${brl(aj).padStart(20)}`)
  console.log(`   margem sem apropriação   ${(m(antes) + '%').padStart(20)}`)
  console.log(`   margem com apropriação   ${(m(depois) + '%').padStart(20)}`)
  console.log(`   lucro bruto              ${brl(depois.realizado.lucroBruto).padStart(20)}`)
}

const saida = 'robot/out/lancamentos-estoque.json'
writeFileSync(saida, JSON.stringify({ geradoEm: new Date().toISOString(), meses, ajustes }, null, 1), 'utf8')
console.log(`\ngravado: ${saida} — ${ajustes.length} lançamento(s) de variação de estoque`)
