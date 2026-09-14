/**
 * Publica o DRE com APROPRIAÇÃO DE ESTOQUE.
 *
 * Junta as três peças e grava no Blob que o app lê:
 *   • notas e títulos da API de produção (receita, CPV bruto, despesas);
 *   • sacas vendidas dos itens da nota de saída;
 *   • sacas e valor comprados do relatório de movimentação por CFOP.
 *
 * O ajuste entra como LANÇAMENTO na conta de aquisição do próprio grão (4.1.01
 * soja, 4.1.02 milho, 4.1.03 sorgo, 4.1.05 café), e não como um CPV corrigido em
 * silêncio: um custo que encolhe sem rastro é indefensável numa reunião, e como
 * lançamento ele aparece no analítico da conta e pode ser conferido contra o
 * armazém.
 *
 * Existiu aqui uma conta 4.1.19 ("Variação de estoque"), criada por mim. O plano
 * de contas do cliente vai de 4.1.01 a 4.1.17 e não tem conta de variação de
 * estoque — a diretoria mandou tirar, e com razão: inventar linha no plano de
 * contas de um cliente não é decisão de quem escreve o código.
 *
 *   npx tsx scripts/publicar-com-estoque.mjs 2026-08
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { normalizarEnokiDre } from '../src/lib/enokiDre.ts'
import { mapaEfetivo } from '../src/lib/planoContas.ts'
import { resumirCompras } from '../src/lib/itensCompra.ts'
import { custoMedioMovel, montarMovimentosEstoque, lancamentosDeEstoque, ajusteEstoque, aberturaMinima } from '../src/lib/custoMedio.ts'
import { montarDre } from '../src/lib/dre.ts'
import { CONTA_SEM_DETALHE_COMPRA } from '../src/lib/enokiDre.ts'
import { recortarEmpresa, ajustesDeEstoque } from './_apuracao.mjs'

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
  // A MATRIZ (operação de café, outro CNPJ) fica fora. Ver src/lib/empresas.ts.
  const e = normalizarEnokiDre(recortarEmpresa(JSON.parse(readFileSync(arq, 'utf8')), null))
  lancamentos.push(...e.lancamentos)
  Object.assign(sacas, e.sacas)
  sacasVendidas[mes] = e.sacas[mes] ?? {}

  // OS ITENS DE COMPRA VÊM DA PRÓPRIA NOTA (rota NfEntrada, em produção desde
  // 2026-09-11). Antes precisavam ser extraídos de um relatório de tela, com
  // 96,8% de cobertura no melhor caso; agora vêm completos e conferidos.
  const notasEntrada = recortarEmpresa(JSON.parse(readFileSync(arq, 'utf8')), null).nfs.filter((n) => n.entrada)
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
// A apropriação é montada por `ajustesDeEstoque`, o MESMO código que a
// conferência usa. Uma conferência que não mede o que a publicação produz não
// confere nada — já aconteceu duas vezes neste projeto.
const ajustes = ajustesDeEstoque(lancamentos, rel, meses)
for (const mes of meses) {
  // 4.1.18 é compra sem detalhe de produto. Está zerada desde que a rota
  // NfEntrada passou a entregar os itens, mas se voltar a ter valor ela não tem
  // grão a que pertencer, e o ajuste por grão deixaria esse custo sem
  // apropriação. Melhor gritar do que publicar torto.
  const semDetalhe = lancamentos
    .filter((l) => l.data.slice(0, 7) === mes && l.contaSafragold === CONTA_SEM_DETALHE_COMPRA)
    .reduce((s, l) => s + l.valor, 0)
  if (Math.abs(semDetalhe) >= 0.005) {
    console.log(`   ⚠ ${mes}: ${brl(semDetalhe)} em ${CONTA_SEM_DETALHE_COMPRA} (compra sem grão) fica SEM apropriação`)
  }
  const doMes = ajustes.filter((x) => x.data.startsWith(mes)).reduce((s, x) => s + x.valor, 0)
  console.log(`   ${mes}: custo do vendido ${brl(rel.cpvPorCompetencia[mes] ?? 0)} · apropriação ${brl(doMes)}`)
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
  // SOMA, não `find`: agora há um lançamento por GRÃO, e mostrar o primeiro
  // deles como se fosse o ajuste do mês subnotifica o número.
  const aj = ajustes.filter((x) => x.data.startsWith(mes)).reduce((s, x) => s + x.valor, 0)
  console.log(`   apropriação de estoque   ${brl(aj).padStart(20)}`)
  console.log(`   margem sem apropriação   ${(m(antes) + '%').padStart(20)}`)
  console.log(`   margem com apropriação   ${(m(depois) + '%').padStart(20)}`)
  console.log(`   lucro bruto              ${brl(depois.realizado.lucroBruto).padStart(20)}`)
}

const saida = 'robot/out/lancamentos-estoque.json'
writeFileSync(saida, JSON.stringify({ geradoEm: new Date().toISOString(), meses, ajustes }, null, 1), 'utf8')
console.log(`\ngravado: ${saida} — ${ajustes.length} lançamento(s) de variação de estoque`)
