import { useMemo, useState, useEffect } from 'react'
import { useDre } from '../context/DreContext'
import { useAuth } from '../context/AuthContext'
import { podeAdministrar } from '../lib/permissoes'
import { Card, Kicker, Select, NumInput, Field } from '../components/ui'
import { formatBRL } from '../lib/format'
import { competenciasDisponiveis } from '../lib/dre'
import { mapaEfetivo } from '../lib/planoContas'
import { analisarConfiabilidade, type AchadoConfiabilidade, type Severidade } from '../lib/confiabilidade'
import { LINHAS_DRE, META_LINHAS, configConfiabilidadePadrao, type LinhaDRE } from '../lib/tipos'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloCompetencia(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`
}
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const ESTILO_SEV: Record<Severidade, { rotulo: string; texto: string; ponto: string; borda: string }> = {
  alta: { rotulo: 'Alta', texto: 'text-danger', ponto: 'bg-danger', borda: 'border-danger/40' },
  media: { rotulo: 'Média', texto: 'text-gold-deep', ponto: 'bg-gold', borda: 'border-warn/40' },
  baixa: { rotulo: 'Baixa', texto: 'text-muted', ponto: 'bg-faint', borda: 'border-line' },
}

export function ConfiabilidadePage() {
  const { estado, salvarClassificacoes, salvarConfigConfiabilidade } = useDre()
  const { usuario } = useAuth()
  const podeAgir = podeAdministrar(usuario?.papel)

  const competencias = useMemo(
    () => competenciasDisponiveis(estado.lancamentos),
    [estado.lancamentos],
  )
  const [comp, setComp] = useState<string>(() => competencias[0] ?? new Date().toISOString().slice(0, 7))
  const competencia = competencias.includes(comp) ? comp : (competencias[0] ?? comp)

  const config = estado.confiabilidade ?? configConfiabilidadePadrao()
  const mapa = useMemo(() => mapaEfetivo(estado.classificacoes), [estado.classificacoes])

  const relatorio = useMemo(
    () =>
      analisarConfiabilidade(competencia, estado.lancamentos, estado.classificacoes, mapa, {
        pisoMaterialidade: config.pisoMaterialidade,
        hoje: hojeISO(),
      }),
    [competencia, estado.lancamentos, estado.classificacoes, mapa, config.pisoMaterialidade],
  )

  const [soMateriais, setSoMateriais] = useState(true)
  const ignorados = new Set(config.ignorados)
  const ativos = relatorio.achados.filter((a) => !ignorados.has(a.id) && (!soMateriais || a.material))
  const ignoradosLista = relatorio.achados.filter((a) => ignorados.has(a.id))

  const setPiso = (v: number) =>
    salvarConfigConfiabilidade({ ...config, pisoMaterialidade: Math.max(0, v) })
  const ignorar = (id: string) =>
    salvarConfigConfiabilidade({ ...config, ignorados: [...new Set([...config.ignorados, id])] })
  const reativar = (id: string) =>
    salvarConfigConfiabilidade({ ...config, ignorados: config.ignorados.filter((x) => x !== id) })
  const reclassificar = (conta: string, linha: LinhaDRE) =>
    salvarClassificacoes([
      { contaSafragold: conta, linha, confianca: 1, justificativa: 'Confirmado na Confiabilidade' },
    ])

  if (estado.lancamentos.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-8">
        <Cabecalho />
        <Card className="animate-rise">
          <p className="text-muted">
            Ainda não há lançamentos. Sincronize em{' '}
            <strong className="text-ink">Lançamentos</strong> para o motor analisar a confiabilidade.
          </p>
        </Card>
      </div>
    )
  }

  const idx = relatorio.indiceConfianca
  const corIdx = idx >= 90 ? 'text-green' : idx >= 70 ? 'text-gold-deep' : 'text-danger'
  const corBarra = idx >= 90 ? 'bg-green' : idx >= 70 ? 'bg-gold' : 'bg-danger'

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <Cabecalho />
        <div className="w-44">
          <span className="mb-1 block text-xs font-medium text-muted">Competência</span>
          <Select
            value={competencia}
            onChange={setComp}
            options={competencias.map((c) => ({ value: c, label: rotuloCompetencia(c) }))}
          />
        </div>
      </div>

      {/* Índice de confiança */}
      <div className="mb-4 animate-rise overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(35,40,31,0.04),0_16px_40px_-24px_rgba(35,40,31,0.25)]">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="font-head text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Índice de confiança · {rotuloCompetencia(competencia)}
            </div>
            <div className={`mt-1 font-head text-5xl font-bold tracking-tight ${corIdx}`}>{idx}%</div>
            <div className="mt-2 text-sm text-muted">
              <strong className="text-ink">{formatBRL(relatorio.valorEmRevisao)}</strong> em revisão de{' '}
              {formatBRL(relatorio.totalMovimento)} movimentados ·{' '}
              <strong className={relatorio.materiais ? 'text-gold-deep' : 'text-green'}>
                {relatorio.materiais} achado(s) material(is)
              </strong>
            </div>
          </div>
          <div className="w-full max-w-[220px] flex-1">
            <div className="h-3 w-full overflow-hidden rounded-full bg-cream">
              <div className={`h-full rounded-full ${corBarra}`} style={{ width: `${idx}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Materialidade + resumo IA */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[220px_1fr]">
        <Card className="animate-rise">
          <Field label="Piso de materialidade (R$)" hint="Achados abaixo disso são imateriais.">
            <NumInput value={config.pisoMaterialidade} onChange={(v) => setPiso(v ?? 0)} min={0} disabled={!podeAgir} />
          </Field>
          <label className="mt-3 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={soMateriais} onChange={(e) => setSoMateriais(e.target.checked)} />
            Mostrar só materiais
          </label>
        </Card>
        <ResumoIA relatorio={relatorio} achados={ativos} competencia={competencia} />
      </div>

      {/* Achados */}
      {ativos.length === 0 ? (
        <Card className="animate-rise border-green/30 bg-green/5">
          <p className="text-sm text-green">
            ✓ Nenhum achado {soMateriais ? 'material ' : ''}pendente em {rotuloCompetencia(competencia)}. O DRE está confiável.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {ativos.map((a) => (
            <AchadoCard
              key={a.id}
              achado={a}
              podeAgir={podeAgir}
              onIgnorar={() => ignorar(a.id)}
              onReclassificar={(linha) => a.conta && reclassificar(a.conta, linha)}
            />
          ))}
        </div>
      )}

      {ignoradosLista.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-medium text-muted">
            {ignoradosLista.length} achado(s) ignorado(s)
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {ignoradosLista.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-cream/40 px-3 py-2 text-sm">
                <span className="text-muted line-through">{a.titulo}</span>
                {podeAgir && (
                  <button onClick={() => reativar(a.id)} className="text-xs font-semibold text-green hover:text-green-deep">
                    Reativar
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="mt-4 text-xs text-faint">
        Análise determinística sobre os lançamentos de {rotuloCompetencia(competencia)} — mesmas regras,
        mesmo resultado. O resumo é gerado por IA a partir dos achados; a detecção nunca depende do modelo.
      </p>
    </div>
  )
}

function AchadoCard({
  achado,
  podeAgir,
  onIgnorar,
  onReclassificar,
}: {
  achado: AchadoConfiabilidade
  podeAgir: boolean
  onIgnorar: () => void
  onReclassificar: (linha: LinhaDRE) => void
}) {
  const e = ESTILO_SEV[achado.severidade]
  const podeReclassificar =
    podeAgir && !!achado.conta && (achado.tipo === 'nao_classificada' || achado.tipo === 'baixa_confianca')
  return (
    <Card className={`animate-rise ${e.borda}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-2.5">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${e.ponto}`} />
          <div>
            <div className="text-sm font-semibold text-ink">
              {achado.titulo}{' '}
              <span className={`text-[11px] font-medium uppercase tracking-wide ${e.texto}`}>· {e.rotulo}</span>
              {!achado.material && <span className="ml-1 text-[11px] text-faint">(imaterial)</span>}
            </div>
            <div className="mt-0.5 text-sm text-muted">{achado.detalhe}</div>
            <div className="mt-1 text-[11px] text-faint">→ {achado.acao}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-head text-lg font-semibold tabular-nums text-ink">{formatBRL(achado.valor)}</div>
        </div>
      </div>

      {podeAgir && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {podeReclassificar && (
            <div className="w-56">
              <Select
                value=""
                onChange={(v) => v && onReclassificar(v as LinhaDRE)}
                options={[
                  { value: '', label: 'Classificar nesta linha…' },
                  ...LINHAS_DRE.map((l) => ({ value: l, label: META_LINHAS[l].rotulo })),
                ]}
              />
            </div>
          )}
          <button
            onClick={onIgnorar}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-cream hover:text-ink"
          >
            Ignorar
          </button>
        </div>
      )}
    </Card>
  )
}

interface Resumo {
  resumo: string
  prioridades: string[]
}
function ResumoIA({
  relatorio,
  achados,
  competencia,
}: {
  relatorio: ReturnType<typeof analisarConfiabilidade>
  achados: AchadoConfiabilidade[]
  competencia: string
}) {
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setResumo(null)
    setErro(null)
  }, [competencia])

  const gerar = async () => {
    setCarregando(true)
    setErro(null)
    try {
      const resp = await fetch('/api/resumo-confiabilidade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          competencia,
          indiceConfianca: relatorio.indiceConfianca,
          valorEmRevisao: relatorio.valorEmRevisao,
          totalMovimento: relatorio.totalMovimento,
          achados: achados
            .filter((a) => a.material)
            .map((a) => ({ tipo: a.tipo, severidade: a.severidade, titulo: a.titulo, valor: a.valor, detalhe: a.detalhe })),
        }),
      })
      const d = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(d?.erro || `Erro ${resp.status}`)
      setResumo({ resumo: d.resumo ?? '', prioridades: d.prioridades ?? [] })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Card className="animate-rise border-green/20 bg-gradient-to-br from-green/[0.05] to-surface">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-head text-sm font-semibold uppercase tracking-wider text-green">
          <span>✦</span> Resumo da confiabilidade
        </h2>
        <button
          onClick={gerar}
          disabled={carregando}
          className="rounded-lg bg-green px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-green-deep active:scale-[0.97] disabled:opacity-50"
        >
          {carregando ? 'Analisando…' : resumo ? 'Atualizar' : 'Gerar resumo'}
        </button>
      </div>
      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}
      {!resumo && !carregando && !erro && (
        <p className="mt-3 text-sm text-muted">
          Peça uma leitura executiva: dá para confiar no DRE do mês e o que revisar primeiro.
        </p>
      )}
      {resumo && (
        <div className="mt-3 flex flex-col gap-3">
          {resumo.resumo && <p className="text-sm leading-relaxed text-ink">{resumo.resumo}</p>}
          {resumo.prioridades.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {resumo.prioridades.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink">
                  <span className="text-gold">→</span>
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

function Cabecalho() {
  return (
    <div className="animate-rise">
      <Kicker>Sanidade dos dados</Kicker>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
        Confiabilidade do <span className="text-green">DRE</span>
      </h1>
    </div>
  )
}
