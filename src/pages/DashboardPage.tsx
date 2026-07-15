import { useMemo, useState, type ReactNode } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useDre } from '../context/DreContext'
import { Kicker, Select } from '../components/ui'
import { formatBRL, formatBRLCompact, formatPct } from '../lib/format'
import { montarDre, mapaDeClassificacoes, competenciasDisponiveis } from '../lib/dre'

const CORES = { verde: '#0f7a49', dourado: '#cd8d05' }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloCompetencia(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`
}
function margem(parte: number, base: number): number | null {
  return base > 0 ? (parte / base) * 100 : null
}

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #ece1c8',
  fontSize: 12,
  padding: '8px 12px',
  boxShadow: '0 12px 32px -12px rgba(35,40,31,0.28)',
}

export function DashboardPage() {
  const { estado } = useDre()
  const competencias = useMemo(
    () => competenciasDisponiveis(estado.lancamentos),
    [estado.lancamentos],
  )
  const [comp, setComp] = useState<string>(() => competencias[0] ?? new Date().toISOString().slice(0, 7))
  const competencia = competencias.includes(comp) ? comp : (competencias[0] ?? comp)

  const mapa = useMemo(() => mapaDeClassificacoes(estado.classificacoes), [estado.classificacoes])
  const orcamentoAtual = estado.orcamentos.find((o) => o.competencia === competencia) ?? null
  const temOrcamento = !!orcamentoAtual

  const dre = useMemo(
    () => montarDre(competencia, estado.lancamentos, mapa, orcamentoAtual),
    [competencia, estado.lancamentos, mapa, orcamentoAtual],
  )

  const serie = useMemo(
    () =>
      [...competencias].reverse().map((c) => {
        const orc = estado.orcamentos.find((o) => o.competencia === c) ?? null
        const d = montarDre(c, estado.lancamentos, mapa, orc)
        return {
          rotulo: rotuloCompetencia(c),
          receitaLiquida: d.realizado.receitaLiquida,
          resultadoLiquido: d.realizado.resultadoLiquido,
        }
      }),
    [competencias, estado.lancamentos, estado.orcamentos, mapa],
  )

  const comparativo = [
    { nome: 'Receita líq.', realizado: dre.realizado.receitaLiquida, orcado: dre.orcado.receitaLiquida },
    { nome: 'Lucro bruto', realizado: dre.realizado.lucroBruto, orcado: dre.orcado.lucroBruto },
    { nome: 'EBITDA', realizado: dre.realizado.ebitda, orcado: dre.orcado.ebitda },
    { nome: 'Result. líq.', realizado: dre.realizado.resultadoLiquido, orcado: dre.orcado.resultadoLiquido },
  ]

  const desvios = useMemo(
    () =>
      dre.linhas
        .filter((l) => l.orcado !== 0 || l.realizado !== 0)
        .map((l) => ({
          rotulo: l.rotulo,
          sinal: l.sinal,
          desvio: l.realizado - l.orcado,
          pct: l.orcado !== 0 ? ((l.realizado - l.orcado) / l.orcado) * 100 : null,
        }))
        .filter((d) => Math.abs(d.desvio) >= 0.005)
        .sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio))
        .slice(0, 5),
    [dre],
  )

  if (estado.lancamentos.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-12">
        <Cabecalho competencia={competencia} competencias={[]} setComp={setComp} />
        <p className="text-muted">
          Ainda não há dados. Vá em <strong className="text-ink">Lançamentos</strong> e sincronize
          o Safragold para o relatório ganhar vida.
        </p>
      </div>
    )
  }

  const R = dre.realizado
  const O = dre.orcado
  const figuras = [
    { rotulo: 'Resultado líquido', valor: R.resultadoLiquido, orcado: O.resultadoLiquido, margem: margem(R.resultadoLiquido, R.receitaLiquida), lead: true },
    { rotulo: 'Receita líquida', valor: R.receitaLiquida, orcado: O.receitaLiquida, margem: null },
    { rotulo: 'Lucro bruto', valor: R.lucroBruto, orcado: O.lucroBruto, margem: margem(R.lucroBruto, R.receitaLiquida) },
    { rotulo: 'EBITDA', valor: R.ebitda, orcado: O.ebitda, margem: margem(R.ebitda, R.receitaLiquida) },
  ]

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <Cabecalho competencia={competencia} competencias={competencias} setComp={setComp} />

      {/* Faixa de indicadores (key figures) */}
      <div className="mb-12 grid grid-cols-2 divide-line border-y border-line md:grid-cols-4 md:divide-x">
        {figuras.map((f) => {
          const desvio = f.valor - f.orcado
          return (
            <div key={f.rotulo} className="animate-rise px-5 py-6">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
                {f.rotulo}
              </div>
              <div
                className={`mt-2 font-head text-[26px] font-bold leading-none tabular-nums ${
                  f.lead ? 'text-green' : 'text-ink'
                }`}
              >
                {formatBRL(f.valor)}
              </div>
              <div className="mt-2 flex flex-col gap-0.5 text-[11px]">
                {f.margem != null && (
                  <span className="text-muted">margem {formatPct(f.margem)}</span>
                )}
                {temOrcamento && f.orcado !== 0 && (
                  <span className={desvio >= 0 ? 'text-green' : 'text-danger'}>
                    {desvio >= 0 ? '▲' : '▼'} {formatBRL(Math.abs(desvio))} vs. orçado
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {dre.naoClassificado > 0 && (
        <p className="mb-10 border-l-2 border-warn pl-4 text-sm text-gold-deep">
          <strong>{formatBRL(dre.naoClassificado)}</strong> em {dre.naoClassificadas.length}{' '}
          conta(s) sem classificação — ainda fora do resultado.
        </p>
      )}

      {/* Evolução */}
      <Secao titulo="Evolução — receita e resultado">
        {serie.length < 2 ? (
          <p className="py-8 text-sm text-faint">A evolução aparece com dados de 2+ competências.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={serie} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CORES.verde} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={CORES.verde} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#efe6d1" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} width={62} />
                <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} contentStyle={tooltipStyle} />
                <Area dataKey="receitaLiquida" name="Receita líquida" stroke={CORES.verde} strokeWidth={2} fill="url(#areaR)" isAnimationActive={false} />
                <Line dataKey="resultadoLiquido" name="Resultado líquido" stroke={CORES.dourado} strokeWidth={2} dot={{ r: 2.5, fill: CORES.dourado }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <Legendas />
          </>
        )}
      </Secao>

      {/* Realizado x Orçado */}
      <Secao titulo="Realizado × Orçado">
        {!temOrcamento ? (
          <p className="py-8 text-sm text-faint">
            Monte o orçamento em <strong className="text-muted">Orçamento</strong> para comparar.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={comparativo} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={3}>
                <CartesianGrid stroke="#efe6d1" vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} width={62} />
                <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} cursor={{ fill: 'rgba(15,122,73,0.05)' }} contentStyle={tooltipStyle} />
                <Bar dataKey="realizado" name="Realizado" fill={CORES.verde} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
                <Bar dataKey="orcado" name="Orçado" fill={CORES.dourado} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <Legendas rotuloA="Realizado" rotuloB="Orçado" />
          </>
        )}
      </Secao>

      {/* Maiores desvios */}
      {temOrcamento && desvios.length > 0 && (
        <Secao titulo="Maiores desvios do mês">
          <div className="flex flex-col">
            {desvios.map((d) => {
              const bom = d.sinal === 1 ? d.desvio > 0 : d.desvio < 0
              return (
                <div key={d.rotulo} className="flex items-center justify-between gap-3 border-b border-line/60 py-3 last:border-0">
                  <span className="text-sm text-ink">{d.rotulo}</span>
                  <span className={`font-head text-sm font-semibold tabular-nums ${bom ? 'text-green' : 'text-danger'}`}>
                    {formatBRL(d.desvio)}
                    {d.pct != null && <span className="ml-1 text-xs font-normal opacity-70">({formatPct(d.pct)})</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </Secao>
      )}
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mb-12">
      <div className="mb-5">
        <h2 className="font-head text-sm font-semibold uppercase tracking-[0.16em] text-ink">
          {titulo}
        </h2>
        <span className="mt-2 block h-[3px] w-10 bg-gold" />
      </div>
      {children}
    </section>
  )
}

function Legendas({ rotuloA = 'Receita líquida', rotuloB = 'Resultado líquido' }: { rotuloA?: string; rotuloB?: string }) {
  return (
    <div className="mt-3 flex items-center gap-5 text-[11px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: CORES.verde }} />
        {rotuloA}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: CORES.dourado }} />
        {rotuloB}
      </span>
    </div>
  )
}

function Cabecalho({
  competencia,
  competencias,
  setComp,
}: {
  competencia: string
  competencias: string[]
  setComp: (c: string) => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <Kicker>Visão geral · {rotuloCompetencia(competencia)}</Kicker>
          <h1 className="mt-2 font-head text-4xl font-bold tracking-tight text-ink">
            Dashboard <span className="text-green">financeiro</span>
          </h1>
        </div>
        {competencias.length > 0 && (
          <div className="w-44">
            <span className="mb-1 block text-xs font-medium text-muted">Competência</span>
            <Select
              value={competencia}
              onChange={setComp}
              options={competencias.map((c) => ({ value: c, label: rotuloCompetencia(c) }))}
            />
          </div>
        )}
      </div>
      <span className="mb-10 mt-4 block h-[3px] w-14 bg-gold" />
    </>
  )
}
