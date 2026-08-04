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

/**
 * Amostra de lançamentos de demonstração. VAZIA em produção: os dados reais
 * (jan–jun/2026) foram importados da DRE gerencial do cliente e vivem no Blob;
 * devolver qualquer amostra aqui faria o auto-sync injetar números falsos por
 * cima do realizado. Enquanto a integração com a Enoki não existir, o sync não
 * traz nada. Quando `SAFRAGOLD_BASE_URL`/`SAFRAGOLD_API_KEY` forem configurados,
 * `buscarDoSafragold()` assume e este caminho simulado deixa de ser usado.
 * (O cenário de demo para desenvolvimento fica no modo `?demo`, em src/dev/demo.tsx.)
 */
function lancamentosSimulados(): LancamentoCanonico[] {
  return []
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
