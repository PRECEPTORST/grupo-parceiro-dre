// Seletor da FONTE que alimenta o DRE (itens 1.6 e 2.1 do ROADMAP.md).
//
// Três modos:
//   • planilha — só a DRE gerencial importada;
//   • Enoki    — só o que a API monta por competência;
//   • fundido  — cada linha do DRE lê da fonte configurada (trading da Enoki,
//                estrutura da planilha). As duas NUNCA são somadas.
// Só aparece quando existe mais de uma fonte carregada.
import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { Select } from './ui'
import { ModalFusao } from './ModalFusao'
import { fonteDreDe, lancamentosPlanilha, META_LINHAS, ROTULO_FONTE, type FonteDre } from '../lib/tipos'
import { linhasSubstituidas, competenciasNaoFundiveis } from '../lib/fusao'

export function SeletorFonteDre() {
  const { estado, salvarFonteDre, fusao } = useDre()
  const [configurando, setConfigurando] = useState(false)

  // Os hooks vêm ANTES do early return: a ordem de chamada tem de ser a mesma em
  // todo render, e o `return null` abaixo é condicional.
  //
  // A fusão lê cada linha de UMA fonte. Num mês em que só uma delas tem dados,
  // isso deixa de ser "duas visões do mesmo período" e vira subtração de coisas
  // diferentes — foi assim que o acumulado deu −R$ 1,6M de prejuízo inventado,
  // um mês de margem bruta contra sete meses de estrutura.
  const planilha = useMemo(() => lancamentosPlanilha(estado), [estado])
  const enoki = useMemo(() => estado.lancamentosEnoki ?? [], [estado.lancamentosEnoki])
  const semPar = useMemo(() => competenciasNaoFundiveis(planilha, enoki), [planilha, enoki])

  if (!enoki.length || !estado.lancamentos.length) return null

  const fonte = fonteDreDe(estado)
  const trocadas = fusao ? linhasSubstituidas(fusao) : []

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
            {trocadas.length > 0 && <span className="ml-1 text-gold-deep">⚠ {trocadas.length}</span>}
          </button>
        )}
      </div>
      {fonte === 'fundido' && semPar.length > 0 && (
        <p className="mt-2 max-w-md rounded-lg border border-danger/40 bg-danger/5 p-2 text-xs text-danger">
          <b>Não leia o acumulado neste modo.</b> {semPar.length} mês(es) têm dados de só uma
          fonte ({semPar.map((c) => c.competencia).join(', ')}), então o fundido subtrai
          estrutura de meses que não têm receita do ERP. Use <b>{ROTULO_FONTE.planilha}</b> para o
          resultado e <b>{ROTULO_FONTE.enoki}</b> para auditar os meses já carregados.
        </p>
      )}
      {fonte === 'fundido' && trocadas.length > 0 && (
        <p className="mt-2 max-w-md rounded-lg border border-warn/40 bg-warn/5 p-2 text-xs text-gold-deep">
          {trocadas.length} linha(s) leram de outra fonte em algum mês, porque a configurada
          estava vazia: {trocadas.map((t) => META_LINHAS[t.linha].rotulo).join(', ')}. Sem isso o
          mês sairia com a linha zerada.
        </p>
      )}
      {configurando && <ModalFusao aoFechar={() => setConfigurando(false)} />}
    </div>
  )
}
