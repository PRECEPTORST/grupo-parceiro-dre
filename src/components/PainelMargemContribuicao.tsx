import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { Card } from './ui'
import { formatBRL, formatPct } from '../lib/format'
import { useDre } from '../context/DreContext'
import { useAuth } from '../context/AuthContext'
import { podeAdministrar } from '../lib/permissoes'
import type { PontoMC } from '../lib/margemContribuicao'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloComp(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano.slice(2)}`
}

const OURO = '#cd8d05'
const tooltipStyle = { borderRadius: 12, border: '1px solid #ece1c8', fontSize: 12 }

function TooltipMC({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as { rotulo: string; mc: number; mcPct: number | null }
  return (
    <div style={tooltipStyle} className="bg-surface px-3 py-2 shadow-md">
      <div className="mb-0.5 font-semibold text-ink">{p.rotulo}</div>
      <div className="tabular-nums text-muted">
        {formatBRL(p.mc)}
        {p.mcPct != null && <span className="ml-1 text-gold-deep">({formatPct(p.mcPct)})</span>}
      </div>
    </div>
  )
}

/**
 * Painel de MARGEM DE CONTRIBUIÇÃO (receita líquida − custo): duas caixas (valor
 * R$ e % da receita) do mês selecionado + gráfico de evolução (% ao longo dos
 * meses, valor em R$ no tooltip). Reutilizado no Dashboard e no DRE.
 */
export function PainelMargemContribuicao({
  serie,
  competencia,
}: {
  serie: PontoMC[]
  competencia: string
}) {
  const { estado, salvarMcIncluirComerciais } = useDre()
  const { usuario } = useAuth()
  const podeEditar = podeAdministrar(usuario?.papel)
  const incluir = estado.mcIncluirComerciais ?? false

  const atual = serie.find((p) => p.competencia === competencia) ?? serie[serie.length - 1]
  const dados = serie.map((p) => ({ rotulo: rotuloComp(p.competencia), mc: p.mc, mcPct: p.mcPct ?? 0 }))

  return (
    <Card className="animate-rise">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-head text-sm font-semibold uppercase tracking-wider text-muted">
            Margem de contribuição
          </h2>
          <span className="text-[11px] text-faint">
            receita − custo{incluir ? ' − desp. comerciais' : ''} · {atual ? rotuloComp(atual.competencia) : ''}
          </span>
        </div>
        {podeEditar && (
          <div className="inline-flex rounded-lg border border-line p-0.5 text-[11px] font-semibold">
            <button
              onClick={() => salvarMcIncluirComerciais(false)}
              className={`rounded-md px-2 py-1 transition-colors ${!incluir ? 'bg-green text-white' : 'text-muted hover:bg-cream'}`}
            >
              Só CPV
            </button>
            <button
              onClick={() => salvarMcIncluirComerciais(true)}
              className={`rounded-md px-2 py-1 transition-colors ${incluir ? 'bg-green text-white' : 'text-muted hover:bg-cream'}`}
            >
              CPV + comerciais
            </button>
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-green/30 bg-green/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Valor</div>
          <div className="mt-1 font-head text-2xl font-semibold tabular-nums text-green">
            {formatBRL(atual?.mc ?? 0)}
          </div>
        </div>
        <div className="rounded-xl border border-gold/30 bg-gold/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">% da receita</div>
          <div className="mt-1 font-head text-2xl font-semibold tabular-nums text-gold-deep">
            {atual?.mcPct != null ? formatPct(atual.mcPct) : '—'}
          </div>
        </div>
      </div>

      {serie.length < 2 ? (
        <p className="py-8 text-center text-sm text-faint">
          A evolução aparece com dados de 2+ competências.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={dados} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="areaMC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={OURO} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={OURO} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#efe6d1" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 11, fill: '#8a8472' }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip content={<TooltipMC />} />
              <Area
                dataKey="mcPct"
                name="Margem de contribuição"
                stroke={OURO}
                strokeWidth={2.5}
                fill="url(#areaMC)"
                dot={{ r: 3, fill: OURO }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-1 text-[11px] text-faint">Margem de contribuição (%) por mês — valor em R$ no tooltip.</p>
        </>
      )}
    </Card>
  )
}
