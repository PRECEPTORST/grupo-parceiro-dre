// Camada de AUDITORIA — DETERMINÍSTICA. Zero IA.
//
// Enquanto a Confiabilidade olha lançamento-a-lançamento DENTRO de um mês
// (classificação, duplicidade, valor atípico…), a Auditoria olha o DRE INTEIRO
// no PERÍODO carregado e aponta questões ESTRUTURAIS/contábeis: carga tributária
// ausente, sem IRPJ/CSLL, depreciação "chapada", resultado que não reconcilia com
// o total informado na origem, despesa que concentra o mês, margem finíssima.
//
// Feita para dados que vêm de uma DRE já fechada (ex.: a DRE gerencial do cliente
// importada à mão): serve para achar o que precisa ser questionado ANTES de o
// número virar verdade. Mesma entrada → mesma saída. A IA, se um dia entrar, só
// NARRA os achados — a detecção é sempre este código.

import { formatBRL } from './format'
import type { LinhaDRE, LancamentoCanonico, MapaClassificacao } from './tipos'
import { montarDre, competenciasDisponiveis, type DreMensal } from './dre'

export type SeveridadeAud = 'alta' | 'media' | 'baixa'

export type CategoriaAud =
  | 'tributos_vendas'
  | 'imposto_lucro'
  | 'depreciacao'
  | 'reconciliacao'
  | 'concentracao'
  | 'margem'

export interface AchadoAuditoria {
  id: string
  categoria: CategoriaAud
  severidade: SeveridadeAud
  titulo: string
  detalhe: string
  /** Ação sugerida ao Controler/sócio. */
  acao: string
  /** Magnitude em R$ relevante ao achado (0 = sem valor monetário a exibir). */
  valor: number
  /** Competências afetadas ('YYYY-MM'); vazio = todo o período. */
  competencias: string[]
}

export interface OpcoesAuditoria {
  /** Piso de carga tributária s/ vendas (fração). Abaixo → achado. Default 1%. */
  minCargaTributaria?: number
  /** Fração das despesas do mês numa única conta para alertar. Default 50%. */
  concentracaoDespesa?: number
  /** Margem bruta mínima "saudável" (fração). Meses abaixo → achado. Default 1%. */
  margemMinima?: number
  /** Tolerância (R$) na reconciliação com o resultado declarado. Default R$ 1. */
  tolReconciliacao?: number
}

