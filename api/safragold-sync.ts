// Ingestão dos lançamentos conciliados do Safragold.
//
// >>> PASSO 0 do Sprint 1 <<<
// Este é o ponto que a proposta chama de "primeiro descobrimos como o Safragold
// entrega os dados". Enquanto NÃO soubermos (API REST? banco? export?), esta
// função devolve dados SIMULADOS para o app ser navegável e demonstrável.
//
// Quando o acesso real existir:
//   1. Preencher SAFRAGOLD_BASE_URL / SAFRAGOLD_API_KEY no ambiente.
//   2. Implementar `buscarDoSafragold()` abaixo (fetch/SQL).
//   3. Mapear a resposta crua para LancamentoCanonico em `normalizar()`.
//      Aqui é onde débito/crédito vira `valor` positivo na magnitude da linha.
import { authConfigurada, usuarioAtual } from '../lib/auth.js'

interface LancamentoCanonico {
  id: string
  data: string
  contaSafragold: string
  historico: string
  valor: number
  centroCusto?: string
}

function safragoldConfigurado(): boolean {
  return !!process.env.SAFRAGOLD_BASE_URL && !!process.env.SAFRAGOLD_API_KEY
}

/** TODO: implementar quando tivermos o acesso real ao Safragold. */
async function buscarDoSafragold(): Promise<any[]> {
  // Exemplo do que deve virar aqui:
  // const r = await fetch(`${process.env.SAFRAGOLD_BASE_URL}/lancamentos?conciliados=true`, {
  //   headers: { Authorization: `Bearer ${process.env.SAFRAGOLD_API_KEY}` },
  // })
  // return (await r.json()).dados
  throw new Error('Integração Safragold ainda não implementada.')
}

/** Normaliza a resposta crua do Safragold para o formato canônico. */
function normalizar(brutos: any[]): LancamentoCanonico[] {
  // TODO: mapear os campos reais do Safragold. Placeholder defensivo:
  return brutos.map((b, i) => ({
    id: String(b.id ?? `sg-${i}`),
    data: String(b.data ?? b.competencia ?? ''),
    contaSafragold: String(b.conta ?? b.contaContabil ?? ''),
    historico: String(b.historico ?? ''),
    valor: Math.abs(Number(b.valor ?? 0)),
    centroCusto: b.centroCusto ? String(b.centroCusto) : undefined,
  }))
}

/** Amostra de lançamentos de um grupo de grãos, para demo enquanto não há Safragold. */
function lancamentosSimulados(): LancamentoCanonico[] {
  return [
    { id: 'sim-1', data: '2026-06-05', contaSafragold: '3.1.01', historico: 'Venda de soja - contrato 4471', valor: 1_240_000 },
    { id: 'sim-2', data: '2026-06-08', contaSafragold: '3.1.01', historico: 'Venda de milho - contrato 4478', valor: 610_000 },
    { id: 'sim-3', data: '2026-06-10', contaSafragold: '3.2.01', historico: 'ICMS sobre vendas', valor: 205_000 },
    { id: 'sim-4', data: '2026-06-10', contaSafragold: '3.2.02', historico: 'Funrural', valor: 34_000 },
    { id: 'sim-5', data: '2026-06-12', contaSafragold: '4.1.01', historico: 'Aquisição de grãos p/ revenda', valor: 980_000 },
    { id: 'sim-6', data: '2026-06-15', contaSafragold: '4.1.05', historico: 'Frete sobre compras', valor: 72_000 },
    { id: 'sim-7', data: '2026-06-18', contaSafragold: '4.2.10', historico: 'Comissão de vendas', valor: 41_000 },
    { id: 'sim-8', data: '2026-06-20', contaSafragold: '4.3.01', historico: 'Folha administrativa', valor: 88_000 },
    { id: 'sim-9', data: '2026-06-22', contaSafragold: '4.3.08', historico: 'Aluguel do escritório', valor: 15_000 },
    { id: 'sim-10', data: '2026-06-25', contaSafragold: '4.4.01', historico: 'Juros de empréstimo Banco X', valor: 27_500 },
    { id: 'sim-11', data: '2026-06-28', contaSafragold: '3.5.01', historico: 'Rendimento de aplicação CDB', valor: 9_800 },
    // Competência anterior, para exercitar o seletor de mês:
    { id: 'sim-12', data: '2026-05-30', contaSafragold: '3.1.01', historico: 'Venda de soja - contrato 4460', valor: 1_050_000 },
  ]
}

export default async function handler(req: any, res: any) {
  if (!authConfigurada()) {
    res.status(500).json({ erro: 'Autenticação não configurada.' })
    return
  }
  const atual = await usuarioAtual(req)
  if (!atual) {
    res.status(401).json({ erro: 'Não autenticado.' })
    return
  }

  try {
    if (!safragoldConfigurado()) {
      res.status(200).json({ simulado: true, lancamentos: lancamentosSimulados() })
      return
    }
    const brutos = await buscarDoSafragold()
    res.status(200).json({ simulado: false, lancamentos: normalizar(brutos) })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha ao sincronizar Safragold: ${e?.message ?? String(e)}` })
  }
}
