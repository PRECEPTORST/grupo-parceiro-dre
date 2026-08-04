import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { Botao, Select } from './ui'
import { formatBRL } from '../lib/format'
import { LINHAS_DRE, META_LINHAS, type LinhaDRE, type LancamentoCanonico, type Classificacao } from '../lib/tipos'
import { analisarMatriz, chaveConta, ultimoDiaDoMes, type AnaliseImport, type Matriz } from '../lib/importarDre'

type Etapa = 'upload' | 'processando' | 'revisao'
type Origem = 'memoria' | 'ia' | 'auto'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloComp(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano.slice(2)}`
}

const OPCOES_LINHA = [
  { value: 'ignorar', label: '— Ignorar (subtotal/capex) —' },
  ...LINHAS_DRE.map((l) => ({ value: l, label: META_LINHAS[l].rotulo })),
]

const BADGE_ORIGEM: Record<Origem, { rotulo: string; classe: string }> = {
  memoria: { rotulo: 'memória', classe: 'bg-green/10 text-green-deep' },
  ia: { rotulo: 'IA', classe: 'bg-gold/15 text-gold-deep' },
  auto: { rotulo: 'auto', classe: 'bg-cream text-faint' },
}

export function ImportarDreModal({ onClose }: { onClose: () => void }) {
  const { estado, importarDreGerencial } = useDre()
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [erro, setErro] = useState<string | null>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [analise, setAnalise] = useState<AnaliseImport | null>(null)
  const [classe, setClasse] = useState<Record<number, string>>({})
  const [origem, setOrigem] = useState<Record<number, Origem>>({})
  const [resultadoIdx, setResultadoIdx] = useState<number>(-1)

  const memoria = useMemo(
    () => new Map(estado.classificacoes.map((c) => [c.contaSafragold, c.linha])),
    [estado.classificacoes],
  )

  async function processarArquivo(file: File) {
    setErro(null)
    setNomeArquivo(file.name)
    setEtapa('processando')
    try {
      const buf = await file.arrayBuffer()
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) throw new Error('A planilha não tem nenhuma aba legível.')
      const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false }) as Matriz
      const a = analisarMatriz(matriz)
      if (!a.meses.length) throw new Error('Não encontrei colunas de mês no cabeçalho (ex.: "JANEIRO 2026").')
      if (!a.linhas.length) throw new Error('Não encontrei linhas de conta com valores numéricos.')

      const cls: Record<number, string> = {}
      const org: Record<number, Origem> = {}
      const desconhecidas: { idx: number; label: string }[] = []
      a.linhas.forEach((l, i) => {
        const chave = chaveConta(l.label)
        if (memoria.has(chave)) {
          cls[i] = memoria.get(chave) as string
          org[i] = 'memoria'
        } else if (l.ehSubtotal || l.ehResultado) {
          cls[i] = 'ignorar'
          org[i] = 'auto'
        } else {
          cls[i] = 'ignorar' // provisório até a IA responder
          org[i] = 'ia'
          desconhecidas.push({ idx: i, label: l.label })
        }
      })
      setResultadoIdx(a.linhas.findIndex((l) => l.ehResultado))

      if (desconhecidas.length) {
        try {
          const resp = await fetch('/api/classificar-dre', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ descricoes: desconhecidas.map((d) => d.label) }),
          })
          const d = await resp.json().catch(() => ({}))
          if (!resp.ok) throw new Error(d?.erro || `Erro ${resp.status}`)
          const porDesc = new Map((d.classificacoes ?? []).map((c: any) => [c.descricao, c.linha]))
          for (const { idx, label } of desconhecidas) {
            const linha = porDesc.get(label)
            if (typeof linha === 'string') cls[idx] = linha
          }
        } catch (e) {
          setErro(
            `A IA não classificou (${e instanceof Error ? e.message : String(e)}). As contas novas ficaram como "Ignorar" — classifique-as na mão abaixo.`,
          )
        }
      }

      setAnalise(a)
      setClasse(cls)
      setOrigem(org)
      setEtapa('revisao')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setEtapa('upload')
    }
  }

  const resumo = useMemo(() => {
    if (!analise) return { importadas: 0, ignoradas: 0, lancamentos: 0 }
    let importadas = 0
    let lancamentos = 0
    analise.linhas.forEach((l, i) => {
      if (classe[i] && classe[i] !== 'ignorar') {
        importadas++
        lancamentos += Object.values(l.valores).filter((v) => Math.abs(v) >= 0.005).length
      }
    })
    return { importadas, ignoradas: analise.linhas.length - importadas, lancamentos }
  }, [analise, classe])

  function importar() {
    if (!analise) return
    const lancamentos: LancamentoCanonico[] = []
    const classificacoes: Classificacao[] = []
    analise.linhas.forEach((l, i) => {
      const linha = classe[i]
      if (!linha || linha === 'ignorar') return
      const chave = chaveConta(l.label)
      classificacoes.push({
        contaSafragold: chave,
        linha: linha as LinhaDRE,
        confianca: 1,
        justificativa: 'Importado da DRE gerencial.',
      })
      for (const [comp, v] of Object.entries(l.valores)) {
        if (Math.abs(v) < 0.005) continue
        lancamentos.push({
          id: `imp-${chave}-${comp}`,
          data: ultimoDiaDoMes(comp),
          contaSafragold: chave,
          historico: l.label,
          valor: Math.round(Math.abs(v) * 100) / 100,
        })
      }
    })
    const resultadoDeclarado: Record<string, number> = {}
    if (resultadoIdx >= 0 && analise.linhas[resultadoIdx]) {
      for (const [comp, v] of Object.entries(analise.linhas[resultadoIdx].valores)) resultadoDeclarado[comp] = v
    }
    importarDreGerencial({ lancamentos, classificacoes, resultadoDeclarado })
    onClose()
  }

  const periodo =
    analise && analise.meses.length
      ? `${rotuloComp(analise.meses[0].competencia)}–${rotuloComp(analise.meses[analise.meses.length - 1].competencia)}`
      : ''

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-4xl animate-rise rounded-2xl border border-line bg-surface shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="font-head text-lg font-bold text-ink">Importar DRE de planilha</h2>
            <p className="text-xs text-muted">
              {etapa === 'revisao' && analise
                ? `${nomeArquivo} · ${analise.meses.length} meses (${periodo})`
                : 'Sobe o Excel (.xlsx) da DRE gerencial. Cada conta é classificada pela descrição.'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl text-muted hover:bg-cream hover:text-ink">
            ×
          </button>
        </div>

        <div className="px-6 py-5">
          {erro && (
            <div className="mb-4 rounded-lg border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">
              {erro}
            </div>
          )}

          {(etapa === 'upload' || etapa === 'processando') && (
            <div className="flex flex-col items-center gap-4 py-8">
              <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line px-10 py-10 transition-colors hover:border-green/50 hover:bg-green/5">
                <span className="text-4xl">📄</span>
                <span className="text-sm font-semibold text-ink">
                  {etapa === 'processando' ? 'Processando…' : 'Escolher arquivo .xlsx'}
                </span>
                <span className="max-w-sm text-center text-xs text-muted">
                  Substitui todos os lançamentos atuais. Subtotais, percentuais e investimentos são
                  ignorados; as contas novas são classificadas pela IA (as já vistas vêm da memória).
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  disabled={etapa === 'processando'}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void processarArquivo(f)
                  }}
                />
              </label>
            </div>
          )}

          {etapa === 'revisao' && analise && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span className="text-muted">
                  <strong className="text-green">{resumo.importadas}</strong> contas ·{' '}
                  <strong className="text-ink">{resumo.lancamentos}</strong> lançamentos serão importados
                </span>
                <span className="text-faint">{resumo.ignoradas} ignoradas</span>
              </div>

              {/* Resultado declarado (para a reconciliação da auditoria) */}
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-cream/40 px-3 py-2">
                <span className="text-xs font-medium text-muted">Linha de resultado (opcional):</span>
                <div className="min-w-[240px]">
                  <Select
                    value={resultadoIdx >= 0 ? String(resultadoIdx) : ''}
                    onChange={(v) => setResultadoIdx(v === '' ? -1 : Number(v))}
                    options={[
                      { value: '', label: '— Nenhuma —' },
                      ...analise.linhas
                        .map((l, i) => ({ l, i }))
                        .filter(({ l }) => l.ehResultado || l.ehSubtotal)
                        .map(({ l, i }) => ({ value: String(i), label: l.label })),
                    ]}
                  />
                </div>
                <span className="text-[11px] text-faint">
                  Usada só para a auditoria conferir se a soma das contas fecha com o total informado.
                </span>
              </div>

              <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                      <th className="py-2 pl-4 pr-3 font-semibold">Conta (planilha)</th>
                      <th className="py-2 px-3 text-right font-semibold">Total período</th>
                      <th className="py-2 pr-4 pl-3 font-semibold">Linha do DRE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analise.linhas.map((l, i) => {
                      const ignorada = classe[i] === 'ignorar'
                      return (
                        <tr key={i} className={`border-b border-line/50 ${ignorada ? 'opacity-50' : ''}`}>
                          <td className="py-1.5 pl-4 pr-3">
                            <span className="text-ink">{l.label}</span>
                            {origem[i] && classe[i] !== 'ignorar' && (
                              <span
                                className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${BADGE_ORIGEM[origem[i]].classe}`}
                              >
                                {BADGE_ORIGEM[origem[i]].rotulo}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-muted">{formatBRL(l.total)}</td>
                          <td className="py-1.5 pr-4 pl-3">
                            <Select
                              value={classe[i] ?? 'ignorar'}
                              onChange={(v) => setClasse((s) => ({ ...s, [i]: v }))}
                              options={OPCOES_LINHA}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <Botao variante="fantasma" onClick={onClose}>
                  Cancelar
                </Botao>
                <Botao onClick={importar} disabled={resumo.importadas === 0}>
                  Importar {resumo.importadas} contas (substitui tudo)
                </Botao>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
