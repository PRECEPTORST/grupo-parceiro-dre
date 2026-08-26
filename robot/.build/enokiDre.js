// src/lib/tipos.ts
var GRAOS = ["soja", "milho", "sorgo", "cafe"];

// src/lib/centroCusto.ts
var VEM_DA_NF = "NF";
function normalizarRotulo(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
var REGRAS_CENTRO_CUSTO = {
  // ---- Receita de grão: o fato gerador é a NF; pagamento aqui = devolução ----
  "RECEITA SOJA - MERCADO INTERNO": { entrada: VEM_DA_NF, saida: "3.2.06", natural: "entrada" },
  "RECEITA MILHO - MERCADO INTERNO": { entrada: VEM_DA_NF, saida: "3.2.06", natural: "entrada" },
  "RECEITA SORGO - MERCADO INTERNO": { entrada: VEM_DA_NF, saida: "3.2.06", natural: "entrada" },
  "RECEITA CAFE - MERCADO INTERNO": { entrada: VEM_DA_NF, saida: "3.2.06", natural: "entrada" },
  "DEVOLUCAO SOJA - MERCADO INTERNO": { saida: "3.2.06", natural: "saida" },
  "DEVOLUCAO MILHO - MERCADO INTERNO": { saida: "3.2.06", natural: "saida" },
  "DEVOLUCAO SORGO - MERCADO INTERNO": { saida: "3.2.06", natural: "saida" },
  "DEVOLUCAO CAFE - MERCADO INTERNO": { saida: "3.2.06", natural: "saida" },
  // ---- Outras receitas ----
  "RECEITA SERVICOS DE CORRETAGEM - MERCADO INTERNO": { entrada: "3.1.13", natural: "entrada" },
  "OUTRAS RECEITAS": { entrada: "3.4.04", natural: "entrada" },
  // ---- CPV: aquisição de grão ----
  // O fato gerador do CUSTO é a NOTA DE ENTRADA, exatamente como o da receita é
  // a nota de saída. Contar também o título seria contar a mesma compra duas
  // vezes — e era: em julho as notas davam R$ 20,1M e os títulos mais R$ 3,8M
  // da MESMA mercadoria. O título pago sai; só a direção contrária (recebimento
  // num centro de compra = estorno) vira lançamento.
  "COMPRA SOJA": { saida: VEM_DA_NF, estorno: "4.1.01", natural: "saida" },
  "COMPRA MILHO": { saida: VEM_DA_NF, estorno: "4.1.02", natural: "saida" },
  "COMPRA SORGO": { saida: VEM_DA_NF, estorno: "4.1.03", natural: "saida" },
  "COMPRA CAFE": { saida: VEM_DA_NF, estorno: "4.1.05", natural: "saida" },
  // ---- CPV: custos compartilhados (frete, armazém, beneficiamento) ----
  // Frete sobre COMPRA vem do CT-e (nota de entrada), como todo custo. O título
  // é o pagamento do mesmo frete — mesmos transportadores, os dois lados
  // conferidos. Frete sobre VENDA continua vindo do título: o CT-e de saída não
  // distingue as duas pontas com segurança.
  FRETE: { saida: VEM_DA_NF, estorno: "4.1.10", entrada: "3.1.12", natural: "saida" },
  // Produção usa rótulos mais específicos que a homologação — descobertos ao
  // ler o ERP real em 2026-08-26. "FRETE SOBRE COMPRA" sozinho eram 155 títulos
  // num único mês; sem esta linha, todos viravam resíduo.
  "FRETE SOBRE COMPRA": { saida: VEM_DA_NF, estorno: "4.1.10", natural: "saida" },
  "FRETE SOBRE VENDA": { saida: "4.2.03", natural: "saida" },
  "ARMAZENAGEM SOJA": { saida: "4.1.11", entrada: "3.1.09", natural: "saida" },
  "ARMAZENAGEM MILHO": { saida: "4.1.11", entrada: "3.1.09", natural: "saida" },
  "ARMAZENAGEM SORGO": { saida: "4.1.11", entrada: "3.1.09", natural: "saida" },
  "ARMAZENAGEM CAFE": { saida: "4.1.11", entrada: "3.1.09", natural: "saida" },
  // ---- Deduções / tributos sobre a operação ----
  "ICMS CREDITO PRESUMIDO": { saida: "3.2.01", natural: "saida" },
  "ICMS - SOBRE COMPRAS": { saida: "3.2.01", natural: "saida" },
  // ---- Despesas comerciais ----
  "MARKETING / PROPAGANDA": { saida: "4.2.04", natural: "saida" },
  BRINDES: { saida: "4.2.04", natural: "saida" },
  "FEIRAS & EVENTOS": { saida: "4.2.05", natural: "saida" },
  // ---- Despesas administrativas ----
  FERIAS: { saida: "4.3.01", natural: "saida" },
  "BRINDES PARA COLABORADORES": { saida: "4.3.04", natural: "saida" },
  "REFEICOES E LANCHES": { saida: "4.3.04", natural: "saida" },
  UNIFORMES: { saida: "4.3.04", natural: "saida" },
  AGUA: { saida: "4.3.09", natural: "saida" },
  "MANUTENCAO SOFTWARE & SISTEMA": { saida: "4.3.11", natural: "saida" },
  "SOFTWARE & SISTEMA": { saida: "4.3.11", natural: "saida" },
  "MATERIAL DE ESCRITORIO": { saida: "4.3.12", natural: "saida" },
  "MATERIAIS DE LIMPEZA": { saida: "4.3.12", natural: "saida" },
  "MANUTENCAO DE VEICULOS": { saida: "4.3.14", natural: "saida" },
  "COMBUSTIVEIS E LUBRIFICANTES": { saida: "4.3.14", natural: "saida" },
  "OUTRAS DESPESAS": { saida: "4.3.20", natural: "saida" },
  SEGUROS: { saida: "4.3.15", natural: "saida" },
  "SEGURO DE VEICULOS": { saida: "4.3.15", natural: "saida" },
  // ---- Centros vistos só no ERP de PRODUÇÃO, a partir de agosto/2026 ----
  // A folha EXISTE — ela só não usava estes rótulos em homologação, e por isso
  // eu disse ao cliente que o ERP não tinha folha. Tinha: "PESSOAL" são 54
  // títulos, e ainda SENAR, CSRF, vale-alimentação e ajuda de custo.
  PESSOAL: { saida: "4.3.01", natural: "saida" },
  "AJUDA DE CUSTO": { saida: "4.3.01", natural: "saida" },
  SENAR: { saida: "4.3.02", natural: "saida" },
  "CSRF - CONTRIBUICAO SOCIAIS RETIDA NA FONTE": { saida: "4.3.02", natural: "saida" },
  "VALE ALIMENTACAO": { saida: "4.3.04", natural: "saida" },
  "COPA E COZINHA": { saida: "4.3.04", natural: "saida" },
  "UNIFORMES E EPI": { saida: "4.3.04", natural: "saida" },
  CONTABILIDADE: { saida: "4.3.05", natural: "saida" },
  JURIDICO: { saida: "4.3.06", natural: "saida" },
  "ASSESSORIA/CONSULTORIA": { saida: "4.3.06", natural: "saida" },
  "TELEFONE & CELULARES": { saida: "4.3.10", natural: "saida" },
  "TI - TECNOLOGIA DA INFORMACAO": { saida: "4.3.11", natural: "saida" },
  HOSPEDAGEM: { saida: "4.3.16", natural: "saida" },
  "CURSOS & TREINAMENTOS": { saida: "4.3.18", natural: "saida" },
  "TAXAS BANCARIAS": { saida: "4.4.03", natural: "saida" },
  IOF: { saida: "4.4.04", natural: "saida" },
  // Classificação de grão é CPV, não despesa: mede umidade e impureza do lote.
  "CLASSIFICACAO MILHO": { saida: "4.1.13", natural: "saida" },
  "CLASSIFICACAO SOJA": { saida: "4.1.13", natural: "saida" },
  "CLASSIFICACAO SORGO": { saida: "4.1.13", natural: "saida" },
  "CLASSIFICACAO CAFE": { saida: "4.1.13", natural: "saida" },
  "ICMS - DIFAL": { saida: "3.2.01", natural: "saida" },
  "PARCELAMENTO ICMS": { saida: "3.2.01", natural: "saida" },
  "RECEITA SOJA - EXPORTACAO": { entrada: VEM_DA_NF, saida: "3.2.06", natural: "entrada" },
  "RECEITA MILHO - EXPORTACAO": { entrada: VEM_DA_NF, saida: "3.2.06", natural: "entrada" },
  "RECEITA SORGO - EXPORTACAO": { entrada: VEM_DA_NF, saida: "3.2.06", natural: "entrada" },
  "RECEITA CAFE - EXPORTACAO": { entrada: VEM_DA_NF, saida: "3.2.06", natural: "entrada" },
  "EMPRESTIMO ENTRE GRUPO": { natural: "saida", ignorar: true },
  "COMISSAO ORIGINADORES GRUPO": {
    saida: "4.2.01",
    natural: "saida",
    confirmar: 'Comiss\xE3o dos originadores tratada como despesa comercial. Se "GRUPO" significar outra empresa do grupo, vira elimina\xE7\xE3o intragrupo.'
  },
  GRATIFICACOES: { saida: "4.3.01", natural: "saida" },
  FUNRURAL: { saida: "3.2.04", natural: "saida" },
  "COMISSAO TERCEIROS": { saida: "4.2.01", natural: "saida" },
  // Recuperação de inadimplência é RECEITA (a perda já foi lançada antes).
  "RECUPERACAO DE PREJUIZO - INADIMPLENCIA": { entrada: "3.4.04", natural: "entrada" },
  // ---- Financeiras ----
  "JUROS SOBRE EMPRESTIMOS": { saida: "4.4.01", entrada: "3.5.02", natural: "saida" },
  "JUROS SOBRE ANTECIPACAO DE RECEBIVEIS": { saida: "4.4.05", entrada: "3.5.02", natural: "saida" },
  "EMPRESTIMO DE TERCEIROS": { saida: "4.4.01", entrada: "3.5.02", natural: "saida" },
  // ---- Investimentos (capex — abaixo do resultado, §19) ----
  IMOBILIZADO: { saida: "5.1.01", natural: "saida" },
  "CONSORCIOS CONTEMPLADO": { saida: "5.1.03", natural: "saida" },
  "OBRA - SEDE DO GRUPO": { saida: "5.1.04", natural: "saida" },
  MOVEIS: {
    saida: "5.1.05",
    natural: "saida",
    confirmar: "M\xF3veis/utens\xEDlios tratados como capex (\xA719). Se forem consumo, reclassificar em 4.3.12."
  },
  // ---- Fora do DRE: contas patrimoniais e eliminação intragrupo ----
  "ADIANTAMENTO DE CLIENTE": { natural: "entrada", ignorar: true },
  "ADIANTAMENTO FORNECEDOR": { natural: "saida", ignorar: true },
  "RATEIO ENTRE AS EMPRESAS DO GRUPO": { natural: "saida", ignorar: true }
};
var SEM_CENTRO_CUSTO = "SEM CC";
function destinoDeCentroCusto(cc, fluxo) {
  const chave = normalizarRotulo(cc);
  if (!chave || chave === SEM_CENTRO_CUSTO) return null;
  const regra = REGRAS_CENTRO_CUSTO[chave];
  if (!regra) return null;
  if (regra.ignorar) {
    return { conta: "", sinal: 1, ignorar: true, motivo: "patrimonial_ou_intragrupo" };
  }
  const contaDireta = fluxo === "entrada" ? regra.entrada : regra.saida;
  if (contaDireta === VEM_DA_NF) {
    return {
      conta: "",
      sinal: 1,
      ignorar: true,
      motivo: fluxo === "saida" ? "custo_vem_da_nf" : "receita_vem_da_nf"
    };
  }
  if (contaDireta) return { conta: contaDireta, sinal: 1, ignorar: false };
  if (regra.estorno) {
    return { conta: regra.estorno, sinal: -1, ignorar: false, motivo: "estorno" };
  }
  const contaNatural = regra.natural === "entrada" ? regra.entrada : regra.saida;
  if (!contaNatural || contaNatural === VEM_DA_NF) return null;
  return { conta: contaNatural, sinal: -1, ignorar: false, motivo: "estorno" };
}

// src/lib/cfop.ts
var VENDA = /* @__PURE__ */ new Set([
  "101",
  "102",
  "103",
  "104",
  "105",
  "106",
  "107",
  "108",
  "109",
  "110",
  "111",
  "112",
  "113",
  "114",
  "115",
  "116",
  "117",
  "118",
  "119",
  "120",
  "122",
  "123",
  // Fim específico de exportação — ver a nota de confirmação acima.
  "501",
  "502",
  // Faturamento de venda para entrega futura.
  "922"
]);
var DEVOLUCAO_VENDA = /* @__PURE__ */ new Set([
  "201",
  "202",
  "203",
  "204",
  "205",
  "206",
  "207",
  "208",
  "209",
  "210",
  "211",
  "212",
  // Retorno/devolução de mercadoria remetida para formação de lote de exportação
  // (é a contrapartida do 6502 que não se concretizou).
  "503",
  "504"
]);
var REMESSA = /* @__PURE__ */ new Set([
  "901",
  "902",
  "903",
  "904",
  "905",
  "906",
  "907",
  "908",
  "909",
  "910",
  "911",
  "912",
  "913",
  "914",
  "915",
  "916",
  "917",
  "918",
  "919",
  "920",
  "921",
  "923",
  "924",
  "925",
  "926",
  "927",
  "934",
  "949"
]);
var SERVICO_TRANSPORTE = /* @__PURE__ */ new Set(["351", "352", "353", "354", "355", "356", "932"]);
var TRANSFERENCIA = /* @__PURE__ */ new Set(["151", "152", "153", "155", "156", "551", "552", "553", "555", "556"]);
function digitosCfop(cfop) {
  return String(cfop ?? "").replace(/\D/g, "");
}
function sufixoCfop(cfop) {
  const d = digitosCfop(cfop);
  return d.length >= 4 ? d.slice(-3) : "";
}
function cfopDeEntrada(cfop) {
  return /^[123]/.test(digitosCfop(cfop));
}
function naturezaDeCfop(cfop, entrada) {
  const sufixo = sufixoCfop(cfop);
  if (!sufixo) return "outro";
  if (TRANSFERENCIA.has(sufixo)) return "transferencia";
  if (DEVOLUCAO_VENDA.has(sufixo)) return entrada ? "devolucao_venda" : "devolucao_compra";
  if (SERVICO_TRANSPORTE.has(sufixo)) return entrada ? "frete_compra" : "outro";
  if (REMESSA.has(sufixo)) return "remessa";
  if (VENDA.has(sufixo)) return entrada ? "compra" : "venda";
  return "outro";
}

// src/lib/gapContratos.ts
var TOL = 1e-3;
function arred(v) {
  return Math.round(v * 100) / 100;
}
function faixaDe(razao) {
  if (razao > 1 + TOL) return "titulo_maior";
  if (razao >= 1 - TOL) return "exato";
  if (razao >= 0.94) return "desconto_leve";
  return "desconto_forte";
}
function mediana(valores) {
  if (!valores.length) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;
}
function analisarGapContratos(notas, titulos, pisoNota = 1e3) {
  const porNota = /* @__PURE__ */ new Map();
  for (const n of notas) {
    const id = String(n.idContrato);
    if (!id || id === "undefined" || id === "null") continue;
    const atual = porNota.get(id);
    porNota.set(id, {
      valor: (atual?.valor ?? 0) + n.valor,
      // A competência do contrato é a da primeira nota (a mais antiga).
      competencia: atual && atual.competencia <= n.competencia ? atual.competencia : n.competencia
    });
  }
  const porTitulo = /* @__PURE__ */ new Map();
  for (const t of titulos) {
    const id = String(t.idContrato);
    if (!id || id === "undefined" || id === "null") continue;
    porTitulo.set(id, (porTitulo.get(id) ?? 0) + t.valor);
  }
  const contratos = [];
  const distribuicao = {
    exato: 0,
    desconto_leve: 0,
    desconto_forte: 0,
    titulo_maior: 0
  };
  const porCompetencia = {};
  let totalNf = 0;
  let totalTitulo = 0;
  const razoes = [];
  for (const [id, nota] of porNota) {
    const valorTitulo = porTitulo.get(id);
    if (valorTitulo == null) continue;
    if (nota.valor < pisoNota) continue;
    const razao = valorTitulo / nota.valor;
    const gap = nota.valor - valorTitulo;
    razoes.push(razao);
    distribuicao[faixaDe(razao)]++;
    totalNf += nota.valor;
    totalTitulo += valorTitulo;
    const c = porCompetencia[nota.competencia] ??= { nf: 0, titulo: 0, gap: 0, pct: 0 };
    c.nf += nota.valor;
    c.titulo += valorTitulo;
    c.gap += gap;
    contratos.push({
      idContrato: id,
      competencia: nota.competencia,
      valorNf: arred(nota.valor),
      valorTitulo: arred(valorTitulo),
      razao: Math.round(razao * 1e4) / 1e4,
      gap: arred(gap)
    });
  }
  for (const c of Object.values(porCompetencia)) {
    c.nf = arred(c.nf);
    c.titulo = arred(c.titulo);
    c.gap = arred(c.gap);
    c.pct = c.nf > 0 ? Math.round(c.gap / c.nf * 1e3) / 10 : 0;
  }
  contratos.sort((a, b) => b.gap - a.gap);
  return {
    contratos,
    distribuicao,
    totalNf: arred(totalNf),
    totalTitulo: arred(totalTitulo),
    gapTotal: arred(totalNf - totalTitulo),
    gapPct: totalNf > 0 ? Math.round((totalNf - totalTitulo) / totalNf * 1e3) / 10 : 0,
    razaoMediana: Math.round(mediana(razoes) * 1e4) / 1e4,
    gapPorCompetencia: porCompetencia
  };
}

// src/lib/enoki.ts
function numeroEnoki(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let t = String(v ?? "").replace(/\s/g, "");
  if (t.includes(",") && !t.includes(".")) t = t.replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

// src/lib/enokiDre.ts
var KG_POR_SACA = 60;
var RAIZES_CNPJ_GRUPO = ["30798330", "22271113", "47591700"];
var PRODUTOS_GRAO = [
  // Tolerantes a typos de cadastro: "GRAOS"/"GRÃOS"/"GÃOS" e acentuação livre.
  { re: /\bSOJA\b/, grao: "soja" },
  { re: /\bMILHO\b/, grao: "milho" },
  { re: /\bSORGO\b/, grao: "sorgo" },
  { re: /\bCAFE\b/, grao: "cafe" }
];
var FAIXA_PRECO_SACA = {
  soja: [60, 400],
  milho: [25, 200],
  sorgo: [20, 200],
  cafe: [400, 4e3]
};
function precoPorSacaSe(unidade, valorUnitario) {
  if (unidade === "kg") return valorUnitario * KG_POR_SACA;
  if (unidade === "tonelada") return valorUnitario / 1e3 * KG_POR_SACA;
  return valorUnitario;
}
function inferirUnidade(grao, valorUnitario) {
  const vu = numeroEnoki(valorUnitario);
  const [min, max] = FAIXA_PRECO_SACA[grao];
  if (vu > 0) {
    for (const u of ["kg", "saca", "tonelada"]) {
      const preco = precoPorSacaSe(u, vu);
      if (preco >= min && preco <= max) return u;
    }
  }
  return grao === "cafe" ? "saca" : "kg";
}
var CONTA_RECEITA_GRAO = {
  soja: "3.1.01",
  milho: "3.1.02",
  sorgo: "3.1.03",
  cafe: "3.1.05"
};
var SEM_DETALHE_PRODUTO = "__SEM_DETALHE__";
var CONTA_SEM_DETALHE = "3.1.15";
var CONTA_SEM_DETALHE_COMPRA = "4.1.18";
var CONTA_AQUISICAO_GRAO = {
  soja: "4.1.01",
  milho: "4.1.02",
  sorgo: "4.1.03",
  cafe: "4.1.05"
};
function graoDeProduto(produto) {
  const s = normalizarRotulo(produto);
  for (const p of PRODUTOS_GRAO) if (p.re.test(s)) return p.grao;
  return null;
}
function unidadeDeProduto(produto, valorUnitario) {
  const grao = graoDeProduto(produto);
  if (!grao) return "unidade";
  return inferirUnidade(grao, valorUnitario);
}
function sacasDeItem(produto, quantidade, valorUnitario) {
  const q = numeroEnoki(quantidade);
  if (!Number.isFinite(q) || q <= 0) return 0;
  const unidade = unidadeDeProduto(produto, valorUnitario);
  if (unidade === "kg") return q / KG_POR_SACA;
  if (unidade === "tonelada") return q * 1e3 / KG_POR_SACA;
  if (unidade === "saca") return q;
  return 0;
}
function ehAjusteFiscal(produto) {
  const s = normalizarRotulo(produto);
  return /CREDITO ICMS|COMPLEMENTO DE (VALOR|ICMS)|TRANSFERENCIA/.test(s);
}
function digitosDoc(doc) {
  return String(doc ?? "").replace(/\D/g, "");
}
function raizCnpj(doc) {
  const d = digitosDoc(doc);
  return d.length === 14 ? d.slice(0, 8) : "";
}
function ehIntragrupo(cpfCnpj, raizes) {
  const raiz = raizCnpj(cpfCnpj);
  return !!raiz && raizes.includes(raiz);
}
function soData(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}
function dataValida(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}
function novoAcumulador() {
  return {
    lancamentos: [],
    notasContrato: [],
    titulosContrato: [],
    sacas: {},
    descartes: /* @__PURE__ */ new Map(),
    residuos: /* @__PURE__ */ new Map()
  };
}
function descartar(acc, motivo, valor) {
  const atual = acc.descartes.get(motivo) ?? { quantidade: 0, valor: 0 };
  atual.quantidade += 1;
  atual.valor += Math.abs(valor);
  acc.descartes.set(motivo, atual);
}
function registrarResiduo(acc, chave, centroCusto, fluxo, valor, historico) {
  const cc = normalizarRotulo(centroCusto) || SEM_CENTRO_CUSTO;
  const id = `${chave}|${fluxo}`;
  const atual = acc.residuos.get(id) ?? { chave, centroCusto: cc, fluxo, quantidade: 0, valor: 0, amostras: [] };
  atual.quantidade += 1;
  atual.valor += Math.abs(valor);
  if (historico && atual.amostras.length < 5 && !atual.amostras.includes(historico)) {
    atual.amostras.push(historico);
  }
  acc.residuos.set(id, atual);
}
function chaveResiduo(parceiro, descricao) {
  return normalizarRotulo(parceiro) || normalizarRotulo(descricao).slice(0, 60) || SEM_CENTRO_CUSTO;
}
function somarSacas(acc, competencia, grao, sacas) {
  if (!sacas) return;
  const mes = acc.sacas[competencia] ??= {};
  mes[grao] = (mes[grao] ?? 0) + sacas;
}
function naturezaDaNf(nf) {
  const finalidade = normalizarRotulo(nf?.finalidade);
  if (finalidade === "AJUSTE") return "outro";
  const entrada = nf?.entrada === true || normalizarRotulo(nf?.tipoOperacao) === "ENTRADA" || cfopDeEntrada(nf?.cfop);
  return naturezaDeCfop(nf?.cfop, entrada);
}
function ehVenda(nf) {
  return naturezaDaNf(nf) === "venda";
}
function ehCancelada(nf) {
  return normalizarRotulo(nf?.status) === "CANCELADA";
}
function ehAutorizada(nf) {
  if (normalizarRotulo(nf?.status) !== "FINALIZADA") return false;
  const sefaz = normalizarRotulo(nf?.statusNfe);
  return sefaz !== "INUTIL" && sefaz !== "CANCELADA";
}
function processarNfs(nfs, raizes, acc) {
  for (const nf of nfs ?? []) {
    const valorNf = numeroEnoki(nf?.valorTotalNf);
    if (ehCancelada(nf)) {
      descartar(acc, "nf_cancelada", valorNf);
      continue;
    }
    const natureza = naturezaDaNf(nf);
    if (natureza === "venda" && !ehAutorizada(nf)) {
      descartar(acc, "nf_nao_autorizada", valorNf);
      continue;
    }
    if (natureza === "remessa" || natureza === "transferencia" || natureza === "outro") {
      descartar(
        acc,
        natureza === "remessa" ? "nf_remessa" : natureza === "transferencia" ? "nf_transferencia" : "nf_outra_operacao",
        valorNf
      );
      continue;
    }
    const contraparteDoc = natureza === "compra" || natureza === "frete_compra" ? nf?.emitenteCpfCnpj : nf?.destinatarioCpfCnpj;
    if (ehIntragrupo(contraparteDoc, raizes)) {
      descartar(acc, "nf_intragrupo", valorNf);
      continue;
    }
    const data = soData(nf?.dataEmissao);
    if (!dataValida(data)) {
      descartar(acc, "data_invalida", valorNf);
      continue;
    }
    const competencia = data.slice(0, 7);
    const destinatario = String(
      (natureza === "compra" || natureza === "frete_compra" ? nf?.emitenteNome : nf?.destinatarioNome) ?? ""
    ).trim();
    const numero = nf?.numeroNf ?? nf?.idNf ?? "";
    const itens = (nf?.itens ?? []).length ? nf.itens : Math.abs(numeroEnoki(nf?.valorTotalNf)) >= 5e-3 ? [{ idItem: "total", produto: SEM_DETALHE_PRODUTO, valorTotal: nf?.valorTotalNf }] : [];
    for (const [i, item] of itens.entries()) {
      const produto = String(item?.produto ?? "").trim();
      const valor = numeroEnoki(item?.valorTotal);
      if (ehAjusteFiscal(produto)) {
        descartar(acc, "nf_ajuste_fiscal", valor);
        continue;
      }
      if (Math.abs(valor) < 5e-3) {
        descartar(acc, "valor_zero", 0);
        continue;
      }
      const grao = graoDeProduto(produto);
      const conta = natureza === "frete_compra" ? "4.1.10" : produto === SEM_DETALHE_PRODUTO ? natureza === "compra" ? CONTA_SEM_DETALHE_COMPRA : natureza === "devolucao_venda" ? "3.2.06" : natureza === "devolucao_compra" ? CONTA_SEM_DETALHE_COMPRA : CONTA_SEM_DETALHE : natureza === "compra" ? grao ? CONTA_AQUISICAO_GRAO[grao] : "4.1.10" : natureza === "devolucao_venda" ? "3.2.06" : natureza === "devolucao_compra" ? grao ? CONTA_AQUISICAO_GRAO[grao] : "4.1.10" : grao ? CONTA_RECEITA_GRAO[grao] : "3.4.02";
      const sinal = natureza === "devolucao_compra" ? -1 : 1;
      const rotulo = natureza === "venda" ? `NF ${numero}` : natureza === "compra" ? `NF entrada ${numero}` : natureza === "frete_compra" ? `CT-e ${numero}` : `NF ${numero} \xB7 devolu\xE7\xE3o`;
      const historico = [rotulo, produto, destinatario].filter(Boolean).join(" \xB7 ").slice(0, 160);
      acc.lancamentos.push({
        id: `enoki-nf-${nf?.idNf ?? numero}-${item?.idItem ?? i}`,
        data,
        contaSafragold: conta,
        historico,
        valor: sinal * valor,
        centroCusto: grao ? `${natureza === "compra" ? "COMPRA" : "RECEITA"} ${grao.toUpperCase()}` : void 0,
        origem: "enoki"
      });
      if (natureza === "venda") {
        const idContrato = (nf?.contratosVinculados ?? [])[0]?.idContrato;
        if (idContrato != null) {
          acc.notasContrato.push({ idContrato, competencia, valor, grao });
        }
      }
      if (grao && natureza !== "devolucao_compra" && natureza !== "compra" && natureza !== "frete_compra") {
        const sacas = sacasDeItem(produto, item?.quantidade, item?.valorUnitario);
        somarSacas(acc, competencia, grao, natureza === "devolucao_venda" ? -sacas : sacas);
      }
    }
  }
}
function processarTitulos(titulos, fluxo, acc, regras) {
  for (const [i, t] of (titulos ?? []).entries()) {
    const valorBruto = numeroEnoki(t?.valor);
    const data = soData(t?.dataLancamento) || soData(t?.dataVencimento);
    if (!dataValida(data)) {
      descartar(acc, "data_invalida", valorBruto);
      continue;
    }
    const valor = Math.abs(valorBruto);
    if (valor < 5e-3) {
      descartar(acc, "valor_zero", 0);
      continue;
    }
    const centroCusto = String(t?.centroCusto ?? "").trim();
    const parceiro = String(t?.parceiroNome ?? "").trim();
    const descricao = String(t?.descricao ?? "").trim();
    const historico = [parceiro, descricao].filter(Boolean).join(" \xB7 ").slice(0, 160);
    if (fluxo === "entrada" && t?.idContrato != null && /RECEITA/.test(normalizarRotulo(centroCusto))) {
      acc.titulosContrato.push({
        idContrato: t.idContrato,
        competencia: data.slice(0, 7),
        valor
      });
    }
    if (/TRANSFERENCIA ENTRE CONTAS/.test(normalizarRotulo(descricao))) {
      descartar(acc, "transferencia_entre_contas", valor);
      continue;
    }
    const destino = destinoDeCentroCusto(centroCusto, fluxo);
    let conta;
    let sinal = 1;
    if (destino) {
      if (destino.ignorar) {
        descartar(acc, destino.motivo ?? "patrimonial_ou_intragrupo", valor);
        continue;
      }
      conta = destino.conta;
      sinal = destino.sinal;
    } else {
      const chave = chaveResiduo(parceiro, descricao);
      const aprendida = regras[chave];
      if (!aprendida) {
        registrarResiduo(acc, chave, centroCusto, fluxo, valor, historico || centroCusto);
        continue;
      }
      conta = aprendida;
    }
    acc.lancamentos.push({
      id: `enoki-${fluxo === "entrada" ? "r" : "p"}-${t?.idItemLancamento ?? t?.idLancamento ?? i}`,
      data,
      contaSafragold: conta,
      historico,
      valor: sinal * valor,
      centroCusto: centroCusto || void 0,
      origem: "enoki"
    });
  }
}
function normalizarEnokiDre(entrada, config = {}) {
  const raizes = config.raizesGrupo ?? RAIZES_CNPJ_GRUPO;
  const acc = novoAcumulador();
  const regras = config.regras ?? {};
  processarNfs(entrada.nfs ?? [], raizes, acc);
  processarTitulos(entrada.pagar ?? [], "saida", acc, regras);
  processarTitulos(entrada.receber ?? [], "entrada", acc, regras);
  const vistos = /* @__PURE__ */ new Set();
  const lancamentos = acc.lancamentos.filter((l) => {
    if (vistos.has(l.id)) return false;
    vistos.add(l.id);
    return true;
  });
  const sacas = {};
  for (const [competencia, porGrao] of Object.entries(acc.sacas)) {
    const mes = {};
    for (const g of GRAOS) {
      const v = porGrao[g];
      if (v) mes[g] = Math.round(v * 100) / 100;
    }
    if (Object.keys(mes).length) sacas[competencia] = mes;
  }
  const descartes = [...acc.descartes.entries()].map(([motivo, v]) => ({ motivo, quantidade: v.quantidade, valor: Math.round(v.valor * 100) / 100 })).sort((a, b) => b.valor - a.valor);
  const residuos = [...acc.residuos.values()].map((r) => ({ ...r, valor: Math.round(r.valor * 100) / 100 })).sort((a, b) => b.valor - a.valor);
  return {
    lancamentos,
    sacas,
    descartes,
    residuos,
    gapContratos: analisarGapContratos(acc.notasContrato, acc.titulosContrato)
  };
}
function competenciasDeLancamentos(lancamentos) {
  return [...new Set(lancamentos.map((l) => l.data.slice(0, 7)))].sort();
}
export {
  CONTA_AQUISICAO_GRAO,
  CONTA_RECEITA_GRAO,
  CONTA_SEM_DETALHE,
  CONTA_SEM_DETALHE_COMPRA,
  KG_POR_SACA,
  RAIZES_CNPJ_GRUPO,
  SEM_DETALHE_PRODUTO,
  chaveResiduo,
  competenciasDeLancamentos,
  digitosDoc,
  ehAutorizada,
  ehCancelada,
  ehIntragrupo,
  ehVenda,
  graoDeProduto,
  inferirUnidade,
  naturezaDaNf,
  normalizarEnokiDre,
  raizCnpj,
  sacasDeItem,
  unidadeDeProduto
};
