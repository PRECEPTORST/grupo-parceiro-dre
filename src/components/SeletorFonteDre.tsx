// Seletor da FONTE que alimenta o DRE (item 1.6 do ROADMAP.md).
//
// Na Fase 1 as duas fontes convivem LADO A LADO — planilha da DRE gerencial ×
// API da Enoki — e nunca são somadas (seria dupla contagem). O usuário compara
// as duas leituras do mesmo período; a fusão controlada por linha é a Fase 2.
// Só aparece quando existe mais de uma fonte carregada.
import { useDre } from '../context/DreContext'
import { Select } from './ui'
import { fonteDreDe, ROTULO_FONTE, type FonteDre } from '../lib/tipos'

export function SeletorFonteDre() {
  const { estado, salvarFonteDre } = useDre()
  const temEnoki = !!estado.lancamentosEnoki?.length
  const temPlanilha = !!estado.lancamentos.length
  if (!temEnoki || !temPlanilha) return null

  const fonte = fonteDreDe(estado)
  return (
    <div className="w-56">
      <span className="mb-1 block text-xs font-medium text-muted">Fonte dos dados</span>
      <Select
        value={fonte}
        onChange={(v) => salvarFonteDre(v as FonteDre)}
        options={[
          { value: 'planilha', label: ROTULO_FONTE.planilha },
          { value: 'enoki', label: ROTULO_FONTE.enoki },
        ]}
      />
    </div>
  )
}
