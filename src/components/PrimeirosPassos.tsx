// O que fazer quando o app está vazio.
//
// Sem isto, quem abre o GPResults pela primeira vez vê uma tela em branco e um
// punhado de botões sem hierarquia. Os passos abaixo são uma SEQUÊNCIA real: sem
// carregar os dados não há DRE, e sem DRE não faz sentido conferir nem
// complementar. Por isso são numerados.
import { useAuth } from '../context/AuthContext'
import { podeAdministrar } from '../lib/permissoes'
import { Card, Kicker } from './ui'

interface Passo {
  titulo: string
  detalhe: string
}

const PASSOS: Passo[] = [
  {
    titulo: 'Carregar os dados da Enoki',
    detalhe:
      'Vá em Lançamentos e clique em “Carregar”. O app puxa as notas fiscais e os títulos do ano e monta o DRE por competência sozinho. A primeira carga leva alguns minutos.',
  },
  {
    titulo: 'Conferir o DRE',
    detalhe:
      'Na aba DRE aparece o resultado mês a mês, aberto por conta, com o resultado por cereal e o R$ por saca.',
  },
  {
    titulo: 'Completar o que a Enoki não tem',
    detalhe:
      'Folha, depreciação, juros e IRPJ quase não passam pelo módulo financeiro do ERP. Use “Lançar estrutura” (ou importe a planilha da DRE gerencial) para o resultado ficar completo.',
  },
  {
    titulo: 'Auditar',
    detalhe:
      'A aba Confiabilidade compara as duas fontes, lista as divergências materiais e aponta o que precisa ser questionado antes de o número virar verdade.',
  },
]

export function PrimeirosPassos() {
  const { usuario } = useAuth()
  const admin = podeAdministrar(usuario?.papel)

  return (
    <Card className="animate-rise">
      <Kicker>Primeiros passos</Kicker>
      <h2 className="mt-1 text-lg font-bold text-ink">Ainda não há dados carregados</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        {admin
          ? 'O GPResults monta o DRE a partir do que já existe na Enoki. São quatro passos, uma vez só:'
          : 'O GPResults monta o DRE a partir do que já existe na Enoki. Um administrador precisa fazer a carga inicial — depois disso, tudo aparece aqui.'}
      </p>

      {admin && (
        <ol className="mt-4 space-y-3">
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green/10 font-head text-xs font-semibold text-green-deep">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">{p.titulo}</div>
                <p className="text-sm text-muted">{p.detalhe}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
