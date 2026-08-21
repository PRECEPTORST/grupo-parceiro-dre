// Painel de reconciliação ENOKI × PLANILHA (item 3.1 do ROADMAP.md).
//
// Duas fontes independentes descrevendo o mesmo período: onde discordam há
// informação. Este painel mostra os totais lado a lado e lista as divergências
// materiais por linha e mês, da mais grave para a menos.
//
// Só aparece quando as DUAS fontes têm dados — sem confronto não há reconciliação.
import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { Card, Kicker } from './ui'
import { formatBRL } from '../lib/format'
import { mapaEfetivo } from '../lib/planoContas'
import { reconciliar, type SeveridadeRec } from '../lib/reconciliacao'
import { lancamentosPlanilha } from '../lib/tipos'

const CORES: Record<SeveridadeRec, string> = {
  alta: 'border-danger/40 bg-danger/5 text-danger',
  media: 'border-warn/40 bg-warn/10 text-gold-deep',
  baixa: 'border-line bg-cream text-muted',
}

const ROTULO_SEV: Record<SeveridadeRec, string> = {
  alta: 'alta',
  media: 'média',
  baixa: 'baixa',
}

function rotuloCompetencia(c: string): string {
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${meses[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}`
}

export function PainelReconciliacao() {
  const { estado } = useDre()
  const [expandido, setExpandido] = useState(false)

  const planilha = useMemo(() => lancamentosPlanilha(estado), [estado])
  // `?? []` inline criaria uma referência nova a cada render e invalidaria o
  // memo abaixo — que reconcilia milhares de lançamentos.
  const enoki = useMemo(() => estado.lancamentosEnoki ?? [], [estado.lancamentosEnoki])
  const mapa = useMemo(() => mapaEfetivo(estado.classificacoes), [estado.classificacoes])

  const rel = useMemo(
    () => (planilha.length && enoki.length ? reconciliar(planilha, enoki, mapa) : null),
    [planilha, enoki, mapa],
  )

  if (!rel) return null

  const mostrar = expandido ? rel.divergencias : rel.divergencias.slice(0, 6)
  const altas = rel.divergencias.filter((d) => d.severidade === 'alta').length

  const Comparacao = ({
    rotulo,
    dados,
  }: {
    rotulo: string
    dados: { enoki: number; planilha: number; diferenca: number }
  }) => (
    <div className="rounded-lg border border-line bg-cream-2 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{rotulo}</div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm tabular-nums">
        <span className="text-ink">
          <span className="text-[11px] text-faint">API </span>
          {formatBRL(dados.enoki)}
        </span>
        <span className="text-ink">
          <span className="text-[11px] text-faint">planilha </span>
          {formatBRL(dados.planilha)}
        </span>
      </div>
      <div
        className={`mt-1 text-sm font-semibold tabular-nums ${
          Math.abs(dados.diferenca) > 0 ? 'text-gold-deep' : 'text-green-deep'
        }`}
      >
        {dados.diferenca >= 0 ? '+' : ''}
        {formatBRL(dados.diferenca)}
      </div>
    </div>
  )

  return (
    <Card className="animate-rise">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Kicker>Reconciliação</Kicker>
          <h2 className="mt-1 text-lg font-bold text-ink">Enoki × planilha</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Duas fontes independentes para o mesmo período. Onde elas discordam de forma material,
            há erro de classificação, lançamento esquecido ou competência descasada.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-ink">{rel.divergencias.length}</div>
          <div className="text-[11px] uppercase tracking-wide text-faint">
            divergências{altas > 0 && <span className="text-danger"> · {altas} alta(s)</span>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Comparacao rotulo="Receita bruta do período" dados={rel.receitaBruta} />
        <Comparacao rotulo="Resultado líquido do período" dados={rel.resultadoLiquido} />
      </div>

      {(rel.competenciasSoEnoki.length > 0 || rel.competenciasSoPlanilha.length > 0) && (
        <p className="mt-3 text-xs text-muted">
          Fora da comparação:
          {rel.competenciasSoEnoki.length > 0 && (
            <> {rel.competenciasSoEnoki.map(rotuloCompetencia).join(', ')} só na API.</>
          )}
          {rel.competenciasSoPlanilha.length > 0 && (
            <> {rel.competenciasSoPlanilha.map(rotuloCompetencia).join(', ')} só na planilha.</>
          )}
        </p>
      )}

      {rel.divergencias.length === 0 ? (
        <p className="mt-4 rounded-lg border border-green/40 bg-green/5 p-3 text-sm text-green-deep">
          As duas fontes fecham em todas as linhas do período comum, dentro da materialidade.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {mostrar.map((d) => (
              <li key={d.id} className={`rounded-lg border p-3 ${CORES[d.severidade]}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {rotuloCompetencia(d.competencia)} · {d.rotulo}
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {d.diferenca >= 0 ? '+' : ''}
                    {formatBRL(d.diferenca)}
                    {d.diferencaPct != null && (
                      <span className="ml-1 text-[11px] font-normal opacity-70">
                        ({d.diferencaPct}%)
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-90">{d.detalhe}</p>
                <div className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
                  severidade {ROTULO_SEV[d.severidade]}
                </div>
              </li>
            ))}
          </ul>
          {rel.divergencias.length > 6 && (
            <button
              className="mt-3 text-xs font-semibold text-green underline-offset-2 hover:underline"
              onClick={() => setExpandido((v) => !v)}
            >
              {expandido
                ? 'Mostrar só as 6 maiores'
                : `Ver todas as ${rel.divergencias.length} divergências`}
            </button>
          )}
        </>
      )}
    </Card>
  )
}
