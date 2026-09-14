/**
 * O PIPELINE DE APURAÇÃO, EM UM LUGAR SÓ.
 *
 * Existia duas vezes: `publicar-com-estoque.mjs` apurava com custo médio e
 * `conferir-planilha.mjs` conferia contra a planilha do cliente lendo as notas
 * cruas. As duas discordavam — a conferência reprovava todos os meses porque
 * media a COMPRA DO MÊS, enquanto a publicação já media o CUSTO DO VENDIDO.
 *
 * Uma conferência que não mede o que a publicação produz não confere nada. Daí
 * este módulo: as duas entram pela mesma porta.
 */
import { readFileSync, existsSync } from 'node:fs'
import { normalizarEnokiDre } from '../src/lib/enokiDre.ts'
import { resumirCompras } from '../src/lib/itensCompra.ts'
import { custoMedioMovel, montarMovimentosEstoque, aberturaMinima } from '../src/lib/custoMedio.ts'

export const arquivoDaCarga = (mes) => `robot/out/api-producao-${mes}.json`

/** Cadastro de produtos da API — só para o fator de conversão saca↔kg. */
export async function carregarCadastro() {
  const env = readFileSync('.env.local', 'utf8')
  const BASE = env.match(/ENOKI_BASE_URL="?([^"\n]+)"?/)?.[1]
  const KEY = env.match(/ENOKI_API_KEY="?([^"\n]+)"?/)?.[1]
  const produtos = await fetch(`${BASE}/api/Customizados/v1/ParceiroDoGrao/Produtos?top=500`, {
    headers: { 'X-Api-Key': KEY, accept: 'application/json' },
  }).then((r) => r.json())
  return new Map(produtos.map((p) => [p.idProduto, { ...p, fatorSaca: Number(p.fatorSaca) || 60 }]))
}

/** Itens das notas de ENTRADA — é de onde sai o volume e o valor comprado. */
export function itensDeCompra(carga) {
  const itens = []
  for (const n of carga.nfs.filter((n) => n.entrada && n.status === 'Finalizada')) {
    for (const i of n.itens ?? []) {
      itens.push({
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
  return itens
}

/**
 * Recorta a carga por empresa.
 *
 * A planilha do cliente ("DRE ACUMULADO _CEREAIS") é da EMPRESA 1. As outras
 * não são ruído: a empresa 2 vendeu R$ 3,5 milhões por CFOP 5102 em agosto/2026
 * e a 3, R$ 1,2 milhão por 6106 — outra linha de negócio, num DRE separado.
 * Somá-las e comparar com a planilha inflava a receita em 24% e fazia a
 * conferência culpar o CPV por um erro que era de escopo.
 */
export function recortarEmpresa(carga, idEmpresa) {
  if (idEmpresa == null) return carga
  const daEmpresa = (x) => x.idEmpresa === idEmpresa
  return {
    ...carga,
    nfs: carga.nfs.filter(daEmpresa),
    pagar: (carga.pagar ?? []).filter(daEmpresa),
    receber: (carga.receber ?? []).filter(daEmpresa),
  }
}

/**
 * Apura os meses pedidos: lançamentos do DRE + custo médio móvel com a abertura
 * inferida. `meses` precisa vir ordenado — o estoque de um mês é o inicial do
 * seguinte, e a ordem É o cálculo.
 *
 * `idEmpresa` recorta o escopo; sem ele apura o consolidado das cinco.
 */
export async function apurar(meses, cadastro, idEmpresa) {
  cadastro ??= await carregarCadastro()
  const lancamentos = []
  const sacasVendidas = {}
  const sacasCompradas = {}
  const valorComprado = {}
  const semItens = []

  for (const mes of meses) {
    const arq = arquivoDaCarga(mes)
    if (!existsSync(arq)) throw new Error(`falta ${arq}`)
    const carga = recortarEmpresa(JSON.parse(readFileSync(arq, 'utf8')), idEmpresa)
    const e = normalizarEnokiDre(carga)
    lancamentos.push(...e.lancamentos)
    sacasVendidas[mes] = e.sacas[mes] ?? {}

    const r = resumirCompras(itensDeCompra(carga), cadastro)
    sacasCompradas[mes] = r.sacas[mes] ?? {}
    valorComprado[mes] = r.valor[mes] ?? {}
    const sem = carga.nfs.filter((n) => n.entrada && n.status === 'Finalizada' && !(n.itens ?? []).length)
    if (sem.length) semItens.push({ mes, notas: sem.length })
  }

  const movimentos = montarMovimentosEstoque(meses, lancamentos, sacasVendidas, sacasCompradas)
  // Valor e volume vêm do MESMO documento: preço e quantidade da mesma compra.
  for (const m of movimentos) {
    const v = valorComprado[m.competencia]?.[m.grao]
    if (v != null) m.valorComprado = v
  }

  const abertura = aberturaMinima(meses, movimentos)
  const rel = custoMedioMovel(meses, movimentos, abertura)
  return { lancamentos, movimentos, abertura, rel, semItens }
}

/** Contas em que a aquisição de grão está lançada hoje no DRE. */
export const CONTAS_AQUISICAO = new Set(['4.1.18', '4.1.01', '4.1.02', '4.1.03', '4.1.05'])

export function aquisicaoNoDre(lancamentos, mes) {
  return lancamentos
    .filter((l) => l.data.slice(0, 7) === mes && CONTAS_AQUISICAO.has(l.contaSafragold))
    .reduce((s, l) => s + l.valor, 0)
}
