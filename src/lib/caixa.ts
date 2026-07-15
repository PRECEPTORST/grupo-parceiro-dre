// Motor de PROJEÇÃO DE FLUXO DE CAIXA — DETERMINÍSTICO. Zero IA.
//
// Base única: uma lista de EVENTOS DE CAIXA (data exata + valor + sentido).
// O mensal e o diário são apenas AGREGAÇÕES dessa mesma base — por isso o
// detalhe dia a dia sempre fecha com o total do mês. Mesma entrada + mesmas
// premissas → mesma saída.
//
// De onde vem cada evento:
//   • Realizado — cada lançamento, na sua data real + o PRAZO da linha.
//   • Meses futuros — o total projetado de cada linha (orçamento/histórico)
//     distribuído pelos dias replicando o RITMO diário do histórico, + prazo.
//   • Enoki (seam) — contas a pagar/receber reais com vencimento substituem a
//     estimativa por prazo no mês/tipo que cobrem.
//
// Depreciação/amortização é NÃO-CAIXA e nunca vira evento.
import {
  LINHAS_DRE,
  META_LINHAS,
  type LinhaDRE,
  type LancamentoCanonico,
  type MapaClassificacao,
  type Orcamento,
  type PremissasCaixa,
  type MovimentoCaixa,
} from './tipos'
import { competenciaDe } from './dre'

function arred(v: number): number {
  return Math.round(v * 100) / 100
}
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function zeros(): Record<LinhaDRE, number> {
  return Object.fromEntries(LINHAS_DRE.map((l) => [l, 0])) as Record<LinhaDRE, number>
}

/** Como cada linha do DRE vira caixa: sentido do fluxo e qual prazo aplicar. */
type TrataCaixa = {
  fluxo: 'entrada' | 'saida' | 'ignorar'
  prazo: 'recebimento' | 'pagamento' | 'impostos'
}

const TRATAMENTO_CAIXA: Record<LinhaDRE, TrataCaixa> = {
  receita_bruta: { fluxo: 'entrada', prazo: 'recebimento' },
  outras_receitas_operacionais: { fluxo: 'entrada', prazo: 'recebimento' },
  receita_financeira: { fluxo: 'entrada', prazo: 'recebimento' },
  deducoes: { fluxo: 'saida', prazo: 'impostos' },
  impostos_lucro: { fluxo: 'saida', prazo: 'impostos' },
  custo_produto: { fluxo: 'saida', prazo: 'pagamento' },
  despesas_comerciais: { fluxo: 'saida', prazo: 'pagamento' },
  despesas_administrativas: { fluxo: 'saida', prazo: 'pagamento' },
  despesa_financeira: { fluxo: 'saida', prazo: 'pagamento' },
  // Depreciação/amortização não movimenta caixa — nunca entra no fluxo.
  depreciacao_amortizacao: { fluxo: 'ignorar', prazo: 'pagamento' },
}

/** 'YYYY-MM' + n meses → 'YYYY-MM'. */
export function addMeses(comp: string, n: number): string {
  const [y, m] = comp.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

/** 'YYYY-MM-DD' + dias → 'YYYY-MM-DD' (calendário real). */
export function addDiasISO(dataIso: string, dias: number): string {
  const [y, m, d] = dataIso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + dias)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}

