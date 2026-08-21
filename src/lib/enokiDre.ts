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

/** Unidade em que o ERP registra a quantidade de um produto. */
export type UnidadeProduto = 'kg' | 'saca' | 'unidade'

const PRODUTOS_GRAO: { re: RegExp; grao: Grao; unidade: UnidadeProduto }[] = [
  // Tolerantes a typos de cadastro: "GRAOS"/"GRÃOS"/"GÃOS" e acentuação livre.
  { re: /\bSOJA\b/, grao: 'soja', unidade: 'kg' },
  { re: /\bMILHO\b/, grao: 'milho', unidade: 'kg' },
  { re: /\bSORGO\b/, grao: 'sorgo', unidade: 'kg' },
  { re: /\bCAFE\b/, grao: 'cafe', unidade: 'saca' },
]

/** Conta de RECEITA (3.1.0x) de cada grão — espelha `GRAO_DE_CONTA`. */
export const CONTA_RECEITA_GRAO: Record<Grao, string> = {
  soja: '3.1.01',
  milho: '3.1.02',
  sorgo: '3.1.03',
  cafe: '3.1.05',
}

/** Grão do produto da NF (null quando não é grão: toner, impressora, ICMS…). */
export function graoDeProduto(produto: string): Grao | null {
  const s = normalizarRotulo(produto)
  for (const p of PRODUTOS_GRAO) if (p.re.test(s)) return p.grao
  return null
}

/** Unidade em que a quantidade do produto está expressa. */
export function unidadeDeProduto(produto: string): UnidadeProduto {
  const s = normalizarRotulo(produto)
  for (const p of PRODUTOS_GRAO) if (p.re.test(s)) return p.unidade
  return 'unidade'
}

/**
 * Converte a quantidade da NF em SACAS. Soja/milho/sorgo vêm em quilos (÷60);
 * café já vem em sacas. Produto que não é grão não tem saca (0).
 */
export function sacasDeItem(produto: string, quantidade: unknown): number {
  const q = numeroEnoki(quantidade)
  if (!Number.isFinite(q) || q <= 0) return 0
  const unidade = unidadeDeProduto(produto)
  if (unidade === 'kg') return q / KG_POR_SACA
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
  | 'nf_nao_e_venda'
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
  /** Sacas VENDIDAS por competência ('YYYY-MM') e grão, extraídas das NFs. */
  sacas: Record<string, Partial<Record<Grao, number>>>
  descartes: ResumoDescarte[]
  residuos: ResiduoEnoki[]
}

interface Acumulador {
  lancamentos: LancamentoCanonico[]
  sacas: Record<string, Partial<Record<Grao, number>>>
  descartes: Map<MotivoDescarte, { quantidade: number; valor: number }>
  residuos: Map<string, ResiduoEnoki>
}

function novoAcumulador(): Acumulador {
  return { lancamentos: [], sacas: {}, descartes: new Map(), residuos: new Map() }
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

/** true quando a NF representa uma VENDA que gera receita bruta. */
export function ehVenda(nf: any): boolean {
  const operacao = normalizarRotulo(nf?.tipoOperacao)
  const finalidade = normalizarRotulo(nf?.finalidade)
  return operacao === 'SAIDA' && (finalidade === 'NORMAL' || finalidade === 'COMPLEMENTAR')
}

/** true quando a NF foi cancelada (não conta em lugar nenhum). */
export function ehCancelada(nf: any): boolean {
  return normalizarRotulo(nf?.status) === 'CANCELADA'
}

function processarNfs(nfs: any[], raizes: string[], acc: Acumulador): void {
  for (const nf of nfs ?? []) {
    const valorNf = numeroEnoki(nf?.valorTotalNf)
    if (ehCancelada(nf)) {
      descartar(acc, 'nf_cancelada', valorNf)
      continue
    }
    if (!ehVenda(nf)) {
      descartar(acc, 'nf_nao_e_venda', valorNf)
      continue
    }
    if (ehIntragrupo(nf?.destinatarioCpfCnpj, raizes)) {
      descartar(acc, 'nf_intragrupo', valorNf)
      continue
    }
    const data = soData(nf?.dataEmissao)
    if (!dataValida(data)) {
      descartar(acc, 'data_invalida', valorNf)
      continue
    }
    const competencia = data.slice(0, 7)
    const destinatario = String(nf?.destinatarioNome ?? '').trim()
    const numero = nf?.numeroNf ?? nf?.idNf ?? ''

    for (const [i, item] of (nf?.itens ?? []).entries()) {
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
      // Grão → conta de venda do cereal; o resto (sucata, equipamento) → outras receitas.
      const conta = grao ? CONTA_RECEITA_GRAO[grao] : '3.4.02'
      const historico = [`NF ${numero}`, produto, destinatario].filter(Boolean).join(' · ').slice(0, 160)

      acc.lancamentos.push({
        id: `enoki-nf-${nf?.idNf ?? numero}-${item?.idItem ?? i}`,
        data,
        contaSafragold: conta,
        historico,
        valor,
        centroCusto: grao ? `RECEITA ${grao.toUpperCase()}` : undefined,
        origem: 'enoki',
      })

      if (grao) somarSacas(acc, competencia, grao, sacasDeItem(produto, item?.quantidade))
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

  return { lancamentos, sacas, descartes, residuos }
}

/** Competências ('YYYY-MM') presentes num conjunto de lançamentos, ordenadas. */
export function competenciasDeLancamentos(lancamentos: LancamentoCanonico[]): string[] {
  return [...new Set(lancamentos.map((l) => l.data.slice(0, 7)))].sort()
}
