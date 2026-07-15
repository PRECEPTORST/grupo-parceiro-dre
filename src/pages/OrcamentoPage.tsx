import { useMemo, useState, type ChangeEvent } from 'react'
import { useDre } from '../context/DreContext'
import { useAuth } from '../context/AuthContext'
import { podeEditarOrcamento, podeAprovarOrcamento } from '../lib/permissoes'
import { Botao, Card, Kicker, NumInput } from '../components/ui'
import { formatBRL } from '../lib/format'
import {
  META_LINHAS,
  orcamentoAprovado,
  type Orcamento,
  type OrigemOrcamento,
  type StatusOrcamento,
} from '../lib/tipos'
import { competenciasDisponiveis } from '../lib/dre'
import { catalogoPorLinha, mapaEfetivo } from '../lib/planoContas'
import { parsePlanilha, type ContaConhecida, type ResultadoImport } from '../lib/importar'

function competenciaAtual(): string {
  return new Date().toISOString().slice(0, 7)
}

export function OrcamentoPage() {
  const { estado, salvarOrcamento } = useDre()
  const { usuario } = useAuth()
  const podeEditar = podeEditarOrcamento(usuario?.papel)
  const podeAprovar = podeAprovarOrcamento(usuario?.papel)

  const competencias = useMemo(() => {
    const set = new Set<string>([
      competenciaAtual(),
      ...competenciasDisponiveis(estado.lancamentos),
      ...estado.orcamentos.map((o) => o.competencia),
    ])
    return [...set].sort().reverse()
  }, [estado.lancamentos, estado.orcamentos])

  // Abre na competência mais recente que já tem dados (lançamentos ou orçamento
  // salvo); só cai no mês atual se ainda não houver nada. Evita abrir num mês vazio.
  const competenciaComDados = useMemo(() => {
    const comDados = [
      ...competenciasDisponiveis(estado.lancamentos),
      ...estado.orcamentos.map((o) => o.competencia),
    ].sort()
    return comDados.length ? comDados[comDados.length - 1] : competenciaAtual()
  }, [estado.lancamentos, estado.orcamentos])

  const [comp, setComp] = useState<string>(competenciaComDados)
  const salvo = estado.orcamentos.find((o) => o.competencia === comp)

  const [valores, setValores] = useState<Record<string, number>>(() => salvo?.valores ?? {})
  const [origem, setOrigem] = useState(salvo?.origem ?? 'manual')
  const [sugerindo, setSugerindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [ultimaComp, setUltimaComp] = useState(comp)
  if (ultimaComp !== comp) {
    setUltimaComp(comp)
    const s = estado.orcamentos.find((o) => o.competencia === comp)
    setValores(s?.valores ?? {})
    setOrigem(s?.origem ?? 'manual')
  }

  const mapa = useMemo(() => mapaEfetivo(estado.classificacoes), [estado.classificacoes])
  const grupos = useMemo(
    () => catalogoPorLinha(estado.lancamentos, mapa),
    [estado.lancamentos, mapa],
  )
  const gruposComContas = grupos.filter((g) => g.contas.length > 0)

  const contasConhecidas = useMemo<ContaConhecida[]>(
    () => gruposComContas.flatMap((g) => g.contas.map((c) => ({ conta: c.conta, descricao: c.descricao }))),
    [gruposComContas],
  )
  const [importarAberto, setImportarAberto] = useState(false)

  const setConta = (conta: string, v: number | null) =>
    setValores((atual) => ({ ...atual, [conta]: v ?? 0 }))

  const aplicarImportacao = (vals: Record<string, number>, origemImport: OrigemOrcamento) => {
    setValores((atual) => ({ ...atual, ...vals }))
    setOrigem(origemImport)
    setImportarAberto(false)
  }

  // Enquanto não salvo, "sujo" = valores divergem do que está gravado.
  const alterado = JSON.stringify(valores) !== JSON.stringify(salvo?.valores ?? {})
  const aprovado = orcamentoAprovado(salvo) && !alterado

  const persistir = (status: StatusOrcamento) => {
    const agora = new Date().toISOString()
    const orcamento: Orcamento = {
      competencia: comp,
      valores,
      origem,
      atualizadoEm: agora,
      status,
      ...(status === 'aprovado'
        ? { aprovadoPor: usuario?.usuario, aprovadoEm: agora }
        : { aprovadoPor: undefined, aprovadoEm: undefined }),
    }
    salvarOrcamento(orcamento)
  }
  const salvar = () => persistir('rascunho')
  const aprovar = () => persistir('aprovado')

  const sugerir = async () => {
    setSugerindo(true)
    setErro(null)
    try {
      const resp = await fetch('/api/sugerir-orcamento', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          competencia: comp,
          historicoLancamentos: estado.lancamentos,
          classificacoes: estado.classificacoes,
        }),
      })
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}))
        throw new Error(d?.erro || `Erro ${resp.status}`)
      }
      const d = await resp.json()
      setValores((atual) => ({ ...atual, ...(d.valores ?? {}) }))
      setOrigem('sugerido')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSugerindo(false)
    }
  }

  const semContas = gruposComContas.length === 0

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <Kicker>Planejamento orçamentário</Kicker>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
            Orçamento por <span className="text-green">conta</span>
          </h1>
          <div className="mt-2">
            <BadgeStatus orcamento={salvo} alterado={alterado} />
          </div>
        </div>
        <div className="w-44">
          <span className="mb-1 block text-xs font-medium text-muted">Competência</span>
          <select
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-green"
            value={comp}
            onChange={(e) => setComp(e.target.value)}
          >
            {competencias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="mb-4 animate-rise">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm text-muted">
            {podeEditar
              ? 'Defina o orçamento de cada conta. Peça uma sugestão da IA com base no histórico e no mercado de grãos.'
              : 'Você tem acesso somente de consulta — o orçamento é exibido, mas não pode ser alterado.'}
          </p>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <Botao variante="fantasma" onClick={() => setImportarAberto(true)} disabled={semContas}>
                ⬆ Importar
              </Botao>
              <Botao variante="fantasma" onClick={sugerir} disabled={sugerindo || semContas}>
                {sugerindo ? 'Sugerindo…' : '✨ Sugerir com IA'}
              </Botao>
            </div>
          )}
        </div>

        {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}

        {semContas ? (
          <p className="text-sm text-muted">
            Nenhuma conta classificada ainda. Sincronize e classifique os lançamentos em{' '}
            <strong className="text-ink">Lançamentos</strong> para orçar conta a conta.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {gruposComContas.map((g) => {
              const total = g.contas.reduce((s, c) => s + (valores[c.conta] ?? 0), 0)
              return (
                <div key={g.linha}>
                  <div className="mb-1.5 flex items-center justify-between border-b border-line pb-1">
                    <span className="font-head text-xs font-semibold uppercase tracking-wider text-green">
                      {META_LINHAS[g.linha].rotulo}
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-ink">
                      {formatBRL(total)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {g.contas.map((c) => (
                      <div
                        key={c.conta}
                        className="grid grid-cols-[1fr_160px] items-center gap-3"
                      >
                        <span className="truncate text-sm text-muted">
                          <span className="font-mono text-xs text-faint">{c.conta}</span>
                          {c.descricao && ` · ${c.descricao}`}
                        </span>
                        <NumInput
                          value={valores[c.conta] ?? 0}
                          onChange={(v) => setConta(c.conta, v)}
                          min={0}
                          disabled={!podeEditar}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {podeEditar && !semContas && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Botao onClick={salvar} disabled={!alterado && !!salvo}>
              Salvar rascunho
            </Botao>
            {podeAprovar && (
              <Botao variante="fantasma" onClick={aprovar} disabled={aprovado}>
                {aprovado ? '✓ Aprovado' : '✓ Aprovar orçamento'}
              </Botao>
            )}
            <span className="text-xs text-faint">
              Origem: {origem}
              {salvo && ` · salvo em ${new Date(salvo.atualizadoEm).toLocaleDateString('pt-BR')}`}
            </span>
          </div>
        )}
        {podeEditar && !podeAprovar && !semContas && (
          <p className="mt-2 text-[11px] text-faint">
            O planejamento só passa a valer como oficial após a aprovação de um <strong>sócio</strong>.
          </p>
        )}
      </Card>

      <p className="text-xs text-faint">
        Valores em reais, magnitude positiva (ex.: “Deduções” como número positivo). O DRE compara
        o realizado com este orçamento, conta a conta.
      </p>

      {importarAberto && (
        <ModalImportar
          contas={contasConhecidas}
          onAplicar={aplicarImportacao}
          onFechar={() => setImportarAberto(false)}
        />
      )}
    </div>
  )
}

function BadgeStatus({ orcamento, alterado }: { orcamento?: Orcamento; alterado: boolean }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold'
  if (!orcamento)
    return <span className={`${base} bg-cream text-faint`}>Sem orçamento para o mês</span>
  if (alterado)
    return <span className={`${base} bg-warn/10 text-gold-deep`}>● Rascunho com alterações não salvas</span>
  if (orcamentoAprovado(orcamento))
    return (
      <span className={`${base} bg-green/10 text-green`}>
        ✓ Aprovado{orcamento.aprovadoPor ? ` por ${orcamento.aprovadoPor}` : ''}
        {orcamento.aprovadoEm ? ` · ${new Date(orcamento.aprovadoEm).toLocaleDateString('pt-BR')}` : ''}
      </span>
    )
  return <span className={`${base} bg-warn/10 text-gold-deep`}>⏳ Pendente de aprovação do sócio</span>
}

function ModalImportar({
  contas,
  onAplicar,
  onFechar,
}: {
  contas: ContaConhecida[]
  onAplicar: (valores: Record<string, number>, origem: OrigemOrcamento) => void
  onFechar: () => void
}) {
  const [modo, setModo] = useState<'planilha' | 'documento'>('planilha')
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState<ResultadoImport | null>(null)
  const [obs, setObs] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const descDe = (conta: string) => contas.find((c) => c.conta === conta)?.descricao ?? ''

  const trocarModo = (m: 'planilha' | 'documento') => {
    setModo(m)
    setPrevia(null)
    setErro(null)
    setObs('')
  }

  const lerArquivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      setTexto(await f.text())
      setPrevia(null)
    } catch {
      setErro('Não consegui ler o arquivo. Use CSV/TXT ou cole as células.')
    }
  }

  const analisarPlanilha = () => {
    setErro(null)
    setObs('')
    const r = parsePlanilha(texto, contas)
    setPrevia(r)
    if (!r.reconhecidas)
      setErro('Nenhuma conta reconhecida. Cada linha precisa ter o código (ou a descrição) da conta e o valor.')
  }

  const extrairDocumento = async () => {
    setCarregando(true)
    setErro(null)
    setObs('')
    setPrevia(null)
    try {
      const resp = await fetch('/api/importar-orcamento', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto, contas }),
      })
      const d = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(d?.erro || `Erro ${resp.status}`)
      const valores = (d.valores ?? {}) as Record<string, number>
      setPrevia({ valores, reconhecidas: Object.keys(valores).length, ignoradas: [] })
      setObs(d.observacoes ?? '')
      if (!Object.keys(valores).length) setErro('A IA não encontrou valores mapeáveis para as contas conhecidas.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }

  const podeAplicar = !!previa && previa.reconhecidas > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 animate-fade" onClick={onFechar}>
      <div
        className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="font-head text-xs font-semibold uppercase tracking-[0.2em] text-green">Importar orçamento</div>
            <h3 className="mt-0.5 text-lg font-bold text-ink">Dar entrada por planilha ou documento</h3>
          </div>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-cream hover:text-ink" title="Fechar">
            ✕
          </button>
        </div>

        <div className="mb-4 flex gap-1.5">
          {(['planilha', 'documento'] as const).map((m) => (
            <button
              key={m}
              onClick={() => trocarModo(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                modo === m ? 'bg-green text-white' : 'border border-line text-muted hover:bg-green/10 hover:text-green'
              }`}
            >
              {m === 'planilha' ? 'Planilha / colar' : 'Documento (IA)'}
            </button>
          ))}
        </div>

        {modo === 'planilha' ? (
          <>
            <p className="mb-2 text-sm text-muted">
              Cole as células do Excel (código ou descrição da conta + valor) ou envie um arquivo CSV/TXT.
            </p>
            <label className="mb-2 inline-block cursor-pointer rounded-lg border border-green/40 px-3 py-1.5 text-xs font-semibold text-green transition-colors hover:bg-green/10">
              Escolher arquivo (CSV/TXT)
              <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={lerArquivo} />
            </label>
          </>
        ) : (
          <p className="mb-2 text-sm text-muted">
            Cole o texto do documento (e-mail, PDF, relatório). A IA extrai os valores e mapeia para as
            contas conhecidas — você confere antes de aplicar.
          </p>
        )}

        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setPrevia(null)
          }}
          rows={6}
          placeholder={
            modo === 'planilha'
              ? '3.1.01\t1.500.000\n4.3.01\t90.000\nFolha administrativa\t88.000'
              : 'Ex.: O orçamento de vendas para agosto é de 1,5 milhão; folha administrativa 90 mil…'
          }
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink outline-none transition focus:border-green focus:ring-2 focus:ring-green/20"
        />

        <div className="mt-3 flex items-center gap-3">
          {modo === 'planilha' ? (
            <Botao variante="fantasma" onClick={analisarPlanilha} disabled={!texto.trim()}>
              Analisar
            </Botao>
          ) : (
            <Botao variante="fantasma" onClick={extrairDocumento} disabled={!texto.trim() || carregando}>
              {carregando ? 'Extraindo…' : '✨ Extrair com IA'}
            </Botao>
          )}
          {previa && <span className="text-xs text-muted">{previa.reconhecidas} conta(s) reconhecida(s)</span>}
        </div>

        {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

        {previa && previa.reconhecidas > 0 && (
          <div className="mt-4 rounded-lg border border-line bg-cream/40 p-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Prévia</div>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {Object.entries(previa.valores).map(([conta, v]) => (
                <div key={conta} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-ink">
                    <span className="font-mono text-xs text-faint">{conta}</span>
                    {descDe(conta) && ` · ${descDe(conta)}`}
                  </span>
                  <span className="shrink-0 font-head font-semibold tabular-nums text-ink">{formatBRL(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(obs || (previa && previa.ignoradas.length > 0)) && (
          <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 p-3 text-xs text-gold-deep">
            {obs && <p>{obs}</p>}
            {previa && previa.ignoradas.length > 0 && (
              <p>
                {previa.ignoradas.length} linha(s) não reconhecida(s):{' '}
                <span className="text-muted">{previa.ignoradas.slice(0, 3).join(' · ')}{previa.ignoradas.length > 3 ? '…' : ''}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-4">
          <button onClick={onFechar} className="text-sm font-medium text-muted hover:text-ink">
            Cancelar
          </button>
          <Botao onClick={() => podeAplicar && onAplicar(previa!.valores, modo === 'planilha' ? 'planilha' : 'documento')} disabled={!podeAplicar}>
            Aplicar ao orçamento
          </Botao>
        </div>
      </div>
    </div>
  )
}
