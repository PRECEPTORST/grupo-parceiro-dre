// Camada de CONFIABILIDADE / MATERIALIDADE — DETERMINÍSTICA. Zero IA.
//
// Analisa os lançamentos de uma competência e aponta o que pode estar distorcendo
// o DRE: contas fora do resultado, classificações duvidosas, valores atípicos,
// duplicidades, sumiços e datas estranhas. Cada achado é pesado pela MATERIALIDADE
// (piso fixo em R$, default R$ 1.000) e pela relevância contra o RESULTADO LÍQUIDO
// — porque em comércio de grãos a receita é alta e a margem é fina, então o corte
// tem que olhar o que mexe no resultado, não o tamanho da receita.
//
// Mesma entrada + mesmas opções → mesma saída. A IA (fase 2) só EXPLICA os achados.
import {
  LIMIAR_REVISAO,
  META_LINHAS,
  type LinhaDRE,
  type LancamentoCanonico,
  type Classificacao,
  type MapaClassificacao,
} from './tipos'
import { competenciaDe, montarDre } from './dre'

export const PISO_MATERIALIDADE_PADRAO = 1000

export type TipoAchado =
  | 'nao_classificada'
  | 'baixa_confianca'
  | 'variacao_atipica'
  | 'duplicidade'
  | 'sem_movimento'
  | 'data_futura'

export type Severidade = 'alta' | 'media' | 'baixa'

export interface AchadoConfiabilidade {
  id: string
  tipo: TipoAchado
  severidade: Severidade
  /** Conta afetada (quando aplicável). */
  conta?: string
  descricaoConta?: string
  linha?: LinhaDRE
  /** Valor em reais envolvido no achado (magnitude). */
  valor: number
  titulo: string
  detalhe: string
  /** Ação sugerida ao Controler/sócio. */
  acao: string
  /** true quando o valor passa do piso de materialidade. */
  material: boolean
}

export interface RelatorioConfiabilidade {
  competencia: string
  achados: AchadoConfiabilidade[]
  /** 0..100 — quanto do movimento do mês está classificado com confiança. */
  indiceConfianca: number
  /** Soma de |valor| de todos os lançamentos do mês. */
  totalMovimento: number
  /** Valor ainda "em revisão" (não classificado + baixa confiança). */
  valorEmRevisao: number
  /** Quantos achados são materiais (>= piso). */
  materiais: number
  pisoMaterialidade: number
}

export interface OpcoesConfiabilidade {
  /** Piso de materialidade em R$ para custos/despesas (default R$ 1.000). */
  pisoMaterialidade?: number
  /** Corte de materialidade em % para receitas, sobre a própria conta (default 3). */
  pctReceita?: number
  /** Meses de histórico usados para média/variação (default 6). */
  mesesHistorico?: number
  /** Variação mínima vs. média p/ CUSTOS sinalizarem (fração; default 0.6 = 60%). */
  limiarVariacao?: number
  /** "Hoje" em ISO 'YYYY-MM-DD' (para datas futuras). Default: data atual. */
  hoje?: string
}

function arred(v: number): number {
  return Math.round(v * 100) / 100
}
function media(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0
}

/** Realizado por conta numa competência + descrição representativa e nº de lançamentos. */
function agregarConta(lancamentos: LancamentoCanonico[], competencia: string) {
  const valor: Record<string, number> = {}
  const descricao: Record<string, string> = {}
  for (const l of lancamentos) {
    if (competenciaDe(l.data) !== competencia) continue
    valor[l.contaSafragold] = (valor[l.contaSafragold] ?? 0) + l.valor
    if (!descricao[l.contaSafragold] && l.historico) descricao[l.contaSafragold] = l.historico
  }
  return { valor, descricao }
}

/**
 * Analisa a confiabilidade da competência. `mapa` deve ser o mapa EFETIVO
 * (plano de contas + classificações do usuário).
 */
