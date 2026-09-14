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
// ⚠ A UNIDADE VEM DO PREÇO, NÃO DO CADASTRO — o cadastro mente.
//
// Cheguei a usar `/Produtos` (`unidade` e `fatorSaca`) por parecer a resposta
// exata. Não é: o produto 5 ("CAFÉ EM GRÃOS", cadastrado como SC) aparece numa
// nota com 30.000 a R$ 33,00 (preço de QUILO) e noutra com 220,93 a R$ 1.625,00
// (preço de SACA). Mesma ficha, duas unidades.
//
// Confiar no cadastro transformou 30.000 kg em 30.000 SACAS e inflou o estoque
// de café em 58 mil sacas — a margem de agosto saltou para 18% sem que nada
// parecesse errado.
//
// O preço unitário, esse, não mente: café a R$ 33 só fecha como quilo, a
// R$ 1.625 só fecha como saca. `inferirUnidade` (testado em `enokiDre.ts`) faz
// exatamente essa leitura, e é a mesma que a receita já usa.

import { GRAOS, type Grao } from './tipos'
import { sacasDeItem } from './enokiDre'

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

/**
 * MERCADORIA DE COPA NÃO É GRÃO.
 *
 * "FILTRO P/CAFE ALIS 103 PERMANENTE 1UN", "XICARA SOFIA ALTA CAFE BRANCA -
 * 70ML", "CAFE BOM DIA TRADICIONAL ALMOFADA 500G" — todos casam com /CAFE/ e
 * nenhum é café em grãos. São R$ 2.064 na filial MG, valor irrisório, mas
 * entravam na cadeia de estoque como SACAS e puxavam o custo médio para baixo.
 *
 * A inferência por preço não pega isto, e é importante saber por quê: um pacote
 * de 500 g a R$ 33 dá R$ 66/kg, que vezes 60 são R$ 3.960/saca — dentro da faixa
 * plausível do café. Torrado em varejo e verde a granel custam a mesma ordem de
 * grandeza por quilo. Só a descrição separa os dois.
 *
 * Por isso a regra olha o que o item É: um objeto de copa, ou uma embalagem de
 * varejo (gramas, mililitros, unidades). Grão a granel não vem em 500 G.
 */
const COPA_OU_VAREJO = /\b(FILTRO|XICARA|CANECA|COADOR|GARRAFA|COPO|CAFETEIRA)\b|\b\d+\s?(G|ML|UN)\b/

/** Grão a partir da descrição do produto. Sem grão, o item não é mercadoria. */
export function graoDoProduto(descricao: string): Grao | null {
  const d = String(descricao ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
  if (COPA_OU_VAREJO.test(d)) return null
  if (d.includes('SOJA')) return 'soja'
  if (d.includes('MILHO')) return 'milho'
  if (d.includes('SORGO') || d.includes('SOGO')) return 'sorgo'
  if (d.includes('CAFE')) return 'cafe'
  return null
}

/**
 * CFOPs que representam ENTRADA DE MERCADORIA NO ESTOQUE.
 *
 * ⚠ O RETORNO DE ARMAZÉM (907) ENTRA — e eu tinha excluído, errado.
 *
 * O raciocínio parecia sólido: "o grão já era nosso, contá-lo dobraria o
 * volume". Os números dizem o contrário. Em 20 meses (jan/2025 a ago/2026) a
 * soja comprou 2.203.640 sacas e vendeu 2.348.549 — um furo de 144.909 sacas
 * que nunca fechava, e que fazia o saldo ficar negativo já no segundo mês,
 * quebrando o custo médio. Somando o retorno de armazém, a compra vai a
 * 2.343.689 e o saldo fecha em -4.860 sacas: 0,2%.
 *
 * A explicação é a simetria: a REMESSA para o armazém (5905/5934) não é contada
 * como saída de estoque, então o retorno não pode ser ignorado como entrada.
 * Ignorar os dois lados fecharia; ignorar só um deixa o furo.
 *
 * Note que isto é uma pergunta DIFERENTE da do DRE: lá o 1907 conta como custo
 * na convenção do cliente. Aqui a pergunta é de VOLUME FÍSICO, e a resposta é a
 * mesma por coincidência — mas pelos motivos certos.
 */
const SUFIXO_COMPRA = new Set(['101', '102', '111', '116', '117', '120', '122', '907'])
const SUFIXO_DEVOLUCAO = new Set(['201', '202'])

function sufixo(cfop: string): string {
  const d = String(cfop ?? '').replace(/\D/g, '')
  return d.length >= 4 ? d.slice(-3) : ''
}

/**
 * Converte a quantidade em SACAS pela UNIDADE INFERIDA DO PREÇO.
 *
 * O `cadastro` entra só como desempate quando o preço não decide (item sem valor
 * unitário, por exemplo) — nunca como fonte primária, pelo motivo no cabeçalho.
 */
export function emSacas(item: ItemCompra, cadastro: Map<number, ProdutoCadastro>): number {
  const grao = graoDoProduto(item.produto)
  if (grao && item.valorUnitario > 0) {
    return sacasDeItem(item.produto, item.quantidade, item.valorUnitario)
  }
  const p = item.idProduto != null ? cadastro.get(item.idProduto) : undefined
  const fator = p?.fatorSaca && p.fatorSaca > 0 ? p.fatorSaca : 60
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