/** Quantos dias tem o mês 'YYYY-MM'. */
export function diasNoMes(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** De onde veio um evento de caixa — para abrir o dia e ver os lançamentos. */
export interface OrigemEvento {
  /** Linha do DRE (ausente em movimento real do Enoki). */
  linha?: LinhaDRE
  /** Rótulo exibível (linha do DRE, ou descrição do título real). */
  rotulo: string
  /** Conta do Safragold (só no realizado). */
  conta?: string
  /** Histórico do lançamento (realizado) ou descrição do título (real). */
  descricao?: string
  /** Data de competência de origem ('YYYY-MM-DD'). */
  dataOrigem: string
  /** true quando é estimativa (mês projetado), false quando é lançamento/título real. */
  projetado: boolean
}

/** Um movimento de caixa datado (unidade da base). */
export interface EventoCaixa {
  data: string
  tipo: 'entrada' | 'saida'
  valor: number
  origem: OrigemEvento
}

const prazoDe = (t: TrataCaixa['prazo'], p: PremissasCaixa) =>
  t === 'recebimento'
    ? p.prazoRecebimentoDias
    : t === 'impostos'
      ? p.prazoImpostosDias
      : p.prazoPagamentoDias

/**
 * Peso diário de cada linha: como o valor de um mês se distribui pelos dias,
 * a partir do ritmo observado no histórico realizado. Linha sem histórico cai
 * no dia 15 (centro do mês).
 */
function pesosDiarios(
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
): Record<LinhaDRE, { dia: number; peso: number }[]> {
  const soma: Record<LinhaDRE, Map<number, number>> = Object.fromEntries(
    LINHAS_DRE.map((l) => [l, new Map<number, number>()]),
  ) as Record<LinhaDRE, Map<number, number>>

  for (const l of lancamentos) {
    const linha = mapa[l.contaSafragold]
    if (!linha) continue
    const dia = Number(l.data.slice(8, 10)) || 15
    const m = soma[linha]
    m.set(dia, (m.get(dia) ?? 0) + l.valor)
  }

  const out = {} as Record<LinhaDRE, { dia: number; peso: number }[]>
  for (const linha of LINHAS_DRE) {
    const m = soma[linha]
    const total = [...m.values()].reduce((s, v) => s + v, 0)
    out[linha] = total
      ? [...m.entries()].sort((a, b) => a[0] - b[0]).map(([dia, v]) => ({ dia, peso: v / total }))
      : [{ dia: 15, peso: 1 }]
  }
  return out
}

/** Constrói a base de eventos de caixa (derivados; sem os reais do Enoki). */
function construirEventos(
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
  orcamentos: Orcamento[],
  premissas: PremissasCaixa,
): EventoCaixa[] {
  const eventos: EventoCaixa[] = []

  // 1) Realizado — cada lançamento na sua data + prazo da linha.
  const realCompLinha = new Map<string, Record<LinhaDRE, number>>()
  for (const l of lancamentos) {
    const linha = mapa[l.contaSafragold]
    if (!linha) continue
    const comp = competenciaDe(l.data)
    let rec = realCompLinha.get(comp)
    if (!rec) {
      rec = zeros()
      realCompLinha.set(comp, rec)
    }
    rec[linha] += l.valor
    const t = TRATAMENTO_CAIXA[linha]
    if (t.fluxo === 'ignorar') continue
    eventos.push({
      data: addDiasISO(l.data, prazoDe(t.prazo, premissas)),
      tipo: t.fluxo,
      valor: l.valor,
      origem: {
        linha,
        rotulo: META_LINHAS[linha].rotulo,
        conta: l.contaSafragold,
        descricao: l.historico,
        dataOrigem: l.data,
        projetado: false,
      },
    })
  }

  // 2) Base para projetar os meses futuros.
  const orcCompLinha = new Map<string, Record<LinhaDRE, number>>()
  for (const o of orcamentos) {
    const rec = zeros()
    for (const [conta, v] of Object.entries(o.valores)) {
      const linha = mapa[conta]
      if (linha) rec[linha] += v
    }
    orcCompLinha.set(o.competencia, rec)
  }

  const compsReal = [...realCompLinha.keys()].sort()
  const ultimoRealizado = compsReal.length ? compsReal[compsReal.length - 1] : null

  const baseComps = compsReal.slice(-Math.max(1, premissas.mesesBaseHistorico))
  const media = zeros()
  for (const c of baseComps) {
    const r = realCompLinha.get(c)!
    for (const linha of LINHAS_DRE) media[linha] += r[linha]
  }
  if (baseComps.length) for (const linha of LINHAS_DRE) media[linha] /= baseComps.length

  const temValores = (rec?: Record<LinhaDRE, number>) =>
    !!rec && LINHAS_DRE.some((l) => rec[l] !== 0)
  const accrualProjetado = (comp: string): Record<LinhaDRE, number> => {
    const orc = orcCompLinha.get(comp)
    switch (premissas.metodoProjecao) {
      case 'orcamento':
        return orc ?? zeros()
      case 'historico':
        return media
      default:
        return temValores(orc) ? orc! : media
    }
  }

  const pesos = pesosDiarios(lancamentos, mapa)
  const primeiroMes = premissas.competenciaSaldo
  const ultimoMes = addMeses(primeiroMes, Math.max(1, premissas.horizonteMeses) - 1)

  // 3) Meses futuros (não realizados) → total da linha distribuído pelos dias.
  let comp = ultimoRealizado ? addMeses(ultimoRealizado, 1) : primeiroMes
  for (let guard = 0; comp <= ultimoMes && guard < 600; guard++, comp = addMeses(comp, 1)) {
    const acc = accrualProjetado(comp)
    for (const linha of LINHAS_DRE) {
      const t = TRATAMENTO_CAIXA[linha]
      if (t.fluxo === 'ignorar') continue
      const total = acc[linha]
      if (!total) continue
      const prazo = prazoDe(t.prazo, premissas)
      for (const { dia, peso } of pesos[linha]) {
        const dataOrigem = `${comp}-${pad2(dia)}`
        eventos.push({
          data: addDiasISO(dataOrigem, prazo),
          tipo: t.fluxo,
          valor: total * peso,
          origem: { linha, rotulo: META_LINHAS[linha].rotulo, dataOrigem, projetado: true },
        })
      }
    }
  }

  return eventos
}

/** Um mês da projeção de caixa. */
export interface MesFluxo {
  competencia: string
  entradas: number
  saidas: number
  liquido: number
  saldoInicial: number
  saldoFinal: number
  negativo: boolean
}

export interface ProjecaoCaixa {
  meses: MesFluxo[]
  premissas: PremissasCaixa
  saldoFinalHorizonte: number
  menorSaldo: { competencia: string; saldo: number } | null
  primeiroMesNegativo: string | null
  usouReais: boolean
}

/** Projeta o fluxo de caixa MENSAL (rollup dos eventos por mês). */
export function projetarCaixa(
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
  orcamentos: Orcamento[],
  premissas: PremissasCaixa,
  movimentosReais?: MovimentoCaixa[],
): ProjecaoCaixa {
  const eventos = construirEventos(lancamentos, mapa, orcamentos, premissas)
  const primeiroMes = premissas.competenciaSaldo
  const ultimoMes = addMeses(primeiroMes, Math.max(1, premissas.horizonteMeses) - 1)

  const entradasMes = new Map<string, number>()
  const saidasMes = new Map<string, number>()
  for (const e of eventos) {
    const mes = e.data.slice(0, 7)
    if (mes < primeiroMes || mes > ultimoMes) continue
    const alvo = e.tipo === 'entrada' ? entradasMes : saidasMes
    alvo.set(mes, (alvo.get(mes) ?? 0) + e.valor)
  }

  // Seam do Enoki: real substitui a estimativa nos meses/tipos que cobrir.
  let usouReais = false
  if (movimentosReais && movimentosReais.length) {
    const realEnt = new Map<string, number>()
    const realSai = new Map<string, number>()
    for (const m of movimentosReais) {
      const mes = competenciaDe(m.data)
      if (mes < primeiroMes || mes > ultimoMes) continue
      const alvo = m.tipo === 'entrada' ? realEnt : realSai
      alvo.set(mes, (alvo.get(mes) ?? 0) + Math.abs(m.valor))
      usouReais = true
    }
    for (const [mes, v] of realEnt) entradasMes.set(mes, v)
    for (const [mes, v] of realSai) saidasMes.set(mes, v)
  }

  const meses: MesFluxo[] = []
  let saldo = premissas.saldoInicial
  let menorSaldo: ProjecaoCaixa['menorSaldo'] = null
  let primeiroMesNegativo: string | null = null

  for (let i = 0; i < Math.max(1, premissas.horizonteMeses); i++) {
    const mes = addMeses(primeiroMes, i)
    const entradas = arred(entradasMes.get(mes) ?? 0)
    const saidas = arred(saidasMes.get(mes) ?? 0)
    const liquido = arred(entradas - saidas)
    const saldoInicial = arred(saldo)
    saldo += liquido
    const saldoFinal = arred(saldo)
    const negativo = saldoFinal < 0
    if (negativo && !primeiroMesNegativo) primeiroMesNegativo = mes
    if (!menorSaldo || saldoFinal < menorSaldo.saldo) menorSaldo = { competencia: mes, saldo: saldoFinal }
    meses.push({ competencia: mes, entradas, saidas, liquido, saldoInicial, saldoFinal, negativo })
  }

  return {
    meses,
    premissas,
    saldoFinalHorizonte: meses.length ? meses[meses.length - 1].saldoFinal : premissas.saldoInicial,
    menorSaldo,
    primeiroMesNegativo,
    usouReais,
  }
}

/** Um dia dentro do mês detalhado. */
export interface DiaFluxo {
  data: string
  dia: number
  /** Total a receber no dia. */
  entradas: number
  /** Total a pagar no dia. */
  saidas: number
  liquido: number
  saldoInicial: number
  saldoFinal: number
  negativo: boolean
  /** Lançamentos/títulos que compõem o dia (para abrir o detalhe). */
  eventos: EventoCaixa[]
}

export interface ProjecaoDiaria {
  mes: string
  dias: DiaFluxo[]
  saldoAbertura: number
  saldoFechamento: number
  /** Dia de menor saldo (pior aperto do mês). */
  menorSaldo: { data: string; saldo: number } | null
  /** Quantos dias fecham negativo. */
  diasNegativos: number
}

/**
 * Detalha o fluxo de caixa DIA A DIA dentro de `mes`. Abre com o saldo inicial
 * do mês na projeção mensal (por isso o diário fecha igual ao mensal) e roda o
 * saldo por todos os dias do mês, inclusive os sem movimento.
 */
export function projetarCaixaDiario(
  mes: string,
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
  orcamentos: Orcamento[],
  premissas: PremissasCaixa,
  movimentosReais?: MovimentoCaixa[],
): ProjecaoDiaria {
  // Saldo de abertura = saldo inicial do mês na visão mensal → consistência.
  const mensal = projetarCaixa(lancamentos, mapa, orcamentos, premissas, movimentosReais)
  const info = mensal.meses.find((m) => m.competencia === mes)
  const saldoAbertura = info ? info.saldoInicial : premissas.saldoInicial

  // Eventos do mês. Enoki: real substitui a estimativa, por tipo, no mês.
  let eventosMes = construirEventos(lancamentos, mapa, orcamentos, premissas).filter(
    (e) => e.data.slice(0, 7) === mes,
  )
  if (movimentosReais && movimentosReais.length) {
    const reaisMes = movimentosReais.filter((m) => competenciaDe(m.data) === mes)
    if (reaisMes.length) {
      const tiposCobertos = new Set(reaisMes.map((m) => m.tipo))
      eventosMes = eventosMes.filter((e) => !tiposCobertos.has(e.tipo))
      for (const m of reaisMes) {
        const data = m.data.slice(0, 10)
        eventosMes.push({
          data,
          tipo: m.tipo,
          valor: Math.abs(m.valor),
          origem: {
            rotulo: m.descricao ?? (m.tipo === 'entrada' ? 'Recebimento' : 'Pagamento'),
            descricao: m.descricao,
            dataOrigem: data,
            projetado: false,
          },
        })
      }
    }
  }

  // Agrupa os eventos por dia.
  const porDia = new Map<string, EventoCaixa[]>()
  for (const e of eventosMes) {
    const arr = porDia.get(e.data)
    if (arr) arr.push(e)
    else porDia.set(e.data, [e])
  }

  const ordenarEventos = (a: EventoCaixa, b: EventoCaixa) =>
    a.tipo === b.tipo ? b.valor - a.valor : a.tipo === 'entrada' ? -1 : 1

  const nd = diasNoMes(mes)
  const dias: DiaFluxo[] = []
  let saldo = saldoAbertura
  let menorSaldo: ProjecaoDiaria['menorSaldo'] = null
  let diasNegativos = 0

  for (let d = 1; d <= nd; d++) {
    const data = `${mes}-${pad2(d)}`
    const eventosDia = (porDia.get(data) ?? [])
      .map((e) => ({ ...e, valor: arred(e.valor) }))
      .sort(ordenarEventos)
    const entradas = arred(eventosDia.reduce((s, e) => s + (e.tipo === 'entrada' ? e.valor : 0), 0))
    const saidas = arred(eventosDia.reduce((s, e) => s + (e.tipo === 'saida' ? e.valor : 0), 0))
    const liquido = arred(entradas - saidas)
    const saldoInicial = arred(saldo)
    saldo += liquido
    const saldoFinal = arred(saldo)
    const negativo = saldoFinal < 0
    if (negativo) diasNegativos++
    if (!menorSaldo || saldoFinal < menorSaldo.saldo) menorSaldo = { data, saldo: saldoFinal }
    dias.push({ data, dia: d, entradas, saidas, liquido, saldoInicial, saldoFinal, negativo, eventos: eventosDia })
  }

  return {
    mes,
    dias,
    saldoAbertura: arred(saldoAbertura),
    saldoFechamento: dias.length ? dias[dias.length - 1].saldoFinal : arred(saldoAbertura),
    menorSaldo,
    diasNegativos,
  }
}
