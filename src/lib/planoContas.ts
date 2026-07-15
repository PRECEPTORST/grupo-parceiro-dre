// Plano de contas padrão para COMÉRCIO DE GRÃOS (compra e venda de soja, milho,
// café etc. + armazenagem e logística). É o catálogo canônico do app: já vem
// classificado por linha do DRE, então dá para orçar e ler o DRE mesmo sem
// lançamentos. As classificações do usuário (manuais ou pela IA) SEMPRE têm
// prioridade sobre este plano — ver `mapaEfetivo`.
import {
  LINHAS_DRE,
  META_LINHAS,
  type LinhaDRE,
  type Classificacao,
  type LancamentoCanonico,
  type MapaClassificacao,
} from './tipos'
import { mapaDeClassificacoes, type GrupoContas } from './dre'

export interface PlanoConta {
  conta: string
  descricao: string
  linha: LinhaDRE
}

export const PLANO_CONTAS: PlanoConta[] = [
  // ---- Receita bruta de vendas ----
  { conta: '3.1.01', descricao: 'Venda de soja', linha: 'receita_bruta' },
  { conta: '3.1.02', descricao: 'Venda de milho', linha: 'receita_bruta' },
  { conta: '3.1.03', descricao: 'Venda de sorgo', linha: 'receita_bruta' },
  { conta: '3.1.04', descricao: 'Venda de trigo', linha: 'receita_bruta' },
  { conta: '3.1.05', descricao: 'Venda de café', linha: 'receita_bruta' },
  { conta: '3.1.06', descricao: 'Venda de feijão', linha: 'receita_bruta' },
  { conta: '3.1.07', descricao: 'Venda de sementes', linha: 'receita_bruta' },
  { conta: '3.1.08', descricao: 'Venda de insumos e fertilizantes', linha: 'receita_bruta' },
  { conta: '3.1.09', descricao: 'Receita de armazenagem', linha: 'receita_bruta' },
  { conta: '3.1.10', descricao: 'Receita de secagem e limpeza', linha: 'receita_bruta' },
  { conta: '3.1.11', descricao: 'Receita de classificação de grãos', linha: 'receita_bruta' },
  { conta: '3.1.12', descricao: 'Receita de frete e logística', linha: 'receita_bruta' },
  { conta: '3.1.13', descricao: 'Corretagem e intermediação', linha: 'receita_bruta' },
  { conta: '3.1.14', descricao: 'Prêmios de qualidade e bonificações', linha: 'receita_bruta' },

  // ---- Deduções e impostos sobre vendas ----
  { conta: '3.2.01', descricao: 'ICMS sobre vendas', linha: 'deducoes' },
  { conta: '3.2.02', descricao: 'PIS sobre vendas', linha: 'deducoes' },
  { conta: '3.2.03', descricao: 'COFINS sobre vendas', linha: 'deducoes' },
  { conta: '3.2.04', descricao: 'Funrural', linha: 'deducoes' },
  { conta: '3.2.05', descricao: 'ISS sobre serviços', linha: 'deducoes' },
  { conta: '3.2.06', descricao: 'Devoluções de vendas', linha: 'deducoes' },
  { conta: '3.2.07', descricao: 'Abatimentos e descontos comerciais', linha: 'deducoes' },

  // ---- Custo dos produtos vendidos (CPV/CMV) ----
  { conta: '4.1.01', descricao: 'Aquisição de soja', linha: 'custo_produto' },
  { conta: '4.1.02', descricao: 'Aquisição de milho', linha: 'custo_produto' },
  { conta: '4.1.03', descricao: 'Aquisição de sorgo', linha: 'custo_produto' },
  { conta: '4.1.04', descricao: 'Aquisição de trigo', linha: 'custo_produto' },
  { conta: '4.1.05', descricao: 'Aquisição de café', linha: 'custo_produto' },
  { conta: '4.1.06', descricao: 'Aquisição de sementes e insumos p/ revenda', linha: 'custo_produto' },
  { conta: '4.1.10', descricao: 'Frete sobre compras', linha: 'custo_produto' },
  { conta: '4.1.11', descricao: 'Armazenagem de terceiros', linha: 'custo_produto' },
  { conta: '4.1.12', descricao: 'Secagem e limpeza (custo)', linha: 'custo_produto' },
  { conta: '4.1.13', descricao: 'Classificação e análise de grãos', linha: 'custo_produto' },
  { conta: '4.1.14', descricao: 'Quebra técnica e perda de estoque', linha: 'custo_produto' },
  { conta: '4.1.15', descricao: 'Seguro de mercadoria e estoque', linha: 'custo_produto' },
  { conta: '4.1.16', descricao: 'Royalties de sementes (tecnologia)', linha: 'custo_produto' },
  { conta: '4.1.17', descricao: 'Ensacamento e embalagem', linha: 'custo_produto' },

  // ---- Despesas comerciais ----
  { conta: '4.2.01', descricao: 'Comissões de vendas', linha: 'despesas_comerciais' },
  { conta: '4.2.02', descricao: 'Corretagem paga', linha: 'despesas_comerciais' },
  { conta: '4.2.03', descricao: 'Frete sobre vendas', linha: 'despesas_comerciais' },
  { conta: '4.2.04', descricao: 'Marketing e publicidade', linha: 'despesas_comerciais' },
  { conta: '4.2.05', descricao: 'Viagens e representação comercial', linha: 'despesas_comerciais' },
  { conta: '4.2.06', descricao: 'Provisão para devedores duvidosos (PDD)', linha: 'despesas_comerciais' },
  { conta: '4.2.07', descricao: 'Despesas com exportação (despacho, portuárias)', linha: 'despesas_comerciais' },

  // ---- Despesas administrativas ----
  { conta: '4.3.01', descricao: 'Salários e ordenados (administrativo)', linha: 'despesas_administrativas' },
  { conta: '4.3.02', descricao: 'Encargos sociais (INSS/FGTS)', linha: 'despesas_administrativas' },
  { conta: '4.3.03', descricao: 'Pró-labore', linha: 'despesas_administrativas' },
  { conta: '4.3.04', descricao: 'Benefícios (VT/VR/plano de saúde)', linha: 'despesas_administrativas' },
  { conta: '4.3.05', descricao: 'Honorários contábeis', linha: 'despesas_administrativas' },
  { conta: '4.3.06', descricao: 'Honorários advocatícios e consultoria', linha: 'despesas_administrativas' },
  { conta: '4.3.07', descricao: 'Aluguel e condomínio', linha: 'despesas_administrativas' },
  { conta: '4.3.08', descricao: 'Energia elétrica', linha: 'despesas_administrativas' },
  { conta: '4.3.09', descricao: 'Água e saneamento', linha: 'despesas_administrativas' },
  { conta: '4.3.10', descricao: 'Telefonia e internet', linha: 'despesas_administrativas' },
  { conta: '4.3.11', descricao: 'Software e licenças (ERP, sistemas)', linha: 'despesas_administrativas' },
  { conta: '4.3.12', descricao: 'Material de escritório', linha: 'despesas_administrativas' },
  { conta: '4.3.13', descricao: 'Manutenção e conservação', linha: 'despesas_administrativas' },
  { conta: '4.3.14', descricao: 'Combustíveis e manutenção de veículos', linha: 'despesas_administrativas' },
  { conta: '4.3.15', descricao: 'Seguros administrativos', linha: 'despesas_administrativas' },
  { conta: '4.3.16', descricao: 'Viagens e estadias (administrativo)', linha: 'despesas_administrativas' },
  { conta: '4.3.17', descricao: 'Taxas e contribuições (associações, sindicatos)', linha: 'despesas_administrativas' },
  { conta: '4.3.18', descricao: 'Treinamento e capacitação', linha: 'despesas_administrativas' },
  { conta: '4.3.19', descricao: 'Segurança e vigilância', linha: 'despesas_administrativas' },

  // ---- Outras receitas operacionais ----
  { conta: '3.4.01', descricao: 'Receita de locação de bens', linha: 'outras_receitas_operacionais' },
  { conta: '3.4.02', descricao: 'Venda de sucata e resíduos', linha: 'outras_receitas_operacionais' },
  { conta: '3.4.03', descricao: 'Subvenções e incentivos fiscais', linha: 'outras_receitas_operacionais' },
  { conta: '3.4.04', descricao: 'Recuperação de despesas', linha: 'outras_receitas_operacionais' },
  { conta: '3.4.05', descricao: 'Ganho na venda de imobilizado', linha: 'outras_receitas_operacionais' },

  // ---- Depreciação e amortização ----
  { conta: '4.5.01', descricao: 'Depreciação de máquinas e equipamentos', linha: 'depreciacao_amortizacao' },
  { conta: '4.5.02', descricao: 'Depreciação de silos e armazéns', linha: 'depreciacao_amortizacao' },
  { conta: '4.5.03', descricao: 'Depreciação de veículos', linha: 'depreciacao_amortizacao' },
  { conta: '4.5.04', descricao: 'Depreciação de benfeitorias', linha: 'depreciacao_amortizacao' },
  { conta: '4.5.05', descricao: 'Amortização de intangíveis', linha: 'depreciacao_amortizacao' },

  // ---- Receitas financeiras ----
  { conta: '3.5.01', descricao: 'Rendimentos de aplicações financeiras', linha: 'receita_financeira' },
  { conta: '3.5.02', descricao: 'Juros ativos recebidos', linha: 'receita_financeira' },
  { conta: '3.5.03', descricao: 'Descontos obtidos', linha: 'receita_financeira' },
  { conta: '3.5.04', descricao: 'Variação cambial ativa', linha: 'receita_financeira' },
  { conta: '3.5.05', descricao: 'Ganhos com hedge e derivativos (B3)', linha: 'receita_financeira' },

  // ---- Despesas financeiras ----
  { conta: '4.4.01', descricao: 'Juros sobre empréstimos e financiamentos', linha: 'despesa_financeira' },
  { conta: '4.4.02', descricao: 'Juros de capital de giro', linha: 'despesa_financeira' },
  { conta: '4.4.03', descricao: 'Tarifas bancárias', linha: 'despesa_financeira' },
  { conta: '4.4.04', descricao: 'IOF', linha: 'despesa_financeira' },
  { conta: '4.4.05', descricao: 'Descontos concedidos', linha: 'despesa_financeira' },
  { conta: '4.4.06', descricao: 'Variação cambial passiva', linha: 'despesa_financeira' },
  { conta: '4.4.07', descricao: 'Perdas com hedge e derivativos (B3)', linha: 'despesa_financeira' },
  { conta: '4.4.08', descricao: 'Juros de barter e CPR', linha: 'despesa_financeira' },

  // ---- Impostos sobre o lucro ----
  { conta: '4.6.01', descricao: 'IRPJ', linha: 'impostos_lucro' },
  { conta: '4.6.02', descricao: 'CSLL', linha: 'impostos_lucro' },
]

