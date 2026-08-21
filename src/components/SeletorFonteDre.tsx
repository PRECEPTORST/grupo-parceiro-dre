// Seletor da FONTE que alimenta o DRE (itens 1.6 e 2.1 do ROADMAP.md).
//
// Três modos:
//   • planilha — só a DRE gerencial importada;
//   • Enoki    — só o que a API monta por competência;
//   • fundido  — cada linha do DRE lê da fonte configurada (trading da Enoki,
//                estrutura da planilha). As duas NUNCA são somadas.
// Só aparece quando existe mais de uma fonte carregada.
import { useState } from 'react'
import { useDre } from '../context/DreContext'
import { Select } from './ui'
import { ModalFusao } from './ModalFusao'
import { fonteDreDe, ROTULO_FONTE, type FonteDre } from '../lib/tipos'
import { linhasOrfas } from '../lib/fusao'

export function SeletorFonteDre() {
  const { estado, salvarFonteDre, fusao } = useDre()
  const [configurando, setConfigurando] = useState(false)
  const temEnoki = !!estado.lancamentosEnoki?.length
  const temPlanilha = !!estado.lancamentos.length
  if (!temEnoki || !temPlanilha) return null

  const fonte = fonteDreDe(estado)
  const orfas = fusao ? linhasOrfas(fusao) : []

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">Fonte dos dados</span>
      <div className="flex items-center gap-2">
        <div className="w-56">
          <Select
            value={fonte}
            onChange={(v) => salvarFonteDre(v as FonteDre)}
            options={[
              { value: 'planilha', label: ROTULO_FONTE.planilha },
              { value: 'enoki', label: ROTULO_FONTE.enoki },
              { value: 'fundido', label: ROTULO_FONTE.fundido },
            ]}
          />
        </div>
        {fonte === 'fundido' && (
          <button
            onClick={() => setConfigurando(true)}
            className="rounded-lg border border-green/40 px-3 py-2 text-xs font-semibold text-green hover:bg-green/10"
            title="Escolher de qual fonte cada linha do DRE é lida"
          >
            ⚙ Linhas
            {orfas.length > 0 && <span className="ml-1 text-gold-deep">⚠ {orfas.length}</span>}
          </button>
        )}
      </div>
      {configurando && <ModalFusao aoFechar={() => setConfigurando(false)} />}
    </div>
  )
}
