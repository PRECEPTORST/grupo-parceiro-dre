import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { useAuth } from '../context/AuthContext'
import { podeEditarOrcamento } from '../lib/permissoes'
import { Botao, Card, Kicker, NumInput } from '../components/ui'
import { LINHAS_DRE, META_LINHAS, type LinhaDRE, type Orcamento } from '../lib/tipos'
import { competenciasDisponiveis } from '../lib/dre'

function competenciaAtual(): string {
  return new Date().toISOString().slice(0, 7)
}

export function OrcamentoPage() {
  const { estado, salvarOrcamento } = useDre()
  const { usuario } = useAuth()
  const podeEditar = podeEditarOrcamento(usuario?.papel)

  // Competências: as que têm lançamento + a atual + as já orçadas.
  const competencias = useMemo(() => {
    const set = new Set<string>([
      competenciaAtual(),
      ...competenciasDisponiveis(estado.lancamentos),
      ...estado.orcamentos.map((o) => o.competencia),
    ])
    return [...set].sort().reverse()
  }, [estado.lancamentos, estado.orcamentos])

  const [comp, setComp] = useState<string>(competencias[0] ?? competenciaAtual())
  const salvo = estado.orcamentos.find((o) => o.competencia === comp)

  const [valores, setValores] = useState<Partial<Record<LinhaDRE, number>>>(
    () => salvo?.valores ?? {},
  )
  const [origem, setOrigem] = useState(salvo?.origem ?? 'manual')
  const [sugerindo, setSugerindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Recarrega o formulário ao trocar de competência.
  const [ultimaComp, setUltimaComp] = useState(comp)
  if (ultimaComp !== comp) {
    setUltimaComp(comp)
    const s = estado.orcamentos.find((o) => o.competencia === comp)
    setValores(s?.valores ?? {})
    setOrigem(s?.origem ?? 'manual')
  }

  const setLinha = (linha: LinhaDRE, v: number | null) =>
    setValores((atual) => ({ ...atual, [linha]: v ?? 0 }))

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
          orcamentosAnteriores: estado.orcamentos,
        }),
      })
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}))
        throw new Error(d?.erro || `Erro ${resp.status}`)
      }
      const d = await resp.json()
      setValores(d.valores ?? {})
      setOrigem('sugerido')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSugerindo(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker>Orçamento aprovado</Kicker>
          <h1 className="mt-1 text-3xl font-extrabold">
            Baseline de <span className="text-cyan">comparação.</span>
          </h1>
        </div>
        <div className="w-44">
          <span className="mb-1 block text-xs font-medium text-slateblue">Competência</span>
          <select
            className="w-full rounded-lg border border-cyan/20 bg-navy-2 px-3 py-2 text-sm text-white outline-none"
            value={comp}
            onChange={(e) => setComp(e.target.value)}
          >
            {competencias.map((c) => (
              <option key={c} value={c} className="bg-navy-2">
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slateblue">
            {podeEditar
              ? 'Preencha manualmente ou peça uma sugestão da IA com base no histórico e no mercado de grãos.'
              : 'Você tem acesso somente de consulta — o orçamento é exibido, mas não pode ser alterado.'}
          </p>
          {podeEditar && (
            <Botao variante="fantasma" onClick={sugerir} disabled={sugerindo}>
              {sugerindo ? 'Sugerindo…' : '✨ Sugerir com IA'}
            </Botao>
          )}
        </div>

        {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}

        <div className="grid gap-2">
          {LINHAS_DRE.map((linha) => (
            <div key={linha} className="grid grid-cols-[1fr_180px] items-center gap-3">
              <span className="text-sm text-slateblue">{META_LINHAS[linha].rotulo}</span>
              <NumInput
                value={valores[linha] ?? 0}
                onChange={(v) => setLinha(linha, v)}
                min={0}
                disabled={!podeEditar}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          {podeEditar && <Botao onClick={salvar}>Salvar orçamento</Botao>}
          <span className="text-xs text-faint">
            Origem: {origem}
            {salvo && ` · salvo em ${new Date(salvo.atualizadoEm).toLocaleDateString('pt-BR')}`}
          </span>
        </div>
      </Card>

      <p className="text-xs text-faint">
        Valores em reais, na mesma magnitude do realizado (ex.: “Deduções” como número positivo). O
        DRE usa este orçamento para apontar os desvios da competência.
      </p>
    </div>
  )
}
