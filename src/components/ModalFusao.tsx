// Configuração da FUSÃO das fontes, linha a linha (item 2.1 do ROADMAP.md).
//
// Cada linha do DRE lê de UMA fonte só — nunca das duas — porque somar a
// planilha com a Enoki contaria a mesma venda duas vezes. Aqui o usuário vê
// exatamente de onde cada linha está vindo, quanto entrou e quanto foi preterido,
// e é avisado quando a fonte escolhida não tem dado nenhum (linha órfã).
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useDre } from '../context/DreContext'
import { Botao } from './ui'
import { formatBRL } from '../lib/format'
import { configFusaoEfetiva, linhasOrfas } from '../lib/fusao'
import { LINHAS_DRE, META_LINHAS, type ConfigFusao, type FonteLinha } from '../lib/tipos'

const ROTULO_FONTE_LINHA: Record<FonteLinha, string> = {
  enoki: 'Enoki',
  planilha: 'Planilha',
}

export function ModalFusao({ aoFechar }: { aoFechar: () => void }) {
  const { estado, salvarConfigFusao, fusao } = useDre()
  const [config, setConfig] = useState<ConfigFusao>(() => configFusaoEfetiva(estado.configFusao))

  const orfas = new Set((fusao ? linhasOrfas(fusao) : []).map((o) => o.linha))
  const resumoDe = (linha: string) => fusao?.porLinha.find((p) => p.linha === linha)

  const trocar = (linha: keyof ConfigFusao, fonte: FonteLinha) =>
    setConfig((c) => ({ ...c, [linha]: fonte }))

  const salvar = () => {
    salvarConfigFusao(config)
    aoFechar()
  }

  // Portal para o <body>: o seletor de fonte vive dentro de um cabeçalho animado,
  // e uma transform/filter em qualquer ancestral vira o bloco de contenção de um
  // `position: fixed` — o modal apareceria recortado dentro do cabeçalho.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm"
      onClick={aoFechar}
    >
      <div
        className="my-8 w-full max-w-3xl rounded-xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ink">De onde vem cada linha do DRE</h2>
        <p className="mt-1 text-sm text-muted">
          Cada linha lê de <strong className="text-ink">uma fonte só</strong>. A Enoki cobre bem o
          trading (notas fiscais, compra de grão, frete); a planilha cobre a estrutura (folha,
          depreciação, empréstimos, IRPJ). Somar as duas contaria a mesma venda duas vezes.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="py-2 pr-4 font-semibold">Linha do DRE</th>
                <th className="py-2 px-4 font-semibold">Fonte</th>
                <th className="py-2 pl-4 text-right font-semibold">Entra / preterido</th>
              </tr>
            </thead>
            <tbody>
              {LINHAS_DRE.map((linha) => {
                const r = resumoDe(linha)
                const orfa = orfas.has(linha) && config[linha] === fusao?.porLinha.find((p) => p.linha === linha)?.fonte
                return (
                  <tr key={linha} className="border-b border-line/50">
                    <td className="py-2 pr-4 text-ink">
                      {META_LINHAS[linha].rotulo}
                      {orfa && (
                        <div className="text-[11px] font-semibold text-gold-deep">
                          ⚠ a fonte escolhida não tem lançamento nesta linha
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <div className="inline-flex overflow-hidden rounded-lg border border-line">
                        {(['enoki', 'planilha'] as FonteLinha[]).map((f) => (
                          <button
                            key={f}
                            onClick={() => trocar(linha, f)}
                            className={`px-3 py-1 text-xs font-semibold transition-colors ${
                              config[linha] === f
                                ? 'bg-green text-white'
                                : 'text-muted hover:bg-green/10'
                            }`}
                          >
                            {ROTULO_FONTE_LINHA[f]}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pl-4 text-right text-xs tabular-nums text-muted">
                      {r ? (
                        <>
                          <span className="text-ink">{formatBRL(r.valorAceito)}</span>
                          {r.valorDescartado > 0 && (
                            <span className="text-faint"> / {formatBRL(r.valorDescartado)}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={salvar}>Salvar configuração</Botao>
        </div>
      </div>
    </div>,
    document.body,
  )
}
