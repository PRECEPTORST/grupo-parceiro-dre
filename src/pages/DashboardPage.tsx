import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { useDre } from '../context/DreContext'
import { Card, Kicker, Select } from '../components/ui'
import { formatBRL, formatBRLCompact, formatPct } from '../lib/format'
import {
  montarDre,
  mapaDeClassificacoes,
  competenciasDisponiveis,
  type DreMensal,
} from '../lib/dre'

const CORES = { verde: '#0f7a49', dourado: '#cd8d05', limao: '#8ca81e', tinta: '#23281f' }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloCompetencia(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`
}
function margem(parte: number, base: number): number | null {
  return base > 0 ? (parte / base) * 100 : null
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

  // Série mensal (ascendente) para a evolução.
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

  // Realizado x Orçado dos subtotais-chave.
  const comparativo = [
    { nome: 'Receita líq.', realizado: dre.realizado.receitaLiquida, orcado: dre.orcado.receitaLiquida },
    { nome: 'Lucro bruto', realizado: dre.realizado.lucroBruto, orcado: dre.orcado.lucroBruto },
    { nome: 'EBITDA', realizado: dre.realizado.ebitda, orcado: dre.orcado.ebitda },
    { nome: 'Result. líq.', realizado: dre.realizado.resultadoLiquido, orcado: dre.orcado.resultadoLiquido },
  ]

  // Maiores desvios por linha (quando há orçamento).
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
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Cabecalho competencias={[]} competencia={competencia} setComp={setComp} />
        <Card className="animate-rise">
          <p className="text-muted">
            Ainda não há dados. Vá em <strong className="text-ink">Lançamentos</strong> e sincronize
            o Safragold para o dashboard ganhar vida.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Cabecalho competencias={competencias} competencia={competencia} setComp={setComp} />

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi i={0} rotulo="Receita líquida" valor={dre.realizado.receitaLiquida} dre={dre} chave="receitaLiquida" temOrcamento={temOrcamento} />
        <Kpi i={1} rotulo="Lucro bruto" valor={dre.realizado.lucroBruto} dre={dre} chave="lucroBruto" margemBase={dre.realizado.receitaLiquida} temOrcamento={temOrcamento} />
        <Kpi i={2} rotulo="EBITDA" valor={dre.realizado.ebitda} dre={dre} chave="ebitda" margemBase={dre.realizado.receitaLiquida} temOrcamento={temOrcamento} />
        <Kpi i={3} rotulo="Resultado líquido" valor={dre.realizado.resultadoLiquido} dre={dre} chave="resultadoLiquido" margemBase={dre.realizado.receitaLiquida} temOrcamento={temOrcamento} destaque />
      </div>

      {dre.naoClassificado > 0 && (
        <Card className="mb-4 animate-rise border-warn/40 bg-warn/5">
          <p className="text-sm text-gold-deep">
            <strong>{formatBRL(dre.naoClassificado)}</strong> em {dre.naoClassificadas.length}{' '}
            conta(s) sem classificação — ainda fora do DRE. Resolva em <strong>Lançamentos</strong>.
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Evolução */}
        <Card className="animate-rise">
          <h2 className="mb-3 font-head text-sm font-semibold uppercase tracking-wider text-muted">
            Evolução do resultado
          </h2>
          {serie.length < 2 ? (
            <p className="py-8 text-center text-sm text-faint">
              A evolução aparece com dados de 2+ competências.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={serie} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#ece1c8" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#6e6a5c' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: '#6e6a5c' }} axisLine={false} tickLine={false} width={64} />
                <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="receitaLiquida" name="Receita líquida" fill={CORES.verde} radius={[4, 4, 0, 0]} maxBarSize={38} isAnimationActive={false} />
                <Line dataKey="resultadoLiquido" name="Resultado líquido" stroke={CORES.dourado} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Realizado x Orçado */}
        <Card className="animate-rise">
          <h2 className="mb-3 font-head text-sm font-semibold uppercase tracking-wider text-muted">
            Realizado × Orçado
          </h2>
          {!temOrcamento ? (
            <p className="py-8 text-center text-sm text-faint">
              Monte o orçamento da competência em <strong className="text-muted">Orçamento</strong>{' '}
              para comparar.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={comparativo} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#ece1c8" vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 11, fill: '#6e6a5c' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: '#6e6a5c' }} axisLine={false} tickLine={false} width={64} />
                <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="realizado" name="Realizado" fill={CORES.verde} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                <Bar dataKey="orcado" name="Orçado" fill={CORES.dourado} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Maiores desvios */}
      {temOrcamento && desvios.length > 0 && (
        <Card className="mt-4 animate-rise">
          <h2 className="mb-3 font-head text-sm font-semibold uppercase tracking-wider text-muted">
            Maiores desvios do mês
          </h2>
          <div className="flex flex-col gap-2">
            {desvios.map((d) => {
              const bom = d.sinal === 1 ? d.desvio > 0 : d.desvio < 0
              return (
                <div key={d.rotulo} className="flex items-center justify-between gap-3 border-b border-line/60 pb-2 last:border-0">
                  <span className="text-sm text-ink">{d.rotulo}</span>
                  <span className={`text-sm font-semibold tabular-nums ${bom ? 'text-green' : 'text-danger'}`}>
                    {formatBRL(d.desvio)}
                    {d.pct != null && <span className="ml-1 text-xs opacity-70">({formatPct(d.pct)})</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

const tooltipStyle = {
  borderRadius: 10,
  border: '1px solid #ece1c8',
  fontSize: 12,
  boxShadow: '0 8px 24px -12px rgba(35,40,31,0.25)',
}

function Cabecalho({
  competencias,
  competencia,
  setComp,
}: {
  competencias: string[]
  competencia: string
  setComp: (c: string) => void
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div>
        <Kicker>Visão geral</Kicker>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
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
  )
}

function Kpi({
  rotulo,
  valor,
  dre,
  chave,
  margemBase,
  temOrcamento,
  destaque = false,
  i,
}: {
  rotulo: string
  valor: number
  dre: DreMensal
  chave: keyof DreMensal['realizado']
  margemBase?: number
  temOrcamento: boolean
  destaque?: boolean
  i: number
}) {
  const orcado = dre.orcado[chave]
  const desvio = valor - orcado
  const m = margemBase != null ? margem(valor, margemBase) : null
  return (
    <div
      className={`animate-rise rounded-xl border p-4 ${destaque ? 'border-green/30 bg-green/5' : 'border-line bg-surface'}`}
      style={{ animationDelay: `${i * 60}ms` }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">{rotulo}</div>
      <div className={`mt-1 font-head text-xl font-semibold tabular-nums ${destaque ? 'text-green' : 'text-ink'}`}>
        {formatBRL(valor)}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px]">
        {m != null && <span className="text-muted">margem {formatPct(m)}</span>}
        {temOrcamento && orcado !== 0 && (
          <span className={desvio >= 0 ? 'text-green' : 'text-danger'}>
            {desvio >= 0 ? '▲' : '▼'} {formatBRL(Math.abs(desvio))} vs orçado
          </span>
        )}
      </div>
    </div>
  )
}
