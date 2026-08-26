// Divergências e decisões pendentes da carga do ERP.
//
// O DRE do ERP não bate com a planilha, e quase toda a diferença é DECISÃO, não
// erro. Este painel existe para que ninguém leia o número sem ver o que está por
// trás dele: quanto vale cada escolha, o que está valendo hoje, o que muda se a
// decisão for outra, e de quem é a decisão.
//
// O que está EM ABERTO vem primeiro e fica aberto na tela; o que já foi decidido
// fica recolhido, disponível para auditoria sem competir por atenção.
import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { Card, Kicker } from './ui'
import { formatBRL } from '../lib/format'
import { divergenciasDaCarga, totalEmAberto, type Divergencia } from '../lib/divergencias'

const ROTULO_LINHA: Record<Divergencia['linha'], string> = {
  receita: 'Receita',
  custo: 'CPV',
  deducoes: 'Deduções',
  despesas: 'Despesas',
  estrutura: 'Estrutura',
}

function Item({ d }: { d: Divergencia }) {
  const aberta = d.situacao === 'aberta'
  return (
    <div
      className={`rounded-lg border p-3 ${
        aberta ? 'border-warn/40 bg-warn/5' : 'border-line bg-cream'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{d.titulo}</span>
          <span className="rounded bg-faint/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            {ROTULO_LINHA[d.linha]}
          </span>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">
            {d.valor ? formatBRL(d.valor) : '—'}
          </div>
          {d.quantidade > 0 && (
            <div className="text-[11px] text-muted">{d.quantidade} registro(s)</div>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs text-muted">{d.oQueE}</p>

      <dl className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted">Valendo hoje</dt>
          <dd>{d.valendoHoje}</dd>
        </div>
        {d.seMudar !== '—' && (
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted">Se a decisão for outra</dt>
            <dd>{d.seMudar}</dd>
          </div>
        )}
      </dl>

      <div className="mt-2 text-[11px] text-muted">
        <span className="uppercase tracking-wide">Quem decide:</span> {d.quemDecide}
      </div>
    </div>
  )
}

export function PainelDivergencias() {
  const { estado } = useDre()
  const [verDecididas, setVerDecididas] = useState(false)

  const divs = useMemo(() => divergenciasDaCarga(estado.enokiSync), [estado.enokiSync])
  const abertas = divs.filter((d) => d.situacao === 'aberta')
  const decididas = divs.filter((d) => d.situacao === 'decidida')
  const emAberto = totalEmAberto(divs)

  const sync = estado.enokiSync
  if (!sync) return null

  return (
    <Card>
      <Kicker>Divergências e decisões</Kicker>

      <p className="mt-2 text-xs text-muted">
        O DRE do ERP não bate com a planilha do cliente, e a maior parte da diferença não é erro
        — é decisão. Cada uma abaixo move o resultado, todas são defensáveis, e nenhuma delas é
        nossa para tomar sozinhos.
      </p>

      <div className="mt-3 flex flex-wrap gap-4 rounded-lg border border-line bg-cream p-3 text-xs">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Em aberto</div>
          <div className="text-base font-semibold tabular-nums text-gold-deep">
            {formatBRL(emAberto)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Decisões pendentes</div>
          <div className="text-base font-semibold tabular-nums">{abertas.length}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Período carregado</div>
          <div className="text-base font-semibold tabular-nums">
            {sync.de} a {sync.ate}
          </div>
        </div>
        {!sync.completo && (
          <div className="self-center rounded border border-danger/40 bg-danger/5 px-2 py-1 text-danger">
            Carga parcial — a varredura não percorreu tudo.
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2">
        {abertas.map((d) => (
          <Item key={d.id} d={d} />
        ))}
      </div>

      {decididas.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setVerDecididas((v) => !v)}
            className="mt-3 text-xs text-muted underline underline-offset-2 hover:text-ink"
          >
            {verDecididas ? 'Ocultar' : 'Ver'} {decididas.length} regra(s) já decidida(s)
          </button>
          {verDecididas && (
            <div className="mt-2 grid gap-2">
              {decididas.map((d) => (
                <Item key={d.id} d={d} />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
