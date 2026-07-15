import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { Card, Kicker, Select } from '../components/ui'
import { formatBRL, formatPct } from '../lib/format'
import {
  montarDre,
  mapaDeClassificacoes,
  competenciasDisponiveis,
  type LinhaResultado,
  type Subtotais,
} from '../lib/dre'
import type { LinhaDRE } from '../lib/tipos'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloCompetencia(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`
}

// Subtotais inseridos DEPOIS de cada linha-chave, na ordem do DRE.
const SUBTOTAIS_APOS: Partial<Record<LinhaDRE, { chave: keyof Subtotais; rotulo: string; forte?: boolean }[]>> =
  {
    deducoes: [{ chave: 'receitaLiquida', rotulo: 'Receita líquida' }],
    custo_produto: [{ chave: 'lucroBruto', rotulo: 'Lucro bruto' }],
    depreciacao_amortizacao: [
      { chave: 'resultadoOperacional', rotulo: 'Resultado operacional (EBIT)' },
      { chave: 'ebitda', rotulo: 'EBITDA' },
    ],
    despesa_financeira: [{ chave: 'resultadoAntesIr', rotulo: 'Resultado antes do IR' }],
    impostos_lucro: [{ chave: 'resultadoLiquido', rotulo: 'Resultado líquido', forte: true }],
  }

function corDesvio(sinal: 1 | -1, desvio: number): string {
  if (Math.abs(desvio) < 0.005) return 'text-muted'
  const bom = sinal === 1 ? desvio > 0 : desvio < 0
  return bom ? 'text-green' : 'text-danger'
}

export function DrePage() {
  const { estado } = useDre()
  const competencias = useMemo(
    () => competenciasDisponiveis(estado.lancamentos),
    [estado.lancamentos],
  )
  const [comp, setComp] = useState<string>(() => competencias[0] ?? new Date().toISOString().slice(0, 7))
  const competencia = competencias.includes(comp) ? comp : (competencias[0] ?? comp)

  const mapa = useMemo(() => mapaDeClassificacoes(estado.classificacoes), [estado.classificacoes])
  const orcamento = estado.orcamentos.find((o) => o.competencia === competencia) ?? null
  const dre = useMemo(
    () => montarDre(competencia, estado.lancamentos, mapa, orcamento),
    [competencia, estado.lancamentos, mapa, orcamento],
  )
  const temOrcamento = !!orcamento

  const [recolhidas, setRecolhidas] = useState<Set<LinhaDRE>>(new Set())
  const toggle = (l: LinhaDRE) =>
    setRecolhidas((s) => {
      const n = new Set(s)
      if (n.has(l)) n.delete(l)
      else n.add(l)
      return n
    })
  const todasRecolhidas = recolhidas.size === dre.linhas.filter((l) => l.contas.length).length
  const alternarTodas = () =>
    setRecolhidas(todasRecolhidas ? new Set() : new Set(dre.linhas.map((l) => l.linha)))

  const semDados = estado.lancamentos.length === 0

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <Kicker>DRE em tempo real</Kicker>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
            Demonstração do <span className="text-green">Resultado</span>
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

      {semDados ? (
        <Card className="animate-rise">
          <p className="text-muted">
            Nenhum lançamento ainda. Vá em <strong className="text-ink">Lançamentos</strong> e
            sincronize com o Safragold para gerar o DRE.
          </p>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard i={0} rotulo="Receita líquida" valor={dre.realizado.receitaLiquida} />
            <StatCard i={1} rotulo="Lucro bruto" valor={dre.realizado.lucroBruto} />
            <StatCard i={2} rotulo="EBITDA" valor={dre.realizado.ebitda} />
            <StatCard
              i={3}
              rotulo="Resultado líquido"
              valor={dre.realizado.resultadoLiquido}
              destaque
            />
          </div>

          {dre.naoClassificado > 0 && (
            <Card className="mb-4 animate-rise border-warn/40 bg-warn/5">
              <p className="text-sm text-gold-deep">
                <strong>{formatBRL(dre.naoClassificado)}</strong> em{' '}
                {dre.naoClassificadas.length} conta(s) sem classificação — ainda não entram no DRE.
                Classifique em <strong>Lançamentos</strong>.
              </p>
            </Card>
          )}

          <Card className="animate-rise overflow-hidden p-0" >
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <span className="font-head text-sm font-semibold uppercase tracking-wider text-muted">
                {rotuloCompetencia(competencia)}
              </span>
              <button
                onClick={alternarTodas}
                className="text-xs font-semibold text-green transition hover:text-green-deep"
              >
                {todasRecolhidas ? 'Expandir tudo' : 'Recolher tudo'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                    <th className="py-2 pl-5 pr-4 font-semibold">Conta</th>
                    <th className="py-2 px-4 text-right font-semibold">Realizado</th>
                    {temOrcamento && <th className="py-2 px-4 text-right font-semibold">Orçado</th>}
                    {temOrcamento && (
                      <th className="py-2 pr-5 pl-4 text-right font-semibold">Desvio</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dre.linhas.map((l) => (
                    <LinhaGrupo
                      key={l.linha}
                      linha={l}
                      temOrcamento={temOrcamento}
                      recolhida={recolhidas.has(l.linha)}
                      onToggle={() => toggle(l.linha)}
                      subtotais={SUBTOTAIS_APOS[l.linha]}
                      dreRealizado={dre.realizado}
                      dreOrcado={dre.orcado}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {!temOrcamento && (
            <p className="mt-3 text-xs text-faint">
              Sem orçamento para {rotuloCompetencia(competencia)}. Monte um em{' '}
              <strong className="text-muted">Orçamento</strong> para comparar e ver os desvios.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({
  rotulo,
  valor,
  destaque = false,
  i,
}: {
  rotulo: string
  valor: number
  destaque?: boolean
  i: number
}) {
  return (
    <div
      className={`animate-rise rounded-xl border p-4 ${
        destaque ? 'border-green/30 bg-green/5' : 'border-line bg-surface'
      }`}
      style={{ animationDelay: `${i * 60}ms` }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">{rotulo}</div>
      <div
        className={`mt-1 font-head text-xl font-semibold tabular-nums ${
          destaque ? 'text-green' : 'text-ink'
        }`}
      >
        {formatBRL(valor)}
      </div>
    </div>
  )
}

function LinhaGrupo({
  linha,
  temOrcamento,
  recolhida,
  onToggle,
  subtotais,
  dreRealizado,
  dreOrcado,
}: {
  linha: LinhaResultado
  temOrcamento: boolean
  recolhida: boolean
  onToggle: () => void
  subtotais?: { chave: keyof Subtotais; rotulo: string; forte?: boolean }[]
  dreRealizado: Subtotais
  dreOrcado: Subtotais
}) {
  const temContas = linha.contas.length > 0
  const desvio = linha.realizado - linha.orcado
  const pct = linha.orcado !== 0 ? (desvio / linha.orcado) * 100 : null

  return (
    <>
      {/* Cabeçalho da linha do DRE */}
      <tr
        className={`border-b border-line/70 ${temContas ? 'cursor-pointer hover:bg-cream/60' : ''}`}
        onClick={temContas ? onToggle : undefined}
      >
        <td className="py-2.5 pl-5 pr-4">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            {temContas && (
              <span
                className={`inline-block text-faint transition-transform ${recolhida ? '' : 'rotate-90'}`}
              >
                ▸
              </span>
            )}
            {linha.rotulo}
            {temContas && (
              <span className="text-[11px] font-normal text-faint">({linha.contas.length})</span>
            )}
          </span>
        </td>
        <td className="py-2.5 px-4 text-right font-medium tabular-nums text-ink">
          {formatBRL(linha.realizado)}
        </td>
        {temOrcamento && (
          <td className="py-2.5 px-4 text-right tabular-nums text-muted">
            {linha.orcado ? formatBRL(linha.orcado) : '—'}
          </td>
        )}
        {temOrcamento && (
          <td className={`py-2.5 pr-5 pl-4 text-right tabular-nums ${corDesvio(linha.sinal, desvio)}`}>
            {linha.orcado ? (
              <>
                {formatBRL(desvio)}
                {pct != null && <span className="ml-1 text-[11px] opacity-70">({formatPct(pct)})</span>}
              </>
            ) : (
              '—'
            )}
          </td>
        )}
      </tr>

      {/* Contas da linha */}
      {!recolhida &&
        linha.contas.map((c) => {
          const d = c.realizado - c.orcado
          return (
            <tr key={c.conta} className="animate-fade border-b border-line/40 bg-cream/30">
              <td className="py-1.5 pl-11 pr-4">
                <span className="font-mono text-xs text-muted">{c.conta}</span>
                {c.descricao && <span className="ml-2 text-xs text-faint">{c.descricao}</span>}
              </td>
              <td className="py-1.5 px-4 text-right text-xs tabular-nums text-muted">
                {formatBRL(c.realizado)}
              </td>
              {temOrcamento && (
                <td className="py-1.5 px-4 text-right text-xs tabular-nums text-faint">
                  {c.orcado ? formatBRL(c.orcado) : '—'}
                </td>
              )}
              {temOrcamento && (
                <td className={`py-1.5 pr-5 pl-4 text-right text-xs tabular-nums ${corDesvio(linha.sinal, d)}`}>
                  {c.orcado ? formatBRL(d) : '—'}
                </td>
              )}
            </tr>
          )
        })}

      {/* Subtotais após esta linha */}
      {subtotais?.map((s) => {
        const r = dreRealizado[s.chave]
        const o = dreOrcado[s.chave]
        return (
          <tr
            key={s.chave}
            className={s.forte ? 'bg-green/8 border-y-2 border-green/30' : 'bg-cream/70 border-b border-line'}
          >
            <td
              className={`py-2 pl-5 pr-4 font-head font-semibold uppercase tracking-wide ${
                s.forte ? 'text-green' : 'text-ink'
              }`}
            >
              = {s.rotulo}
            </td>
            <td
              className={`py-2 px-4 text-right font-semibold tabular-nums ${s.forte ? 'text-green' : 'text-ink'}`}
            >
              {formatBRL(r)}
            </td>
            {temOrcamento && (
              <td className="py-2 px-4 text-right font-medium tabular-nums text-muted">
                {formatBRL(o)}
              </td>
            )}
            {temOrcamento && (
              <td className="py-2 pr-5 pl-4 text-right font-medium tabular-nums text-muted">
                {formatBRL(r - o)}
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
}