export interface RelatorioAuditoria {
  achados: AchadoAuditoria[]
  competencias: string[]
  receitaBrutaTotal: number
  resultadoLiquidoTotal: number
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloComp(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`
}
function pct(fracao: number): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}
/** Total realizado de uma linha do DRE (0 se ausente). */
function totalLinha(dre: DreMensal, linha: LinhaDRE): number {
  return dre.linhas.find((l) => l.linha === linha)?.realizado ?? 0
}

const ORDEM_SEV: Record<SeveridadeAud, number> = { alta: 0, media: 1, baixa: 2 }

/**
 * Despesas OPERACIONAIS (fora o CPV) — base da análise de concentração. O custo
 * da mercadoria é excluído de propósito: no comércio de grãos ele é sempre a maior
 * conta, então mediríamos concentração nele à toa. O que interessa é um evento fora
 * do CPV (ex.: uma perda de inadimplência) que sozinho determina o mês.
 */
const LINHAS_OPEX: LinhaDRE[] = [
  'despesas_comerciais',
  'despesas_administrativas',
  'depreciacao_amortizacao',
  'despesa_financeira',
]

/**
 * Varre todas as competências dos lançamentos e devolve os achados de auditoria,
 * ordenados por severidade (alta → baixa).
 */
export function analisarAuditoria(
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
  resultadoDeclarado: Record<string, number> = {},
  opcoes: OpcoesAuditoria = {},
): RelatorioAuditoria {
  const minCarga = opcoes.minCargaTributaria ?? 0.01
  const concLim = opcoes.concentracaoDespesa ?? 0.5
  const margemMin = opcoes.margemMinima ?? 0.01
  const tol = opcoes.tolReconciliacao ?? 1

  // Competências em ordem cronológica.
  const comps = competenciasDisponiveis(lancamentos).slice().sort()
  const dres = comps.map((c) => montarDre(c, lancamentos, mapa))

  const soma = (fn: (d: DreMensal) => number) => dres.reduce((s, d) => s + fn(d), 0)
  const receitaBrutaTotal = soma((d) => totalLinha(d, 'receita_bruta'))
  const deducoesTotal = soma((d) => totalLinha(d, 'deducoes'))
  const impostoLucroTotal = soma((d) => totalLinha(d, 'impostos_lucro'))
  const resultadoAntesIrTotal = soma((d) => d.realizado.resultadoAntesIr)
  const resultadoLiquidoTotal = soma((d) => d.realizado.resultadoLiquido)

  const achados: AchadoAuditoria[] = []

  // 1) Carga tributária sobre vendas quase ausente.
  if (receitaBrutaTotal > 0) {
    const carga = deducoesTotal / receitaBrutaTotal
    if (carga < minCarga) {
      achados.push({
        id: 'aud-tributos-vendas',
        categoria: 'tributos_vendas',
        severidade: 'alta',
        titulo: 'Tributos sobre vendas quase ausentes',
        detalhe: `As deduções somam ${pct(carga)} da receita bruta (${formatBRL(deducoesTotal)} em ${formatBRL(receitaBrutaTotal)}). Em comércio de grãos, PIS/COFINS/Funrural/ICMS costumam ser relevantes — pode haver conta de imposto não lançada ou regime de diferimento a documentar.`,
        acao: 'Confirmar o regime tributário com a contabilidade e se há impostos sobre vendas faltando.',
        valor: deducoesTotal,
        competencias: comps,
      })
    }
  }

  // 2) Sem IRPJ/CSLL apesar de lucro no período.
  if (impostoLucroTotal <= tol && resultadoAntesIrTotal > tol) {
    achados.push({
      id: 'aud-sem-imposto-lucro',
      categoria: 'imposto_lucro',
      severidade: 'alta',
      titulo: 'Sem IRPJ/CSLL apesar de resultado positivo',
      detalhe: `Não há tributo sobre o lucro lançado no período, mas o resultado antes do IR acumula ${formatBRL(resultadoAntesIrTotal)}. O passivo tributário está subestimado e o resultado, superavaliado.`,
      acao: 'Provisionar IRPJ/CSLL conforme o regime (lucro real/presumido).',
      valor: resultadoAntesIrTotal,
      competencias: comps,
    })
  }

  // 3) Depreciação idêntica em vários meses (valor "chapado").
  const deps = comps
    .map((c, i) => ({ c, v: totalLinha(dres[i], 'depreciacao_amortizacao') }))
    .filter((x) => x.v > 0)
  if (deps.length >= 3) {
    const vs = deps.map((x) => x.v)
    if (Math.max(...vs) - Math.min(...vs) < 0.01) {
      achados.push({
        id: 'aud-depreciacao-constante',
        categoria: 'depreciacao',
        severidade: 'media',
        titulo: 'Depreciação idêntica todos os meses',
        detalhe: `A depreciação é exatamente ${formatBRL(vs[0])} em ${deps.length} meses seguidos — valor fixo, típico de lançamento manual e não de cálculo sobre o imobilizado.`,
        acao: 'Conferir a base de bens depreciáveis e recalcular a cota mensal.',
        valor: vs[0],
        competencias: deps.map((x) => x.c),
      })
    }
  }

  // 4) Reconciliação: soma das contas × resultado declarado na origem.
  const divergentes = comps
    .map((c, i) => ({ c, dif: dres[i].realizado.resultadoLiquido - (resultadoDeclarado[c] ?? NaN) }))
    .filter((x) => Number.isFinite(x.dif) && Math.abs(x.dif) > tol)
  if (divergentes.length) {
    const somaDif = divergentes.reduce((s, d) => s + Math.abs(d.dif), 0)
    const lista = divergentes
      .map((d) => `${rotuloComp(d.c)} ${d.dif > 0 ? '+' : '−'}${formatBRL(Math.abs(d.dif))}`)
      .join(', ')
    achados.push({
      id: 'aud-reconciliacao',
      categoria: 'reconciliacao',
      severidade: 'media',
      titulo: 'Soma das contas não fecha com o total informado',
      detalhe: `A soma das contas diverge do resultado declarado na origem em ${divergentes.length} mês(es): ${lista}. Indica ajuste manual no subtotal da planilha de origem — a rastreabilidade se perde.`,
      acao: 'Rastrear o ajuste manual na origem e reconstruir o subtotal a partir das contas.',
      valor: somaDif,
      competencias: divergentes.map((d) => d.c),
    })
  }

  // 5) Concentração: uma única conta domina as despesas OPERACIONAIS do mês (fora o CPV).
  for (let i = 0; i < comps.length; i++) {
    const dre = dres[i]
    const totalOpex = LINHAS_OPEX.reduce((s, l) => s + totalLinha(dre, l), 0)
    if (totalOpex <= 0) continue
    let maior: { conta: string; desc: string; valor: number } | null = null
    for (const l of LINHAS_OPEX) {
      const lr = dre.linhas.find((x) => x.linha === l)
      if (!lr) continue
      for (const cv of lr.contas) {
        if (!maior || cv.realizado > maior.valor) {
          maior = { conta: cv.conta, desc: cv.descricao, valor: cv.realizado }
        }
      }
    }
    if (maior && maior.valor >= concLim * totalOpex) {
      achados.push({
        id: `aud-concentracao-${comps[i]}`,
        categoria: 'concentracao',
        severidade: 'alta',
        titulo: `Uma conta concentra as despesas de ${rotuloComp(comps[i])}`,
        detalhe: `"${maior.desc || maior.conta}" responde por ${pct(maior.valor / totalOpex)} das despesas operacionais do mês, fora o custo da mercadoria (${formatBRL(maior.valor)}). Um único evento define o resultado — confirmar documentação e se é recorrente ou pontual.`,
        acao: 'Validar a natureza e a documentação do lançamento; isolar eventos não recorrentes.',
        valor: maior.valor,
        competencias: [comps[i]],
      })
    }
  }

  // 6) Margem bruta finíssima em alguns meses.
  const finas = comps
    .map((c, i) => ({
      c,
      m: dres[i].realizado.receitaLiquida > 0 ? dres[i].realizado.lucroBruto / dres[i].realizado.receitaLiquida : 0,
    }))
    .filter((x) => x.m > 0 && x.m < margemMin)
  if (finas.length) {
    achados.push({
      id: 'aud-margem-fina',
      categoria: 'margem',
      severidade: 'baixa',
      titulo: 'Margem bruta muito fina em alguns meses',
      detalhe: `${finas.length} mês(es) com margem bruta abaixo de ${pct(margemMin)}: ${finas.map((x) => `${rotuloComp(x.c)} (${pct(x.m)})`).join(', ')}. É normal no agro, mas a composição do CPV (frete, comissão, quebras) precisa estar padronizada para a margem ser comparável mês a mês.`,
      acao: 'Padronizar o que entra no CPV e revisar contratos de frete/comissão.',
      valor: 0,
      competencias: finas.map((x) => x.c),
    })
  }

  achados.sort((a, b) => ORDEM_SEV[a.severidade] - ORDEM_SEV[b.severidade] || b.valor - a.valor)

  return { achados, competencias: comps, receitaBrutaTotal, resultadoLiquidoTotal }
}
