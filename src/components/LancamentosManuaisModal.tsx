// Grade conta × mês para lançar a ESTRUTURA à mão — item 2.4 do ROADMAP.md.
//
// A API da Enoki cobre o trading, não a estrutura: folha, depreciação, juros de
// empréstimo e IRPJ/CSLL quase não aparecem no módulo financeiro. Quando também
// não há planilha importada, esses valores precisam de uma entrada manual — sem
// eles o DRE mostra um lucro que não existe.
//
// O que é digitado aqui VENCE a planilha na mesma conta e competência (é uma
// correção, não uma soma) e fica marcado com origem 'manual'.
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDre } from '../context/DreContext'
import { Botao, NumInput, Select } from './ui'
import { formatBRL } from '../lib/format'
import { PLANO_CONTAS, nomeConta } from '../lib/planoContas'
import {
  LINHAS_DRE,
  META_LINHAS,
  idLancamentoManual,
  type LancamentoCanonico,
  type LinhaDRE,
} from '../lib/tipos'

/** Linhas que a Enoki tipicamente NÃO cobre — as candidatas naturais. */
const LINHAS_ESTRUTURA: LinhaDRE[] = [
  'despesas_administrativas',
  'depreciacao_amortizacao',
  'despesa_financeira',
  'receita_financeira',
  'impostos_lucro',
]

const MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const ROTULO_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Último dia do mês — data usada no lançamento (competência fecha no fim do mês). */
function ultimoDia(ano: number, mes: number): string {
  const d = new Date(ano, mes, 0).getDate()
  return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function LancamentosManuaisModal({ aoFechar }: { aoFechar: () => void }) {
  const { estado, salvarLancamentosManuais } = useDre()
  const anoCorrente = new Date().getFullYear()
  const [ano, setAno] = useState(anoCorrente)
  const [linha, setLinha] = useState<LinhaDRE>('despesas_administrativas')

  // valores[conta][mes 0..11]
  const [valores, setValores] = useState<Record<string, number[]>>(() => {
    const out: Record<string, number[]> = {}
    for (const l of estado.lancamentosManuais ?? []) {
      const a = Number(l.data.slice(0, 4))
      const m = Number(l.data.slice(5, 7)) - 1
      if (a !== anoCorrente || m < 0 || m > 11) continue
      ;(out[l.contaSafragold] ??= Array(12).fill(0))[m] = l.valor
    }
    return out
  })

  const [contasAtivas, setContasAtivas] = useState<string[]>(() => Object.keys(valores))
  const [contaNova, setContaNova] = useState('')

  const contasDaLinha = useMemo(
    () => PLANO_CONTAS.filter((c) => c.linha === linha),
    [linha],
  )
  const visiveis = useMemo(
    () => contasAtivas.filter((c) => contasDaLinha.some((x) => x.conta === c)),
    [contasAtivas, contasDaLinha],
  )

  const setValor = (conta: string, mes: number, v: number) =>
    setValores((s) => {
      const linhaConta = [...(s[conta] ?? Array(12).fill(0))]
      linhaConta[mes] = v
      return { ...s, [conta]: linhaConta }
    })

  const adicionar = () => {
    if (!contaNova || contasAtivas.includes(contaNova)) return
    setContasAtivas((c) => [...c, contaNova])
    setValores((s) => ({ ...s, [contaNova]: s[contaNova] ?? Array(12).fill(0) }))
    setContaNova('')
  }

  const salvar = () => {
    // Preserva o que foi lançado em OUTROS anos; substitui só o ano editado.
    const outrosAnos = (estado.lancamentosManuais ?? []).filter(
      (l) => Number(l.data.slice(0, 4)) !== ano,
    )
    const novos: LancamentoCanonico[] = []
    for (const [conta, meses] of Object.entries(valores)) {
      meses.forEach((valor, i) => {
        if (!valor) return
        const competencia = `${ano}-${MESES[i]}`
        novos.push({
          id: idLancamentoManual(conta, competencia),
          data: ultimoDia(ano, i + 1),
          contaSafragold: conta,
          historico: `${nomeConta(conta, conta)} · lançamento manual`,
          valor,
          origem: 'manual',
        })
      })
    }
    salvarLancamentosManuais([...outrosAnos, ...novos])
    aoFechar()
  }

  const totalConta = (conta: string) => (valores[conta] ?? []).reduce((s, v) => s + (v || 0), 0)
  const totalMes = (i: number) => visiveis.reduce((s, c) => s + (valores[c]?.[i] ?? 0), 0)

  const anos = [anoCorrente - 1, anoCorrente, anoCorrente + 1]

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm"
      onClick={aoFechar}
    >
      <div
        className="my-8 w-full max-w-5xl rounded-xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ink">Lançar estrutura à mão</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Folha, depreciação, juros e impostos sobre o lucro quase não passam pelo módulo financeiro
          da Enoki. Lance aqui o que falta — sem isso o DRE mostra um lucro que não existe. O valor
          digitado <strong className="text-ink">substitui</strong> o da planilha na mesma conta e mês.
        </p>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div className="w-64">
            <span className="mb-1 block text-xs font-medium text-muted">Linha do DRE</span>
            <Select
              value={linha}
              onChange={(v) => setLinha(v as LinhaDRE)}
              options={LINHAS_DRE.filter((l) => LINHAS_ESTRUTURA.includes(l)).map((l) => ({
                value: l,
                label: META_LINHAS[l].rotulo,
              }))}
            />
          </div>
          <div className="w-28">
            <span className="mb-1 block text-xs font-medium text-muted">Ano</span>
            <Select
              value={String(ano)}
              onChange={(v) => setAno(Number(v))}
              options={anos.map((a) => ({ value: String(a), label: String(a) }))}
            />
          </div>
          <div className="w-72">
            <span className="mb-1 block text-xs font-medium text-muted">Adicionar conta</span>
            <Select
              value={contaNova}
              onChange={setContaNova}
              options={[
                { value: '', label: 'Escolha uma conta…' },
                ...contasDaLinha
                  .filter((c) => !contasAtivas.includes(c.conta))
                  .map((c) => ({ value: c.conta, label: `${c.conta} · ${c.descricao}` })),
              ]}
            />
          </div>
          <Botao variante="fantasma" onClick={adicionar}>
            + Incluir
          </Botao>
        </div>

        <div className="mt-5 overflow-x-auto">
          {visiveis.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              Nenhuma conta desta linha ainda. Escolha uma acima e clique em “Incluir”.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="py-2 pr-3 font-semibold">Conta</th>
                  {ROTULO_MES.map((m) => (
                    <th key={m} className="py-2 px-1 text-right font-semibold">
                      {m}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((conta) => (
                  <tr key={conta} className="border-b border-line/50">
                    <td className="py-1.5 pr-3">
                      <div className="font-mono text-xs text-ink">{conta}</div>
                      <div className="text-[11px] text-faint">{nomeConta(conta)}</div>
                    </td>
                    {MESES.map((_, i) => (
                      <td key={i} className="px-0.5 py-1">
                        <NumInput
                          value={valores[conta]?.[i] ?? 0}
                          onChange={(v) => setValor(conta, i, v ?? 0)}
                        />
                      </td>
                    ))}
                    <td className="py-1.5 pl-3 text-right text-xs font-semibold tabular-nums text-ink">
                      {formatBRL(totalConta(conta))}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line">
                  <td className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-faint">
                    Total
                  </td>
                  {MESES.map((_, i) => (
                    <td key={i} className="px-1 py-2 text-right text-[11px] tabular-nums text-muted">
                      {totalMes(i) ? formatBRL(totalMes(i)) : '—'}
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-right text-xs font-bold tabular-nums text-ink">
                    {formatBRL(visiveis.reduce((s, c) => s + totalConta(c), 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={salvar}>Salvar lançamentos</Botao>
        </div>
      </div>
    </div>,
    document.body,
  )
}