/** Mapa conta → linha do plano padrão. */
export const MAPA_PLANO: MapaClassificacao = Object.fromEntries(
  PLANO_CONTAS.map((c) => [c.conta, c.linha]),
) as MapaClassificacao

/** Descrição da conta no plano padrão (para exibir nomes bonitos). */
export const DESCRICAO_PLANO: Record<string, string> = Object.fromEntries(
  PLANO_CONTAS.map((c) => [c.conta, c.descricao]),
)

/** Nome da conta no plano; cai no `fallback` (ex.: histórico) se não estiver no plano. */
export function nomeConta(conta: string, fallback = ''): string {
  return DESCRICAO_PLANO[conta] || fallback
}

/**
 * Mapa efetivo conta → linha: o plano padrão como BASE, sobreposto pelas
 * classificações do usuário (que sempre vencem). Assim toda conta do plano já
 * nasce classificada, mas o Controler pode reclassificar qualquer uma.
 */
export function mapaEfetivo(classificacoes: Classificacao[]): MapaClassificacao {
  return { ...MAPA_PLANO, ...mapaDeClassificacoes(classificacoes) }
}

/** Plano padrão como classificações (para semear o estado, se desejado). */
export function classificacoesDoPlano(): Classificacao[] {
  return PLANO_CONTAS.map((c) => ({
    contaSafragold: c.conta,
    linha: c.linha,
    confianca: 1,
    justificativa: 'Plano de contas padrão (grãos)',
  }))
}

/**
 * Catálogo de contas por linha para orçar: todas as contas do plano + quaisquer
 * contas extras já vistas nos lançamentos, agrupadas pela linha do DRE.
 */
export function catalogoPorLinha(
  lancamentos: LancamentoCanonico[],
  mapa: MapaClassificacao,
): GrupoContas[] {
  const porLinha: Record<LinhaDRE, Map<string, string>> = Object.fromEntries(
    LINHAS_DRE.map((l) => [l, new Map<string, string>()]),
  ) as Record<LinhaDRE, Map<string, string>>

  for (const c of PLANO_CONTAS) porLinha[c.linha].set(c.conta, c.descricao)

  for (const l of lancamentos) {
    const linha = mapa[l.contaSafragold]
    if (!linha) continue
    if (!porLinha[linha].has(l.contaSafragold)) {
      porLinha[linha].set(l.contaSafragold, l.historico || DESCRICAO_PLANO[l.contaSafragold] || '')
    }
  }

  return LINHAS_DRE.map((linha) => ({
    linha,
    rotulo: META_LINHAS[linha].rotulo,
    contas: [...porLinha[linha].entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([conta, descricao]) => ({ conta, descricao })),
  }))
}
