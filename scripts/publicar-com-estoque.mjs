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
import { custoMedioMovel, montarMovimentosEstoque, lancamentosDeEstoque, ajusteEstoque, aberturaMinima } from '../src/lib/custoMedio.ts'
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

  // OS ITENS DE COMPRA VÊM DA PRÓPRIA NOTA (rota NfEntrada, em produção desde
  // 2026-09-11). Antes precisavam ser extraídos de um relatório de tela, com
  // 96,8% de cobertura no melhor caso; agora vêm completos e conferidos.
  const notasEntrada = JSON.parse(readFileSync(arq, 'utf8')).nfs.filter((n) => n.entrada)
  const itensCompra = []
  for (const n of notasEntrada) {
    if (n.status !== 'Finalizada') continue
    for (const i of n.itens ?? []) {
      itensCompra.push({
        dataEmissao: String(n.dataEmissao).slice(0, 10),
        numeroNf: String(n.numeroNf),
        cfop: String(n.cfop ?? '').replace(/\D/g, ''),
        idProduto: i.idProduto ?? null,
        produto: i.produto ?? '',
        contrato: (n.contratosVinculados ?? [])[0]?.numeroContrato ?? '',
        quantidade: Number(i.quantidade) || 0,
        valorUnitario: Number(i.valorUnitario) || 0,
        valorTotal: Number(i.valorTotal) || 0,
      })
    }
  }
  const semItens = notasEntrada.filter((n) => n.status === 'Finalizada' && !(n.itens ?? []).length)
  if (semItens.length) console.log(`   ⚠ ${semItens.length} nota(s) de entrada sem itens`)
  const r = resumirCompras(itensCompra, cadastro)
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
// A API começa em janeiro/2025, mas a empresa não. A soja vendida naquele mês
// veio da safra de 2024 — grão que entrou antes da primeira nota legível. Sem
// isso a média móvel divide por um saldo inexistente (o café chegou a
// -R$ 13.759/saca). `aberturaMinima` devolve o PISO que as notas denunciam: se
// o saldo afunda a -38.706 sacas, havia ao menos 38.706 na abertura.
const abertura = aberturaMinima(meses, movimentos)
if (Object.keys(abertura).length) {
  console.log('\n═══ ESTOQUE DE ABERTURA INFERIDO (piso, não inventário)')
  for (const [grao, a] of Object.entries(abertura)) {
    console.log(`   ${grao.padEnd(7)}${a.sacas.toLocaleString('pt-BR').padStart(10)} sacas   ${brl(a.valor).padStart(20)}   ${brl(a.valor / a.sacas)}/saca`)
  }
}
const rel = custoMedioMovel(meses, movimentos, abertura)

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

// ─────────────────────────────────────────────────────────────────────────────
// ESTOQUE NEGATIVO INVALIDA O CUSTO MÉDIO — E O SCRIPT RECUSA.
//
// A média ponderada só existe se houver estoque. Quando as vendas passam do
// disponível, a conta divide por um saldo que não existe e devolve qualquer
// coisa: no ano de 2026 o café saiu com custo de R$ 4.458, depois -R$ 4.019 e
// enfim R$ 20.152/saca, e agosto apareceu com margem de -155%.
//
// O erro não é de arredondamento, é de premissa: falta o ESTOQUE DE ABERTURA.
// A soja vende mais do que compra TODO mês desde janeiro, o que significa grão
// comprado em 2025 — ou volume de venda inflado por remessa que sai e volta.
//
// Emitir o ajuste assim mesmo poria um número absurdo no DRE com cara de
// apurado. Melhor um CPV admitidamente incompleto (a compra do mês, com o aviso
// na tela) do que um inventado.
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

// A tabela vem ANTES da recusa: saber ONDE o saldo virou negativo é o que
// aponta o mês em que falta compra ou estoque de abertura. Recusar sem mostrar
// deixa quem lê sem o dado que resolveria.
console.log('\n═══ MOVIMENTO DE ESTOQUE (sacas)')
console.log('MÊS      GRÃO     inicial  compradas   vendidas      final   custo médio')
const nSac = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
for (const p of rel.posicoes) {
  if (!p.sacasCompradas && !p.sacasVendidas && !p.sacasIniciais) continue
  console.log(
    `  ${p.competencia}  ${p.rotulo.padEnd(7)}${nSac(p.sacasIniciais).padStart(8)}` +
    `${nSac(p.sacasCompradas).padStart(11)}${nSac(p.sacasVendidas).padStart(11)}` +
    `${nSac(p.sacasFinais).padStart(11)}${('R$ ' + p.custoMedio.toFixed(2)).padStart(14)}` +
    (p.estoqueNegativo ? '  ⚠ vendeu mais do que tinha' : '') +
    (p.volumeSemValor ? '  ⚠ volume sem valor' : ''),
  )
}
if (rel.competenciasComAlerta.length) {
  console.log(`\n⚠ ALERTA em ${rel.competenciasComAlerta.join(', ')} — estoque negativo significa`)
  console.log('  que falta compra ou estoque de abertura; o CPV sai subavaliado.')
}

const graosQuebrados = new Set(
  rel.posicoes.filter((p) => p.estoqueNegativo).map((p) => p.rotulo),
)
if (graosQuebrados.length !== 0 && graosQuebrados.size) {
  console.log(`\n✗ NÃO vou gerar ajuste de estoque: ${[...graosQuebrados].join(', ')} com saldo negativo.`)
  console.log('  A média móvel precisa de estoque de abertura, que ainda não temos.')
  console.log('  O DRE fica com o CPV = compra do mês, e o aviso na tela explica a distorção.')
  writeFileSync('robot/out/lancamentos-estoque.json',
    JSON.stringify({ geradoEm: new Date().toISOString(), meses, ajustes: [], motivo: 'estoque negativo' }, null, 1), 'utf8')
  process.exit(0)
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