export function analisarConfiabilidade(
  competencia: string,
  lancamentos: LancamentoCanonico[],
  classificacoes: Classificacao[],
  mapa: MapaClassificacao,
  opcoes: OpcoesConfiabilidade = {},
): RelatorioConfiabilidade {
  const piso = opcoes.pisoMaterialidade ?? PISO_MATERIALIDADE_PADRAO
  const pctReceita = opcoes.pctReceita ?? 3
  const mesesHist = Math.max(1, opcoes.mesesHistorico ?? 6)
  const limiarVar = opcoes.limiarVariacao ?? 0.6
  const hoje = opcoes.hoje ?? new Date().toISOString().slice(0, 10)

  const dre = montarDre(competencia, lancamentos, mapa)
  const resultado = Math.abs(dre.realizado.resultadoLiquido)

  const { valor: realComp, descricao: descComp } = agregarConta(lancamentos, competencia)
  const confiancaPorConta = new Map(classificacoes.map((c) => [c.contaSafragold, c.confianca]))

  // Histórico por conta: últimas `mesesHist` competências antes da atual.
  const histPorConta = new Map<string, Map<string, number>>()
  for (const l of lancamentos) {
    const comp = competenciaDe(l.data)
    if (comp >= competencia) continue
    let m = histPorConta.get(l.contaSafragold)
    if (!m) {
      m = new Map()
      histPorConta.set(l.contaSafragold, m)
    }
    m.set(comp, (m.get(comp) ?? 0) + l.valor)
  }
  const serieHist = (conta: string): number[] => {
    const m = histPorConta.get(conta)
    if (!m) return []
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-mesesHist)
      .map(([, v]) => v)
  }

  const ehReceita = (linha?: LinhaDRE) => !!linha && META_LINHAS[linha].sinal === 1
  // Materialidade de DUAS TRILHAS: receitas por % da própria conta (base),
  // custos/despesas/deduções/impostos por piso absoluto em R$.
  const limiarMaterial = (linha?: LinhaDRE, base?: number) =>
    ehReceita(linha) && base && base > 0 ? (pctReceita / 100) * base : piso

  const achados: AchadoConfiabilidade[] = []
  const push = (a: Omit<AchadoConfiabilidade, 'severidade' | 'material'>, base?: number) => {
    const material = a.valor >= limiarMaterial(a.linha, base)
    const severidade: Severidade = !material
      ? 'baixa'
      : resultado > 0 && a.valor / resultado >= 0.1
        ? 'alta'
        : 'media'
    achados.push({ ...a, severidade, material })
  }

  let valorEmRevisao = 0

  // 1) Contas com movimento fora do DRE (sem classificação).
  for (const conta of Object.keys(realComp)) {
    if (mapa[conta]) continue
    const valor = arred(realComp[conta])
    valorEmRevisao += valor
    push({
      id: `nc-${conta}`,
      tipo: 'nao_classificada',
      conta,
      descricaoConta: descComp[conta],
      valor,
      titulo: `Conta ${conta} sem classificação`,
      detalhe: `Movimentou ${brl(valor)} no mês mas não está em nenhuma linha do DRE — fora do resultado.`,
      acao: 'Classificar a conta em Lançamentos.',
    })
  }

  // 2) Classificações de baixa confiança (fila de revisão do Controler).
  for (const conta of Object.keys(realComp)) {
    const conf = confiancaPorConta.get(conta)
    if (conf == null || conf >= LIMIAR_REVISAO) continue
    const valor = arred(realComp[conta])
    valorEmRevisao += valor
    push({
      id: `bc-${conta}`,
      tipo: 'baixa_confianca',
      conta,
      descricaoConta: descComp[conta],
      linha: mapa[conta],
      valor,
      titulo: `Classificação incerta na conta ${conta}`,
      detalhe: `Classificada com confiança ${(conf * 100).toFixed(0)}% (abaixo de ${(LIMIAR_REVISAO * 100).toFixed(0)}%). ${brl(valor)} no mês dependem dessa classificação.`,
      acao: 'Confirmar ou reclassificar a conta.',
    }, realComp[conta])
  }

  // 3) Variação atípica vs. média histórica (salto/queda de valor).
  for (const conta of Object.keys(realComp)) {
    const hist = serieHist(conta)
    if (hist.length < 2) continue
    const med = media(hist)
    if (med <= 0) continue
    const atual = realComp[conta]
    const desvio = atual - med
    // Receita dispara a partir de `pctReceita`% da média; custos/despesas usam
    // o relativo (limiarVar) com piso absoluto em R$.
    const limiarVarConta = ehReceita(mapa[conta])
      ? (pctReceita / 100) * med
      : Math.max(piso, limiarVar * med)
    if (Math.abs(desvio) < limiarVarConta) continue
    const pct = (desvio / med) * 100
    push({
      id: `va-${conta}`,
      tipo: 'variacao_atipica',
      conta,
      descricaoConta: descComp[conta],
      linha: mapa[conta],
      valor: arred(Math.abs(desvio)),
      titulo: `Variação atípica na conta ${conta}`,
      detalhe: `Realizou ${brl(atual)} — ${pct >= 0 ? 'acima' : 'abaixo'} da média dos últimos meses (${brl(med)}), variação de ${pct.toFixed(0)}%.`,
      acao: 'Conferir se o valor do mês está correto.',
    }, med)
  }

  // 4) Possível duplicidade: mesma conta + valor + data.
  const chaveDup = new Map<string, { conta: string; valor: number; data: string; n: number }>()
  for (const l of lancamentos) {
    if (competenciaDe(l.data) !== competencia) continue
    const k = `${l.contaSafragold}|${l.valor}|${l.data}`
    const e = chaveDup.get(k)
    if (e) e.n++
    else chaveDup.set(k, { conta: l.contaSafragold, valor: l.valor, data: l.data, n: 1 })
  }
  for (const e of chaveDup.values()) {
    if (e.n < 2) continue
    const valor = arred(e.valor * e.n)
    push({
      id: `dup-${e.conta}-${e.data}-${e.valor}`,
      tipo: 'duplicidade',
      conta: e.conta,
      descricaoConta: descComp[e.conta],
      linha: mapa[e.conta],
      valor,
      titulo: `Possível duplicidade na conta ${e.conta}`,
      detalhe: `${e.n} lançamentos idênticos de ${brl(e.valor)} em ${dataBR(e.data)} — pode ser dupla contabilização.`,
      acao: 'Verificar se os lançamentos repetidos são legítimos.',
    }, realComp[e.conta])
  }

  // 5) Sumiço: conta com histórico regular e material, sem movimento no mês.
  for (const [conta, m] of histPorConta) {
    if (realComp[conta]) continue
    const hist = serieHist(conta)
    if (hist.length < Math.min(3, mesesHist)) continue
    const med = media(hist)
    if (med < piso) continue
    push({
      id: `sm-${conta}`,
      tipo: 'sem_movimento',
      conta,
      linha: mapa[conta],
      valor: arred(med),
      titulo: `Conta ${conta} sem movimento este mês`,
      detalhe: `Tinha média de ${brl(med)}/mês no histórico e zerou em ${competencia} — pode faltar lançamento.`,
      acao: 'Confirmar se realmente não houve movimento.',
    }, med)
    void m
  }

  // 6) Lançamentos com data futura.
  for (const l of lancamentos) {
    if (competenciaDe(l.data) !== competencia) continue
    if (l.data <= hoje) continue
    push({
      id: `df-${l.id}`,
      tipo: 'data_futura',
      conta: l.contaSafragold,
      descricaoConta: l.historico,
      linha: mapa[l.contaSafragold],
      valor: arred(l.valor),
      titulo: `Lançamento com data futura`,
      detalhe: `${brl(l.valor)} na conta ${l.contaSafragold} datado em ${dataBR(l.data)} (após hoje, ${dataBR(hoje)}).`,
      acao: 'Verificar a data do lançamento.',
    }, realComp[l.contaSafragold])
  }

  const ordemSev: Record<Severidade, number> = { alta: 0, media: 1, baixa: 2 }
  achados.sort((a, b) => ordemSev[a.severidade] - ordemSev[b.severidade] || b.valor - a.valor)

  const totalMovimento = arred(
    lancamentos
      .filter((l) => competenciaDe(l.data) === competencia)
      .reduce((s, l) => s + Math.abs(l.valor), 0),
  )
  valorEmRevisao = arred(valorEmRevisao)
  const indiceConfianca =
    totalMovimento > 0
      ? Math.max(0, Math.min(100, Math.round((1 - valorEmRevisao / totalMovimento) * 100)))
      : 100

  return {
    competencia,
    achados,
    indiceConfianca,
    totalMovimento,
    valorEmRevisao,
    materiais: achados.filter((a) => a.material).length,
    pisoMaterialidade: piso,
  }
}

function brl(v: number): string {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-')
  return d && m && a ? `${d}/${m}/${a}` : iso
}
