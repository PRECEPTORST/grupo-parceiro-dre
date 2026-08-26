// Aviso de mês incompleto no DRE.
//
// O DRE abre na competência mais recente. Quando a fonte só tem dados até o dia
// 5, o mês aparece com uma fração do faturamento normal e parece desastre — é o
// jeito mais rápido de um sócio perder a confiança no relatório. O número está
// certo; o que falta é o contexto ao lado dele.
import { useMemo } from 'react'
import { coberturaDaCompetencia, referenciaMensal } from '../lib/cobertura'
import { montarDre, competenciasDisponiveis } from '../lib/dre'
import { formatBRL, formatDataBR } from '../lib/format'
import type { LancamentoCanonico, MapaClassificacao } from '../lib/tipos'

export function AvisoCobertura({
  competencia,
  lancamentos,
  mapa,
}: {
  competencia: string
  lancamentos: LancamentoCanonico[]
  mapa: MapaClassificacao
}) {
  const dados = useMemo(() => {
    const cobertura = coberturaDaCompetencia(competencia, lancamentos)
    if (!cobertura.parcial) return null

    const competencias = competenciasDisponiveis(lancamentos)
    const receitaDe = (c: string) =>
      montarDre(c, lancamentos, mapa).linhas.find((l) => l.linha === 'receita_bruta')!.realizado

    // Só as competências COMPLETAS entram na média — senão o próprio mês parcial
    // puxa a régua para baixo e a comparação perde sentido.
    const parciais = new Set(
      competencias.filter((c) => coberturaDaCompetencia(c, lancamentos).parcial),
    )
    const media = referenciaMensal(competencias, receitaDe, parciais)
    return { cobertura, receita: receitaDe(competencia), media }
  }, [competencia, lancamentos, mapa])

  if (!dados) return null
  const { cobertura, receita, media } = dados
  const pct = Math.round(cobertura.fracao * 100)

  return (
    <div className="mb-5 animate-rise rounded-xl border border-warn/40 bg-warn/10 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-gold-deep">
          Este mês está incompleto — {pct}% do período
        </h3>
        <span className="text-xs text-gold-deep">
          dados até {formatDataBR(cobertura.ultimaData)} de {cobertura.diasNoMes} dias
        </span>
      </div>
      <p className="mt-1.5 text-sm text-muted">
        {cobertura.mesCorrente
          ? 'O mês ainda está acontecendo, então os valores abaixo são parciais por natureza.'
          : 'A fonte de dados não cobre o mês inteiro — pode faltar sincronizar, ou o ERP não tem os lançamentos do restante do período.'}{' '}
        Comparar este total com um mês fechado leva a conclusões erradas.
      </p>
      {media != null && media > 0 && (
        <p className="mt-2 text-sm text-muted">
          Receita no período: <strong className="text-ink">{formatBRL(receita)}</strong> · média dos
          meses completos: <strong className="text-ink">{formatBRL(media)}</strong>. Proporcional
          aos {pct}% cobertos, o esperado seria algo perto de{' '}
          <strong className="text-ink">{formatBRL(media * cobertura.fracao)}</strong>.
        </p>
      )}
    </div>
  )
}
