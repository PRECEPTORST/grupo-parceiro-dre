// Enxugamento dos registros crus da Enoki antes de trafegarem para o front.
//
// Fica em `lib/` (e não em `api/`) porque precisa ser TESTÁVEL: um erro aqui é
// invisível em teste de unidade do normalizador e catastrófico em produção.
//
// POR QUE DENYLIST E NÃO ALLOWLIST
// --------------------------------
// A primeira versão listava os campos que PASSAM. Quando a classificação por
// CFOP foi criada depois, ninguém lembrou de acrescentar `cfop` à lista — o
// endpoint passou a entregar notas sem CFOP, o normalizador classificou todas
// como "outra operação" e a RECEITA INTEIRA sumiu do DRE em produção, sem erro
// nenhum. Testes locais não pegaram porque exercitam o normalizador direto, com
// fixtures completas.
//
// Com denylist o padrão se inverte: um campo novo que o normalizador passe a
// usar chega sozinho. Só o que é comprovadamente pesado e inútil é removido —
// e isso muda muito devagar.

/** Campos de NF que são grandes e não alimentam nada no DRE. */
const NF_DESCARTAR = new Set([
  'chaveNfe', // 44 caracteres por nota
  'chavesNfReferenciadas', // array de chaves de 44 caracteres
])

/** Campos de item de NF que interessam (aqui a allowlist é segura: são 4 e o
 *  array de itens é o grosso do payload). */
const ITEM_MANTER = ['idItem', 'idProduto', 'produto', 'quantidade', 'valorUnitario', 'valorTotal']

/** Campos de título que são grandes e não alimentam nada no DRE. */
const TITULO_DESCARTAR = new Set(['boletosNossoNumero'])

function semCampos(obj: any, descartar: Set<string>): any {
  const out: any = {}
  for (const chave of Object.keys(obj ?? {})) {
    if (!descartar.has(chave)) out[chave] = obj[chave]
  }
  return out
}

/** Enxuga uma nota fiscal preservando tudo que o DRE pode precisar. */
export function enxugarNf(nf: any): any {
  const out = semCampos(nf, NF_DESCARTAR)
  out.itens = (nf?.itens ?? []).map((i: any) => {
    const item: any = {}
    for (const chave of ITEM_MANTER) if (i?.[chave] !== undefined) item[chave] = i[chave]
    return item
  })
  return out
}

/** Enxuga um título financeiro preservando tudo que o DRE pode precisar. */
export function enxugarTitulo(t: any): any {
  return semCampos(t, TITULO_DESCARTAR)
}

/**
 * Campos que a normalização (`src/lib/enokiDre.ts`) LÊ de cada registro.
 * Existe para o teste provar que o enxugamento não come nenhum deles — é o
 * contrato entre o transporte e a regra de negócio.
 */
export const CAMPOS_NF_USADOS = [
  'idNf',
  'numeroNf',
  'dataEmissao',
  'status',
  'tipoOperacao',
  'finalidade',
  'cfop',
  'valorTotalNf',
  'destinatarioNome',
  'destinatarioCpfCnpj',
  // Nota de ENTRADA (a compra, que é o CPV): a contraparte é o fornecedor, e
  // `entrada` é o que faz o CFOP 1102 ser lido como compra e não como venda.
  'entrada',
  'statusNfe',
  'emitenteNome',
  'emitenteCpfCnpj',
  'contratosVinculados',
  'itens',
] as const

export const CAMPOS_ITEM_USADOS = ['idItem', 'produto', 'quantidade', 'valorUnitario', 'valorTotal'] as const

export const CAMPOS_TITULO_USADOS = [
  'idItemLancamento',
  'idLancamento',
  'dataLancamento',
  'dataVencimento',
  'valor',
  'parceiroNome',
  'descricao',
  'centroCusto',
  'idContrato',
] as const
