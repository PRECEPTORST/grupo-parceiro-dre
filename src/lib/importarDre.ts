// Importação de uma DRE GERENCIAL (grade conta × mês) — parte DETERMINÍSTICA.
//
// Recebe a matriz de células da planilha (linhas × colunas, como o SheetJS
// devolve com header:1) e extrai:
//   - as COLUNAS de mês (competências 'YYYY-MM'), lendo o cabeçalho;
//   - as LINHAS de conta (rótulo + valor por mês), já sinalizando quais parecem
//     SUBTOTAL (receita líquida, custo total, lucro bruto, margem, acumulado…)
//     ou a linha de RESULTADO (lucro/prejuízo) — para o passo seguinte ignorá-las
//     ou usá-las como "resultado declarado".
//
// A classificação de cada conta na linha do DRE NÃO acontece aqui — é da IA
// (memorizada) + revisão humana. Aqui é só estrutura: mesma entrada → mesma saída.

import { parseValorBR } from './importar'

export type CelulaMatriz = string | number | boolean | null | undefined
export type Matriz = CelulaMatriz[][]

const MESES_PT: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Lê um cabeçalho de mês e devolve a competência 'YYYY-MM', ou null.
 * Aceita "JANEIRO 2026", "jan/26", "01/2026", "2026-01", "Jan-2026".
 */
export function parseCompetenciaCabecalho(valor: CelulaMatriz): string | null {
  if (valor == null) return null
  const bruto = semAcento(String(valor).trim().toLowerCase())
  if (!bruto) return null

  // 2026-01
  let m = bruto.match(/\b(20\d{2})[-/.](\d{1,2})\b/)
  if (m) {
    const mes = Number(m[2])
    if (mes >= 1 && mes <= 12) return `${m[1]}-${String(mes).padStart(2, '0')}`
  }
  // 01/2026
  m = bruto.match(/\b(\d{1,2})[-/.](20\d{2})\b/)
  if (m) {
    const mes = Number(m[1])
    if (mes >= 1 && mes <= 12) return `${m[2]}-${String(mes).padStart(2, '0')}`
  }
  // nome do mês + ano (2026 ou 26). Ex.: "janeiro 2026", "jan/26".
  m = bruto.match(/\b([a-z]{3,})\b[^0-9]*\b(\d{2,4})\b/)
  if (m && MESES_PT[m[1]]) {
    const mes = MESES_PT[m[1]]
    let ano = Number(m[2])
    if (ano < 100) ano += 2000
    if (ano >= 2000 && ano < 2100) return `${ano}-${String(mes).padStart(2, '0')}`
  }
  return null
}

/** Rótulos que são SUBTOTAL/percentual/seção — não são contas a lançar. */
const RE_SUBTOTAL =
  /(receita\s+liquida|custo\s+total|despesa\s+total|lucro\s+bruto|margem|\broe\b|acumulad|investiment|resultado\s*\(|===)/i
/** Rótulos que são a LINHA DE RESULTADO (candidata a "resultado declarado"). */
const RE_RESULTADO = /(lucro\s*\/?\s*prejuizo|resultado\s+liquido|resultado\s+do\s+periodo|lucro\s+liquido)/i

export interface LinhaImportada {
  /** Rótulo/descrição da conta, como veio na planilha. */
  label: string
  /** Valor por competência ('YYYY-MM' → número, com o sinal original). */
  valores: Record<string, number>
  /** Soma dos |valores| (magnitude, para exibir e ordenar). */
  total: number
  /** true quando o rótulo parece um subtotal/percentual/seção (não é conta). */
  ehSubtotal: boolean
  /** true quando o rótulo parece a linha de resultado (lucro/prejuízo). */
  ehResultado: boolean
}

export interface AnaliseImport {
  /** Colunas de mês detectadas, em ordem. */
  meses: { coluna: number; competencia: string }[]
  /** Linhas com rótulo e ao menos um valor numérico. */
  linhas: LinhaImportada[]
  /** Linha do cabeçalho de meses (índice na matriz), -1 se não achou. */
  linhaCabecalho: number
}

function toNumero(v: CelulaMatriz): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') return parseValorBR(v)
  return null
}

function primeiroRotulo(linha: CelulaMatriz[], colsMes: Set<number>): string {
  for (let c = 0; c < linha.length; c++) {
    if (colsMes.has(c)) continue
    const v = linha[c]
    if (v == null) continue
    if (typeof v === 'number') continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

/**
 * Analisa a matriz da planilha. Escolhe como cabeçalho a linha que mais colunas
 * de mês reconhece; abaixo dela, cada linha com rótulo + ao menos um número vira
 * uma conta candidata.
 */
export function analisarMatriz(matriz: Matriz): AnaliseImport {
  // 1) Acha a linha de cabeçalho: a que reconhece mais competências.
  let linhaCabecalho = -1
  let melhor: { coluna: number; competencia: string }[] = []
  for (let r = 0; r < matriz.length; r++) {
    const achadas: { coluna: number; competencia: string }[] = []
    const linha = matriz[r] ?? []
    for (let c = 0; c < linha.length; c++) {
      const comp = parseCompetenciaCabecalho(linha[c])
      if (comp) achadas.push({ coluna: c, competencia: comp })
    }
    if (achadas.length > melhor.length) {
      melhor = achadas
      linhaCabecalho = r
    }
  }
  // Dedup por competência (mantém a 1ª coluna de cada mês).
  const vistos = new Set<string>()
  const meses = melhor.filter((m) => (vistos.has(m.competencia) ? false : (vistos.add(m.competencia), true)))
  const colsMes = new Set(meses.map((m) => m.coluna))

  // 2) Linhas de dados abaixo do cabeçalho.
  const linhas: LinhaImportada[] = []
  for (let r = linhaCabecalho + 1; r < matriz.length; r++) {
    const linha = matriz[r] ?? []
    const label = primeiroRotulo(linha, colsMes)
    if (!label) continue
    const valores: Record<string, number> = {}
    let total = 0
    let temValor = false
    for (const m of meses) {
      const n = toNumero(linha[m.coluna])
      if (n == null || n === 0) continue
      valores[m.competencia] = n
      total += Math.abs(n)
      temValor = true
    }
    if (!temValor) continue
    const semAc = semAcento(label)
    linhas.push({
      label,
      valores,
      total,
      ehResultado: RE_RESULTADO.test(semAc),
      ehSubtotal: RE_SUBTOTAL.test(semAc) || RE_RESULTADO.test(semAc),
    })
  }

  return { meses, linhas, linhaCabecalho }
}

/** Último dia do mês da competência 'YYYY-MM' como ISO 'YYYY-MM-DD'. */
export function ultimoDiaDoMes(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number)
  const dia = new Date(ano, mes, 0).getDate() // dia 0 do mês seguinte = último do atual
  return `${competencia}-${String(dia).padStart(2, '0')}`
}

/** Chave estável de uma conta a partir do rótulo (para memorizar a classificação). */
export function chaveConta(label: string): string {
  return label.trim().replace(/\s+/g, ' ')
}
