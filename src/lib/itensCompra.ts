// Itens das notas de COMPRA → sacas e valor por grão e competência.
//
// De onde vêm: o relatório "Movimentação de Produtos por CFOP — ENTRADA" do ERP,
// lido por `robot/scrape-itens-compra.mjs`. É a ÚNICA fonte de quantidade
// comprada — a API de produção não tem rota de nota de entrada, e os contratos
// que ela expõe são todos de venda (723 de 723).
//
// Com isto, `custoMedio.ts` sai do papel: ele já sabia fazer a conta certa
// (custo médio móvel por grão), e só esperava as sacas compradas, que até aqui
// tinham de ser digitadas à mão.
//
// UNIDADE: o ERP mistura KG e SC no mesmo relatório. A conversão NÃO é chutada
// por faixa de preço como em `enokiDre.ts` — aqui ela vem do cadastro
// (`/Produtos` da API: `unidade` e `fatorSaca`), que é a resposta exata.

import { GRAOS, type Grao } from './tipos'

/** Linha do relatório, como o robô a entrega. */
export interface ItemCompra {
  dataEmissao: string
  numeroNf: string
  cfop: string
  idProduto: number | null
  produto: string
  contrato: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
}

/** Cadastro de produto, de `/Produtos` da API. */
export interface ProdutoCadastro {
  idProduto: number
  descricao: string
  /** 'KG' | 'SC' | 'UN'… */
  unidade: string
  /** Quantos KG numa saca (60 para grão). */
  fatorSaca: number
}

/** Grão a partir da descrição do produto. Sem grão, o item não é mercadoria. */
export function graoDoProduto(descricao: string): Grao | null {
  const d = String(descricao ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
  if (d.includes('SOJA')) return 'soja'
  if (d.includes('MILHO')) return 'milho'
  if (d.includes('SORGO') || d.includes('SOGO')) return 'sorgo'
  if (d.includes('CAFE')) return 'cafe'
  return null
}

/**
 * CFOPs que representam AQUISIÇÃO de mercadoria para o estoque.
 *
 * O relatório traz também devolução (1202/2202) e retorno de armazém (1907). A
 * devolução REDUZ o que entrou; o retorno de armazém é grão que já era nosso
 * voltando, e por isso NÃO entra como compra nova — contá-lo dobraria o volume
 * e derrubaria o custo médio artificialmente.
 */
const SUFIXO_COMPRA = new Set(['101', '102', '111', '116', '117', '120', '122'])
const SUFIXO_DEVOLUCAO = new Set(['201', '202'])

function sufixo(cfop: string): string {
  const d = String(cfop ?? '').replace(/\D/g, '')
  return d.length >= 4 ? d.slice(-3) : ''
}

/** Converte a quantidade do relatório em SACAS, pelo cadastro do produto. */
export function emSacas(item: ItemCompra, cadastro: Map<number, ProdutoCadastro>): number {
  const p = item.idProduto != null ? cadastro.get(item.idProduto) : undefined
  const fator = p?.fatorSaca && p.fatorSaca > 0 ? p.fatorSaca : 60
  // Já em sacas: o cadastro do café usa SC; a soja e o milho usam KG.
  if (p && p.unidade?.toUpperCase() === 'SC') return item.quantidade
  return item.quantidade / fator
}

export interface ResumoCompras {
  /** Sacas compradas por competência ('YYYY-MM') e grão. */
  sacas: Record<string, Partial<Record<Grao, number>>>
  /** Valor comprado por competência e grão. */
  valor: Record<string, Partial<Record<Grao, number>>>
  /** Itens que não viraram compra, com o motivo — nada some em silêncio. */
  ignorados: { motivo: string; quantidade: number; valor: number }[]
}

/**
 * Agrega os itens em sacas e valor por competência e grão.
 *
 * Devolução entra NEGATIVA nos dois (sacas e valor): ela desfaz uma entrada, e
 * tratá-la como compra separada inflaria o volume e o custo ao mesmo tempo.
 */
export function resumirCompras(
  itens: ItemCompra[],
  cadastro: Map<number, ProdutoCadastro>,
): ResumoCompras {
  const sacas: Record<string, Partial<Record<Grao, number>>> = {}
  const valor: Record<string, Partial<Record<Grao, number>>> = {}
  const ignorados = new Map<string, { motivo: string; quantidade: number; valor: number }>()

  const ignorar = (motivo: string, item: ItemCompra) => {
    const a = ignorados.get(motivo) ?? { motivo, quantidade: 0, valor: 0 }
    a.quantidade++
    a.valor += item.valorTotal
    ignorados.set(motivo, a)
  }

  for (const item of itens) {
    const grao = graoDoProduto(item.produto)
    if (!grao) { ignorar('produto_nao_e_grao', item); continue }
    const suf = sufixo(item.cfop)
    const ehCompra = SUFIXO_COMPRA.has(suf)
    const ehDevolucao = SUFIXO_DEVOLUCAO.has(suf)
    if (!ehCompra && !ehDevolucao) { ignorar(`cfop_${item.cfop}_nao_e_aquisicao`, item); continue }

    const competencia = item.dataEmissao.slice(0, 7)
    const sinal = ehDevolucao ? -1 : 1
    ;(sacas[competencia] ??= {})[grao] = (sacas[competencia][grao] ?? 0) + sinal * emSacas(item, cadastro)
    ;(valor[competencia] ??= {})[grao] = (valor[competencia][grao] ?? 0) + sinal * item.valorTotal
  }

  // Arredonda para não arrastar ruído de ponto flutuante para o custo médio.
  for (const mapa of [sacas, valor]) {
    for (const comp of Object.keys(mapa)) {
      for (const g of GRAOS) {
        const v = mapa[comp][g]
        if (v != null) mapa[comp][g] = Math.round(v * 100) / 100
      }
    }
  }

  return { sacas, valor, ignorados: [...ignorados.values()].sort((a, b) => b.valor - a.valor) }
}
