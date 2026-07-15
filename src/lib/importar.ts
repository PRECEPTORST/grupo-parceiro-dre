// Importação determinística de orçamento a partir de planilha colada (Excel dá
// TSV) ou CSV. Cada linha vira (chave, valor); a chave casa com uma conta pelo
// CÓDIGO ou pela DESCRIÇÃO. O que não casar é reportado, nunca adivinhado — o
// caminho "documento (IA)" é que lida com texto bagunçado.

/** Interpreta um número no padrão brasileiro ou inglês. Retorna null se não for número. */
export function parseValorBR(raw: string): number | null {
  let t = raw.replace(/[R$\s ]/gi, '').trim()
  if (!t) return null
  const temVirgula = t.includes(',')
  const temPonto = t.includes('.')
  if (temVirgula && temPonto) {
    // O último separador é o decimal.
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.')
    else t = t.replace(/,/g, '')
  } else if (temVirgula) {
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (temPonto) {
    // "1.240" (milhar do Excel) vira 1240; "1240.50" (decimal) fica.
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export interface ContaConhecida {
  conta: string
  descricao: string
}

export interface ResultadoImport {
  valores: Record<string, number>
  reconhecidas: number
  ignoradas: string[]
}

/** Quebra a linha em células — prioriza TAB e ';' (não conflitam com decimal). */
function celulas(linha: string): string[] {
  const sep = linha.includes('\t') ? '\t' : linha.includes(';') ? ';' : null
  const cels = sep ? linha.split(sep) : linha.split(/\s{2,}|\s(?=R?\$?\s*-?\d)/)
  return cels.map((s) => s.trim()).filter(Boolean)
}

/**
 * Faz o parse do texto colado/CSV e mapeia para valores por conta.
 * `contasConhecidas` vem do plano de contas classificado.
 */
export function parsePlanilha(texto: string, contasConhecidas: ContaConhecida[]): ResultadoImport {
  const porCodigo = new Map<string, string>()
  const porDescricao = new Map<string, string>()
  for (const c of contasConhecidas) {
    porCodigo.set(c.conta.toLowerCase(), c.conta)
    if (c.descricao) porDescricao.set(c.descricao.trim().toLowerCase(), c.conta)
  }

  const valores: Record<string, number> = {}
  const ignoradas: string[] = []

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim()
    if (!linha) continue
    const cels = celulas(linha)
    if (cels.length < 2) {
      ignoradas.push(linha)
      continue
    }
    const chave = cels[0].toLowerCase()
    const valor = parseValorBR(cels[cels.length - 1])
    const conta =
      porCodigo.get(chave) ??
      porDescricao.get(chave) ??
      [...porDescricao.entries()].find(([desc]) => desc && chave.includes(desc))?.[1]
    if (conta && valor != null) valores[conta] = Math.abs(valor)
    else ignoradas.push(linha)
  }

  return { valores, reconhecidas: Object.keys(valores).length, ignoradas }
}
