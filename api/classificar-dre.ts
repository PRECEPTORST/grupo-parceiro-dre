// Classificador de importação de DRE gerencial: recebe a DESCRIÇÃO de cada conta
// da planilha do cliente (que NÃO segue o nosso plano de contas) e devolve a linha
// do DRE mais adequada — ou 'ignorar' para subtotais, percentuais, seções e
// investimentos (capex), que não são contas de resultado.
//
// Só narra/sugere; a matemática e a decisão final (revisão + aprovação) são do app
// e do usuário. Saída estruturada via tool use (enum forçado). O front só manda as
// descrições AINDA não memorizadas — conta já classificada não volta para a IA.
import Anthropic from '@anthropic-ai/sdk'
import { authConfigurada, usuarioAtual, parseBody } from '../lib/auth.js'

const MODELO = 'claude-opus-4-8'

const LINHAS = [
  'receita_bruta',
  'deducoes',
  'custo_produto',
  'despesas_comerciais',
  'despesas_administrativas',
  'outras_receitas_operacionais',
  'depreciacao_amortizacao',
  'receita_financeira',
  'despesa_financeira',
  'impostos_lucro',
  'investimentos',
  'ignorar',
] as const

const GUIA = `Você classifica contas de uma DRE gerencial (comércio de grãos) na linha correta do DRE, PELA DESCRIÇÃO da conta. Linhas:
- receita_bruta: venda de grãos/serviços (faturamento bruto).
- deducoes: ICMS, PIS, COFINS, Funrural, ISS, devoluções, abatimentos sobre vendas.
- custo_produto: CPV — compra de cereais/grãos, armazenagem, frete de compra/logística da mercadoria, classificação, quebras/qualidade.
- despesas_comerciais: comissão de vendas, frete de venda, marketing/propaganda, brindes, feiras/eventos.
- despesas_administrativas: salários, pró-labore, retirada de sócios, aluguel, contabilidade, advogado, software, combustível, benefícios, perdas com inadimplência, e despesas de escritório em geral.
- outras_receitas_operacionais: recuperação de créditos, reversão de despesas, receitas fora da venda principal.
- depreciacao_amortizacao: depreciação/amortização.
- receita_financeira: juros recebidos, rendimentos de aplicação, descontos obtidos.
- despesa_financeira: juros pagos, IOF, tarifas bancárias, descontos concedidos.
- impostos_lucro: IRPJ, CSLL.
- investimentos: CAPEX — aquisição de imobilizado: compra de veículos, terrenos, consórcios, máquinas, benfeitorias. Fica ABAIXO do resultado (não é despesa operacional), mas DEVE ser classificado aqui (não ignorado).
- ignorar: use APENAS para SUBTOTAIS (receita líquida, custo total, despesa total, lucro bruto, margem, ROE, acumulado, resultado, lucro/prejuízo), PERCENTUAIS e cabeçalhos de seção. Não são contas.`

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
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada.' })
    return
  }

  const { descricoes } = parseBody(req) as { descricoes?: string[] }
  if (!Array.isArray(descricoes) || descricoes.length === 0) {
    res.status(400).json({ erro: 'Envie { descricoes: [string] }.' })
    return
  }
  const limpa = descricoes.map((d) => String(d ?? '').trim()).filter(Boolean).slice(0, 200)
  const lista = limpa.map((d) => `- "${d}"`).join('\n')

  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 3000,
      tool_choice: { type: 'tool', name: 'classificar_contas' },
      tools: [
        {
          name: 'classificar_contas',
          description: 'Classifica cada descrição de conta em uma linha do DRE (ou ignorar).',
          input_schema: {
            type: 'object',
            properties: {
              classificacoes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    descricao: { type: 'string', description: 'A descrição EXATA recebida.' },
                    linha: { type: 'string', enum: LINHAS as unknown as string[] },
                    confianca: { type: 'number', description: 'De 0 a 1. Use < 0.8 na dúvida real.' },
                  },
                  required: ['descricao', 'linha', 'confianca'],
                },
              },
            },
            required: ['classificacoes'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `${GUIA}\n\nClassifique cada conta abaixo pela descrição. Devolva a MESMA descrição recebida em cada item.\n\n${lista}`,
        },
      ],
    })

    const bloco = resp.content.find((b) => b.type === 'tool_use') as
      | { input?: { classificacoes?: unknown[] } }
      | undefined
    const classificacoes = (bloco?.input?.classificacoes ?? []).filter(
      (c: any) => c && typeof c.descricao === 'string' && LINHAS.includes(c.linha),
    )
    res.status(200).json({ classificacoes })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha na classificação: ${e?.message ?? String(e)}` })
  }
}
