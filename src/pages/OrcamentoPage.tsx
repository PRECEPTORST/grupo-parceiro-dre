import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { useAuth } from '../context/AuthContext'
import { podeEditarOrcamento } from '../lib/permissoes'
import { Botao, Card, Kicker, NumInput } from '../components/ui'
import { formatBRL } from '../lib/format'
import { META_LINHAS, type Orcamento } from '../lib/tipos'
import { contasPorLinha, mapaDeClassificacoes, competenciasDisponiveis } from '../lib/dre'

function competenciaAtual(): string {
  return new Date().toISOString().slice(0, 7)
}

export function OrcamentoPage() {
  const { estado, salvarOrcamento } = useDre()
  const { usuario } = useAuth()
  const podeEditar = podeEditarOrcamento(usuario?.papel)

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

  const mapa = useMemo(() => mapaDeClassificacoes(estado.classificacoes), [estado.classificacoes])
  const { grupos } = useMemo(
    () => contasPorLinha(estado.lancamentos, mapa),
    [estado.lancamentos, mapa],
  )
  const gruposComContas = grupos.filter((g) => g.contas.length > 0)

  const setConta = (conta: string, v: number | null) =>
    setValores((atual) => ({ ...atual, [conta]: v ?? 0 }))

  const salvar = () => {
    const orcamento: Orcamento = {
      competencia: comp,
      valores,
      origem,
      atualizadoEm: new Date().toISOString(),
    }
    salvarOrcamento(orcamento)
  }

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
          <Kicker>Orçamento aprovado</Kicker>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
            Orçamento por <span className="text-green">conta</span>
          </h1>
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
            <Botao variante="fantasma" onClick={sugerir} disabled={sugerindo || semContas}>
              {sugerindo ? 'Sugerindo…' : '✨ Sugerir com IA'}
            </Botao>
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
          <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
            <Botao onClick={salvar}>Salvar orçamento</Botao>
            <span className="text-xs text-faint">
              Origem: {origem}
              {salvo && ` · salvo em ${new Date(salvo.atualizadoEm).toLocaleDateString('pt-BR')}`}
            </span>
          </div>
        )}
      </Card>

      <p className="text-xs text-faint">
        Valores em reais, magnitude positiva (ex.: “Deduções” como número positivo). O DRE compara
        o realizado com este orçamento, conta a conta.
      </p>
    </div>
  )
}
