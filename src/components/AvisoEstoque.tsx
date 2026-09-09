// Aviso: o CPV deste mês descreve a COMPRA, não a VENDA.
//
// O DRE lança como custo toda a compra do mês. Num mês em que a empresa estoca,
// isso vira prejuízo contábil sem prejuízo econômico — agosto/2026 apareceu com
// R$ 2,3 milhões negativos porque comprou 99,7% da receita e ainda pagou frete.
//
// Um número desses sozinho na tela é pior que número nenhum: quem lê conclui que
// a operação perdeu dinheiro, e essa conclusão é cara. O aviso só aparece quando
// os dois sintomas coincidem (resultado negativo E compra comendo a receita),
// para não virar ruído nos meses em que o DRE fecha sozinho.
import { useMemo } from 'react'
import { Card } from './ui'
import { formatBRL } from '../lib/format'
import { avisosDeEstoque } from '../lib/estoqueImplicito'
import { CONTA_SEM_DETALHE_COMPRA, CONTA_AQUISICAO_GRAO } from '../lib/enokiDre'
import type { LancamentoCanonico, MapaClassificacao } from '../lib/tipos'
import { montarDre } from '../lib/dre'

/** Contas que representam AQUISIÇÃO de mercadoria (sem frete nem serviços). */
const CONTAS_COMPRA = new Set<string>([
  CONTA_SEM_DETALHE_COMPRA,
  ...Object.values(CONTA_AQUISICAO_GRAO),
])

export function AvisoEstoque({
  competencia,
  lancamentos,
  mapa,
}: {
  competencia: string
  lancamentos: LancamentoCanonico[]
  mapa: MapaClassificacao
}) {
  const aviso = useMemo(() => {
    const doMes = lancamentos.filter((l) => l.data?.slice(0, 7) === competencia)
    if (!doMes.length) return null
    const compras = doMes
      .filter((l) => CONTAS_COMPRA.has(l.contaSafragold))
      .reduce((s, l) => s + l.valor, 0)
    const dre = montarDre(competencia, lancamentos, mapa)
    const vendas = dre.linhas.find((l) => l.linha === 'receita_bruta')?.realizado ?? 0
    const [a] = avisosDeEstoque([
      { competencia, compras, vendas, lucroBruto: dre.realizado.lucroBruto },
    ])
    return a?.distorcido ? a : null
  }, [competencia, lancamentos, mapa])

  if (!aviso) return null

  return (
    <Card className="mb-4 animate-rise border-warn/40 bg-warn/5">
      <p className="text-sm text-gold-deep">
        ⚠️ <strong>Este prejuízo é do método, não necessariamente da operação.</strong> O custo
        deste mês é a <strong>compra do mês</strong> ({formatBRL(aviso.compras)}), e não o custo do
        que foi vendido. As compras equivalem a{' '}
        <strong>{(aviso.razao * 100).toFixed(1)}%</strong> da receita bruta, então o grão que entrou
        no armazém e ainda não saiu foi lançado como despesa aqui.
      </p>
      <p className="mt-2 text-sm text-muted">
        Fechar isso exige apropriação de estoque —{' '}
        <em>custo = estoque inicial + compras − estoque final</em> — que depende do saldo de estoque
        por grão. Enquanto ele não vem do ERP, o número fica assim: incompleto e dito.
      </p>
    </Card>
  )
}
