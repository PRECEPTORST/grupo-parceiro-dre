// Normalização Enoki → DRE por COMPETÊNCIA — DETERMINÍSTICA. Zero IA.
//
// Item 1.1 do ROADMAP.md. Complementa `enoki.ts` (que faz o regime de CAIXA):
// aqui o objetivo é o regime de COMPETÊNCIA, para alimentar `montarDre`.
//
// AS DUAS FONTES E POR QUE NÃO SE SOMAM
// -------------------------------------
// A API expõe o mesmo fato econômico por dois ângulos, e contar os dois seria
// dupla contagem. A divisão é:
//   • RECEITA BRUTA ← `NfSaida` pela `dataEmissao`. A nota fiscal É o fato
//     gerador da venda; é ela que traz produto, quantidade e valor. Os títulos a
//     RECEBER de centro de custo "RECEITA {GRÃO}" são portanto IGNORADOS.
//   • CUSTOS, DESPESAS, DEDUÇÕES, INVESTIMENTOS ← títulos a PAGAR pela
//     `dataLancamento` (data do fato/NF de entrada, não a da quitação).
//   • RECEITAS SEM NOTA (juros, corretagem, armazenagem de terceiros, outras)
//     ← títulos a RECEBER cujo centro de custo NÃO é receita de grão.
//
// ARMADILHAS TRATADAS (todas observadas nos dados reais — §27 do context.md)
// -------------------------------------------------------------------------
//   1. UNIDADE POR PRODUTO: soja/milho/sorgo vêm em QUILOS (÷ 60 = sacas);
//      CAFÉ já vem em SACAS. Confirmado: milho R$ 1,3333/kg × 60 = R$ 80,00/saca,
//      idêntico ao contrato "6.000 SACAS A R$ 80,00".
//   2. INTRAGRUPO: vendas entre as empresas do próprio grupo (mesma raiz de CNPJ)
//      não são receita consolidada — R$ 18,2M em jan–jul. Eliminadas.
//   3. TYPOS DE CADASTRO: "SORGO EM GÃOS", "MILHO EM GRAOS" são o mesmo produto.
//   4. NOTAS QUE NÃO SÃO VENDA: canceladas, de ENTRADA, de ajuste de ICMS e de
//      devolução não geram receita.
//   5. ESTORNOS: pagamento num centro de receita (ou recebimento num centro de
//      compra) entra com valor NEGATIVO na conta correspondente — ver
//      `centroCusto.ts`.

import {
  GRAOS,
  type Grao,
  type LancamentoCanonico,
} from './tipos'
import { destinoDeCentroCusto, normalizarRotulo, SEM_CENTRO_CUSTO } from './centroCusto'
import { cfopDeEntrada, naturezaDeCfop, type NaturezaCfop } from './cfop'
import {
  analisarGapContratos,
  type NotaContrato,
  type TituloContrato,
  type RelatorioGapContratos,
} from './gapContratos'
import { numeroEnoki } from './enoki'

/** Quilos por saca — padrão do agronegócio brasileiro. */
export const KG_POR_SACA = 60

/**
 * Raízes de CNPJ (8 primeiros dígitos) das empresas do grupo, para eliminar as
 * vendas intragrupo. Vindas do endpoint `Empresas` em 2026-08-21; o endpoint é a
 * fonte da verdade e pode sobrepor esta lista via `ConfigEnokiDre`.
 */
export const RAIZES_CNPJ_GRUPO = ['30798330', '22271113', '47591700']

