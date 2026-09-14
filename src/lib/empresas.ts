/**
 * QUAIS ESTABELECIMENTOS ENTRAM NESTE DRE.
 *
 * A API devolve cinco empresas. Três delas dividem a mesma razão social —
 * PARCEIRO DO GRAO COMERCIO IMP. E EXP. DE CAFE E CEREAIS LTDA, CNPJ raiz
 * 30798330 — e são estabelecimentos diferentes do mesmo grupo:
 *
 *   1  FILIAL MG   30798330/0002-16   cereais
 *   2  MATRIZ      30798330/0001-35   CAFÉ
 *   3  FILIAL SP   30798330/0004-88   cereais
 *   4  AGRO BUSINESS LTDA             47591700/0001-61   (fora da carga)
 *   5  TOMAZ & PAULA CORRETAGEM       22271113/0001-64   (fora da carga)
 *
 * A MATRIZ É A OPERAÇÃO DE CAFÉ, e ela não entra aqui.
 *
 * O número é inequívoco: em 20 meses a empresa 2 movimentou R$ 394,7 milhões em
 * itens, dos quais R$ 383,4 milhões são café — 97,1%. As empresas 1 e 3 têm
 * ZERO café em grãos. São dois negócios, com CNPJ próprio cada um, e somá-los
 * num DRE só produz uma entidade que não existe.
 *
 * Estava tudo junto, e o estrago era grande: o café da matriz entrava na cadeia
 * de estoque do grupo, ficava negativo já em janeiro/2025 e derrubava o custo
 * médio (chegou a -R$ 13.759/saca). A recusa de publicar ajuste, que parecia
 * excesso de zelo, estava apontando para isto.
 *
 * A planilha do cliente ("DRE ACUMULADO _CEREAIS") é a FILIAL MG sozinha. Se o
 * DRE oficial tiver que bater com ela, a filial SP também sai — é decisão da
 * diretoria, e está na tela de divergências como `escopo-empresas`.
 */
export const EMPRESAS_DO_DRE = new Set([1, 3])

/** A matriz, cuja operação é café — mantida fora. Ver acima. */
export const EMPRESA_CAFE = 2

/** A filial MG, escopo da planilha do cliente. */
export const EMPRESA_DA_PLANILHA = 1

export function noDre(idEmpresa: unknown): boolean {
  return EMPRESAS_DO_DRE.has(Number(idEmpresa))
}