export interface ConfigEnokiDre {
  /** Raízes de CNPJ do grupo (8 dígitos). Ausente = `RAIZES_CNPJ_GRUPO`. */
  raizesGrupo?: string[]
  /**
   * Regras aprendidas para títulos SEM centro de custo: chave (parceiro
   * normalizado) → conta do plano. Preenchidas pela IA e editáveis pelo usuário
   * (item 1.4 do ROADMAP.md). A chave do usuário SEMPRE vence — aqui só chega o
   * que já foi aprovado.
   */
  regras?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Produtos: unidade e grão
// ---------------------------------------------------------------------------

/**
 * Unidade em que o ERP registra a quantidade de um item.
 *
 * ⚠ NÃO é fixa por produto. A mesma base mistura as três: em jan–jul/2026, a
 * soja aparecia em TONELADAS em 1.544 itens (R$ 113,0M) e em QUILOS em 507
 * (R$ 31,3M). Tratar tudo como quilo subcontava ~858 mil sacas de soja e
 * inflava o preço para R$ 908/saca — seis vezes o valor de mercado.
 */
export type UnidadeProduto = 'kg' | 'saca' | 'tonelada' | 'unidade'

const PRODUTOS_GRAO: { re: RegExp; grao: Grao }[] = [
  // Tolerantes a typos de cadastro: "GRAOS"/"GRÃOS"/"GÃOS" e acentuação livre.
  { re: /\bSOJA\b/, grao: 'soja' },
  { re: /\bMILHO\b/, grao: 'milho' },
  { re: /\bSORGO\b/, grao: 'sorgo' },
  { re: /\bCAFE\b/, grao: 'cafe' },
]

/**
 * Faixa PLAUSÍVEL de preço por saca de cada grão (R$). Propositalmente larga —
 * serve para distinguir ordem de grandeza (kg × saca × tonelada), não para
 * validar preço. As três unidades caem em faixas que não se sobrepõem, então a
 * inferência é determinística.
 */
const FAIXA_PRECO_SACA: Record<Grao, [number, number]> = {
  soja: [60, 400],
  milho: [25, 200],
  sorgo: [20, 200],
  cafe: [400, 4000],
}

/** Quanto vale uma saca se a quantidade estiver nesta unidade. */
function precoPorSacaSe(unidade: UnidadeProduto, valorUnitario: number): number {
  if (unidade === 'kg') return valorUnitario * KG_POR_SACA
  if (unidade === 'tonelada') return (valorUnitario / 1000) * KG_POR_SACA
  return valorUnitario // já é por saca
}

/**
 * Descobre a unidade do item pelo PREÇO UNITÁRIO: testa kg, saca e tonelada e
 * fica com a que resulta num preço por saca plausível para aquele grão. É
 * determinístico (as faixas não se sobrepõem) e resiste ao cadastro
 * inconsistente do ERP.
 *
 * Sem preço unitário utilizável, cai no padrão histórico do grão — café em
 * sacas, o resto em quilos — que é o comportamento anterior.
 */
export function inferirUnidade(grao: Grao, valorUnitario: unknown): UnidadeProduto {
  const vu = numeroEnoki(valorUnitario)
  const [min, max] = FAIXA_PRECO_SACA[grao]
  if (vu > 0) {
    for (const u of ['kg', 'saca', 'tonelada'] as const) {
      const preco = precoPorSacaSe(u, vu)
      if (preco >= min && preco <= max) return u
    }
  }
  return grao === 'cafe' ? 'saca' : 'kg'
}

/** Conta de RECEITA (3.1.0x) de cada grão — espelha `GRAO_DE_CONTA`. */
export const CONTA_RECEITA_GRAO: Record<Grao, string> = {
  soja: '3.1.01',
  milho: '3.1.02',
  sorgo: '3.1.03',
  cafe: '3.1.05',
}

/**
 * Marcador de item sintético criado quando a NF não traz itens (fonte scraper).
 * Não é nome de produto: é sinal de que o detalhe não existe.
 */
export const SEM_DETALHE_PRODUTO = '__SEM_DETALHE__'

/** Conta onde a receita sem detalhe de produto pousa — visível no DRE analítico. */
export const CONTA_SEM_DETALHE = '3.1.15'

/** Espelho do anterior no CPV: nota de COMPRA sem itens abertos. */
export const CONTA_SEM_DETALHE_COMPRA = '4.1.18'

/** Conta de AQUISIÇÃO (4.1.0x) de cada grão. */
export const CONTA_AQUISICAO_GRAO: Record<Grao, string> = {
  soja: '4.1.01',
  milho: '4.1.02',
  sorgo: '4.1.03',
  cafe: '4.1.05',
}

/** Grão do produto da NF (null quando não é grão: toner, impressora, ICMS…). */
export function graoDeProduto(produto: string): Grao | null {
  const s = normalizarRotulo(produto)
  for (const p of PRODUTOS_GRAO) if (p.re.test(s)) return p.grao
  return null
}

/** Unidade do item, inferida pelo preço unitário (ver `inferirUnidade`). */
export function unidadeDeProduto(produto: string, valorUnitario?: unknown): UnidadeProduto {
  const grao = graoDeProduto(produto)
  if (!grao) return 'unidade'
  return inferirUnidade(grao, valorUnitario)
}

/**
 * Converte a quantidade da NF em SACAS, inferindo a unidade pelo preço unitário.
 * Produto que não é grão não tem saca (0).
 */
export function sacasDeItem(produto: string, quantidade: unknown, valorUnitario?: unknown): number {
  const q = numeroEnoki(quantidade)
  if (!Number.isFinite(q) || q <= 0) return 0
  const unidade = unidadeDeProduto(produto, valorUnitario)
  if (unidade === 'kg') return q / KG_POR_SACA
  if (unidade === 'tonelada') return (q * 1000) / KG_POR_SACA
  if (unidade === 'saca') return q
  return 0
}

/** Produtos que são ajuste fiscal, não mercadoria (não viram receita). */
function ehAjusteFiscal(produto: string): boolean {
  const s = normalizarRotulo(produto)
  return /CREDITO ICMS|COMPLEMENTO DE (VALOR|ICMS)|TRANSFERENCIA/.test(s)
}

// ---------------------------------------------------------------------------
// CNPJ / intragrupo
// ---------------------------------------------------------------------------

/** Só os dígitos de um CNPJ/CPF. */
export function digitosDoc(doc: unknown): string {
  return String(doc ?? '').replace(/\D/g, '')
}

/** Raiz (8 primeiros dígitos) de um CNPJ; '' quando não for CNPJ de 14 dígitos. */
export function raizCnpj(doc: unknown): string {
  const d = digitosDoc(doc)
  return d.length === 14 ? d.slice(0, 8) : ''
}

/** true quando o destinatário é outra empresa do próprio grupo. */
export function ehIntragrupo(cpfCnpj: unknown, raizes: string[]): boolean {
  const raiz = raizCnpj(cpfCnpj)
  return !!raiz && raizes.includes(raiz)
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

function soData(iso: unknown): string {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

function dataValida(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
}

// ---------------------------------------------------------------------------
// Saída da normalização
// ---------------------------------------------------------------------------

/** Motivo pelo qual um registro cru não virou lançamento. */
export type MotivoDescarte =
  | 'nf_cancelada'
  | 'nf_nao_autorizada'
  | 'nf_remessa'
  | 'nf_transferencia'
  | 'nf_outra_operacao'
  | 'nf_intragrupo'
  | 'nf_ajuste_fiscal'
  | 'data_invalida'
  | 'valor_zero'
  | 'receita_vem_da_nf'
  | 'patrimonial_ou_intragrupo'

export interface ResumoDescarte {
  motivo: MotivoDescarte
  quantidade: number
  valor: number
}

/**
 * Título que nenhuma regra determinística soube classificar — a fila da IA.
 *
 * A chave é o PARCEIRO normalizado, não o centro de custo: quase todo resíduo é
 * "SEM CC", então agrupar por centro de custo juntaria tudo num balde só e não
 * daria para classificar nada. Por parceiro ("SICOOB", "PREFEITURA") o resíduo
 * vira grupos com significado.
 */
export interface ResiduoEnoki {
  /** Chave de classificação: nome do parceiro normalizado (ou a descrição). */
  chave: string
  /** Centro de custo do ERP. 'SEM CC' na maioria; outro valor = centro NOVO no
   *  ERP, que merece virar regra determinística em `centroCusto.ts`. */
  centroCusto: string
  fluxo: 'entrada' | 'saida'
  quantidade: number
  valor: number
  /** Amostra de históricos, para a IA classificar com contexto. */
  amostras: string[]
}

export interface ResultadoEnokiDre {
  lancamentos: LancamentoCanonico[]
  /**
   * Confronto nota × título por contrato (item 3.3). Quantifica o desconto entre
   * o que foi faturado e o que virou recebível — ~9% da receita nos dados reais.
   */
  gapContratos: RelatorioGapContratos
  /** Sacas VENDIDAS por competência ('YYYY-MM') e grão, extraídas das NFs. */
  sacas: Record<string, Partial<Record<Grao, number>>>
  descartes: ResumoDescarte[]
  residuos: ResiduoEnoki[]
}

interface Acumulador {
  lancamentos: LancamentoCanonico[]
  /** Notas de venda com contrato, para o confronto do item 3.3. */
  notasContrato: NotaContrato[]
  /** Títulos de receita com contrato, o outro lado do confronto. */
  titulosContrato: TituloContrato[]
  sacas: Record<string, Partial<Record<Grao, number>>>
  descartes: Map<MotivoDescarte, { quantidade: number; valor: number }>
  residuos: Map<string, ResiduoEnoki>
}

function novoAcumulador(): Acumulador {
  return {
    lancamentos: [],
    notasContrato: [],
    titulosContrato: [],
    sacas: {},
    descartes: new Map(),
    residuos: new Map(),
  }
}

function descartar(acc: Acumulador, motivo: MotivoDescarte, valor: number): void {
  const atual = acc.descartes.get(motivo) ?? { quantidade: 0, valor: 0 }
  atual.quantidade += 1
  atual.valor += Math.abs(valor)
  acc.descartes.set(motivo, atual)
}

function registrarResiduo(
  acc: Acumulador,
  chave: string,
  centroCusto: string,
  fluxo: 'entrada' | 'saida',
  valor: number,
  historico: string,
): void {
  const cc = normalizarRotulo(centroCusto) || SEM_CENTRO_CUSTO
  const id = `${chave}|${fluxo}`
  const atual =
    acc.residuos.get(id) ?? { chave, centroCusto: cc, fluxo, quantidade: 0, valor: 0, amostras: [] }
  atual.quantidade += 1
  atual.valor += Math.abs(valor)
  if (historico && atual.amostras.length < 5 && !atual.amostras.includes(historico)) {
    atual.amostras.push(historico)
  }
  acc.residuos.set(id, atual)
}

/**
 * Chave de classificação de um título sem centro de custo. Prefere o parceiro
 * (estável entre meses); cai na descrição quando o título não tem parceiro.
 */
export function chaveResiduo(parceiro: string, descricao: string): string {
  return normalizarRotulo(parceiro) || normalizarRotulo(descricao).slice(0, 60) || SEM_CENTRO_CUSTO
}

function somarSacas(acc: Acumulador, competencia: string, grao: Grao, sacas: number): void {
  if (!sacas) return
  const mes = (acc.sacas[competencia] ??= {})
  mes[grao] = (mes[grao] ?? 0) + sacas
}

// ---------------------------------------------------------------------------
// Notas fiscais de saída → receita bruta + sacas
// ---------------------------------------------------------------------------

/**
 * O que a nota representa para o DRE.
 *
 * O CFOP manda: "saída, finalidade Normal" inclui remessa para armazém (5905) e
 * transferência (6152), que NÃO são venda. A finalidade só entra como filtro dos
 * ajustes puramente fiscais.
 */
export function naturezaDaNf(nf: any): NaturezaCfop {
  const finalidade = normalizarRotulo(nf?.finalidade)
  if (finalidade === 'AJUSTE') return 'outro'
  const entrada =
    nf?.entrada === true ||
    normalizarRotulo(nf?.tipoOperacao) === 'ENTRADA' ||
    cfopDeEntrada(nf?.cfop)
  return naturezaDeCfop(nf?.cfop, entrada)
}

/** true quando a NF gera receita bruta. */
export function ehVenda(nf: any): boolean {
  return naturezaDaNf(nf) === 'venda'
}

/** true quando a NF foi cancelada (não conta em lugar nenhum). */
export function ehCancelada(nf: any): boolean {
  return normalizarRotulo(nf?.status) === 'CANCELADA'
}

/**
 * true quando a nota está AUTORIZADA e portanto é receita.
 *
 * Não basta "não estar cancelada". Na base real convivem notas em `Digitação`
 * (ainda sendo preenchidas) e notas cujo número foi INUTILIZADO na SEFAZ
 * (`statusNfe = 'Inutil'`) — inclusive uma com `status = 'Finalizada'` e número
 * inutilizado. Somadas, eram R$ 1,49M de receita fantasma em jan–jul, e numa
 * janela curta uma única nota "Gerada" chegou a valer 26% do período.
 *
 * Só o par Finalizada + autorizada conta. O que sobra aparece no diagnóstico
 * como `nf_nao_autorizada`, nunca desaparece em silêncio.
 */
export function ehAutorizada(nf: any): boolean {
  if (normalizarRotulo(nf?.status) !== 'FINALIZADA') return false
  const sefaz = normalizarRotulo(nf?.statusNfe)
  return sefaz !== 'INUTIL' && sefaz !== 'CANCELADA'
}

function processarNfs(nfs: any[], raizes: string[], acc: Acumulador): void {
  for (const nf of nfs ?? []) {
    const valorNf = numeroEnoki(nf?.valorTotalNf)
    if (ehCancelada(nf)) {
      descartar(acc, 'nf_cancelada', valorNf)
      continue
    }
    const natureza = naturezaDaNf(nf)
    // Só o que é venda precisa estar autorizado; remessa/ajuste já sai fora abaixo.
    if (natureza === 'venda' && !ehAutorizada(nf)) {
      descartar(acc, 'nf_nao_autorizada', valorNf)
      continue
    }
    if (natureza === 'remessa' || natureza === 'transferencia' || natureza === 'outro') {
      descartar(
        acc,
        natureza === 'remessa'
          ? 'nf_remessa'
          : natureza === 'transferencia'
            ? 'nf_transferencia'
            : 'nf_outra_operacao',
        valorNf,
      )
      continue
    }
    // Na compra o outro lado é o FORNECEDOR; na venda, o destinatário.
    const contraparteDoc =
      natureza === 'compra' ? nf?.emitenteCpfCnpj : nf?.destinatarioCpfCnpj
    if (ehIntragrupo(contraparteDoc, raizes)) {
      descartar(acc, 'nf_intragrupo', valorNf)
      continue
    }
    const data = soData(nf?.dataEmissao)
    if (!dataValida(data)) {
      descartar(acc, 'data_invalida', valorNf)
      continue
    }
    const competencia = data.slice(0, 7)
    const destinatario = String(
      (natureza === 'compra' ? nf?.emitenteNome : nf?.destinatarioNome) ?? '',
    ).trim()
    const numero = nf?.numeroNf ?? nf?.idNf ?? ''

    // A grade de NF do scraper não traz itens. Sem eles não há cereal nem sacas,
    // mas a RECEITA existe e não pode sumir: vira um item sintético que cai numa
    // conta própria (3.1.15), visível no DRE como "produto não detalhado".
    const itens = (nf?.itens ?? []).length
      ? nf.itens
      : (natureza === 'venda' || natureza === 'compra') &&
          Math.abs(numeroEnoki(nf?.valorTotalNf)) >= 0.005
        ? [{ idItem: 'total', produto: SEM_DETALHE_PRODUTO, valorTotal: nf?.valorTotalNf }]
        : []

    for (const [i, item] of itens.entries()) {
      const produto = String(item?.produto ?? '').trim()
      const valor = numeroEnoki(item?.valorTotal)
      if (ehAjusteFiscal(produto)) {
        descartar(acc, 'nf_ajuste_fiscal', valor)
        continue
      }
      if (Math.abs(valor) < 0.005) {
        descartar(acc, 'valor_zero', 0)
        continue
      }
      const grao = graoDeProduto(produto)
      // Venda: conta do cereal (ou outras receitas, para sucata/equipamento).
      // Devolução de VENDA vira dedução; devolução de COMPRA reduz o CPV do grão.
      const conta =
        produto === SEM_DETALHE_PRODUTO
          ? natureza === 'compra'
            ? CONTA_SEM_DETALHE_COMPRA
            : CONTA_SEM_DETALHE
          : natureza === 'compra'
            ? grao
              ? CONTA_AQUISICAO_GRAO[grao]
              : '4.1.10'
            : natureza === 'devolucao_venda'
            ? '3.2.06'
            : natureza === 'devolucao_compra'
              ? grao
                ? CONTA_AQUISICAO_GRAO[grao]
                : '4.1.10'
              : grao
                ? CONTA_RECEITA_GRAO[grao]
                : '3.4.02'
      // Devolução de compra REDUZ o custo → entra negativa na conta de aquisição.
      const sinal = natureza === 'devolucao_compra' ? -1 : 1
      const rotulo =
        natureza === 'venda'
          ? `NF ${numero}`
          : natureza === 'compra'
            ? `NF entrada ${numero}`
            : `NF ${numero} · devolução`
      const historico = [rotulo, produto, destinatario].filter(Boolean).join(' · ').slice(0, 160)

      acc.lancamentos.push({
        id: `enoki-nf-${nf?.idNf ?? numero}-${item?.idItem ?? i}`,
        data,
        contaSafragold: conta,
        historico,
        valor: sinal * valor,
        centroCusto: grao
          ? `${natureza === 'compra' ? 'COMPRA' : 'RECEITA'} ${grao.toUpperCase()}`
          : undefined,
        origem: 'enoki',
      })

      if (natureza === 'venda') {
        const idContrato = (nf?.contratosVinculados ?? [])[0]?.idContrato
        if (idContrato != null) {
          acc.notasContrato.push({ idContrato, competencia, valor, grao })
        }
      }

      // Sacas: só a VENDA soma; a devolução de venda devolve o volume.
      // Sacas medem o volume VENDIDO; a compra alimenta o estoque, não a venda.
      if (grao && natureza !== 'devolucao_compra' && natureza !== 'compra') {
        const sacas = sacasDeItem(produto, item?.quantidade, item?.valorUnitario)
        somarSacas(acc, competencia, grao, natureza === 'devolucao_venda' ? -sacas : sacas)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Títulos financeiros → custos, despesas, deduções, investimentos
// ---------------------------------------------------------------------------

function processarTitulos(
  titulos: any[],
  fluxo: 'entrada' | 'saida',
  acc: Acumulador,
  regras: Record<string, string>,
): void {
  for (const [i, t] of (titulos ?? []).entries()) {
    const valorBruto = numeroEnoki(t?.valor)
    // COMPETÊNCIA = data do lançamento (fato gerador), NÃO a da quitação.
    const data = soData(t?.dataLancamento) || soData(t?.dataVencimento)
    if (!dataValida(data)) {
      descartar(acc, 'data_invalida', valorBruto)
      continue
    }
    const valor = Math.abs(valorBruto)
    if (valor < 0.005) {
      descartar(acc, 'valor_zero', 0)
      continue
    }

    const centroCusto = String(t?.centroCusto ?? '').trim()
    const parceiro = String(t?.parceiroNome ?? '').trim()
    const descricao = String(t?.descricao ?? '').trim()
    const historico = [parceiro, descricao].filter(Boolean).join(' · ').slice(0, 160)

    // O título de receita de grão não vira lançamento (a receita vem da nota),
    // mas o valor dele é justamente o outro lado do confronto do item 3.3.
    if (fluxo === 'entrada' && t?.idContrato != null && /RECEITA/.test(normalizarRotulo(centroCusto))) {
      acc.titulosContrato.push({
        idContrato: t.idContrato,
        competencia: data.slice(0, 7),
        valor,
      })
    }

    const destino = destinoDeCentroCusto(centroCusto, fluxo)
    let conta: string
    let sinal: 1 | -1 = 1

    if (destino) {
      if (destino.ignorar) {
        descartar(acc, (destino.motivo as MotivoDescarte) ?? 'patrimonial_ou_intragrupo', valor)
        continue
      }
      conta = destino.conta
      sinal = destino.sinal
    } else {
      // Sem regra determinística: cai na regra APRENDIDA (item 1.4). Sem ela,
      // vira resíduo explícito — nunca some do relatório.
      const chave = chaveResiduo(parceiro, descricao)
      const aprendida = regras[chave]
      if (!aprendida) {
        registrarResiduo(acc, chave, centroCusto, fluxo, valor, historico || centroCusto)
        continue
      }
      conta = aprendida
    }

    acc.lancamentos.push({
      id: `enoki-${fluxo === 'entrada' ? 'r' : 'p'}-${t?.idItemLancamento ?? t?.idLancamento ?? i}`,
      data,
      contaSafragold: conta,
      historico,
      valor: sinal * valor,
      centroCusto: centroCusto || undefined,
      origem: 'enoki',
    })
  }
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export interface EntradaEnokiDre {
  /** Notas fiscais de saída (endpoint `NfSaida`). */
  nfs?: any[]
  /** Títulos a pagar (endpoint `LancamentosFinanceirosPagar`). */
  pagar?: any[]
  /** Títulos a receber (endpoint `LancamentosFinanceiros`). */
  receber?: any[]
}

/**
 * Converte o pacote cru da API Enoki em lançamentos por COMPETÊNCIA, prontos
 * para `montarDre`. Mesma entrada → mesma saída; nenhuma chamada de rede aqui
 * (a paginação/HTTP fica em `api/enoki-dre.ts`).
 */
export function normalizarEnokiDre(
  entrada: EntradaEnokiDre,
  config: ConfigEnokiDre = {},
): ResultadoEnokiDre {
  const raizes = config.raizesGrupo ?? RAIZES_CNPJ_GRUPO
  const acc = novoAcumulador()

  const regras = config.regras ?? {}
  processarNfs(entrada.nfs ?? [], raizes, acc)
  processarTitulos(entrada.pagar ?? [], 'saida', acc, regras)
  processarTitulos(entrada.receber ?? [], 'entrada', acc, regras)

  // Dedup por id (a paginação da API pode repetir registros na borda das janelas).
  const vistos = new Set<string>()
  const lancamentos = acc.lancamentos.filter((l) => {
    if (vistos.has(l.id)) return false
    vistos.add(l.id)
    return true
  })

  // Arredonda as sacas para 2 casas (a divisão por 60 gera dízima).
  const sacas: Record<string, Partial<Record<Grao, number>>> = {}
  for (const [competencia, porGrao] of Object.entries(acc.sacas)) {
    const mes: Partial<Record<Grao, number>> = {}
    for (const g of GRAOS) {
      const v = porGrao[g]
      if (v) mes[g] = Math.round(v * 100) / 100
    }
    if (Object.keys(mes).length) sacas[competencia] = mes
  }

  const descartes = [...acc.descartes.entries()]
    .map(([motivo, v]) => ({ motivo, quantidade: v.quantidade, valor: Math.round(v.valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor)

  const residuos = [...acc.residuos.values()]
    .map((r) => ({ ...r, valor: Math.round(r.valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor)

  return {
    lancamentos,
    sacas,
    descartes,
    residuos,
    gapContratos: analisarGapContratos(acc.notasContrato, acc.titulosContrato),
  }
}

/** Competências ('YYYY-MM') presentes num conjunto de lançamentos, ordenadas. */
export function competenciasDeLancamentos(lancamentos: LancamentoCanonico[]): string[] {
  return [...new Set(lancamentos.map((l) => l.data.slice(0, 7)))].sort()
}
