// Persistência da FATIA ENOKI do estado, separada do `api/estado.ts`.
//
// POR QUE SEPARADO
// ----------------
// A carga da Enoki são ~11,7 mil lançamentos = 2,4 MB de JSON (jan–jul/2026), e
// cresce ~340 KB por mês. Deixá-la dentro do documento principal criava dois
// problemas:
//   1. O estado é regravado a cada alteração (debounce de 700ms). Editar um
//      valor no orçamento reenviava 2,4 MB — lento e caro à toa.
//   2. O limite de corpo de requisição da Vercel é 4,5 MB. A projeção do ano
//      fechado era 4,05 MB, e somado ao resto do estado estourava por volta de
//      novembro/2026.
// Separando: o documento principal fica pequeno e rápido, e este aqui só é
// gravado quando há sincronização de verdade.
//
//   GET  /api/estado-enoki           -> { enoki: FatiaEnoki | null }
//   PUT  /api/estado-enoki { enoki } -> { ok: true }   (só quem pode gravar)
import { authConfigurada, usuarioAtual, parseBody } from '../lib/auth.js'
import { lerDocMaisRecente, gravarDoc } from '../lib/blobdoc.js'

const PREFIXO = 'estado-enoki'

/** Papéis que não gravam nada (espelha `ehSomenteLeitura` do front). */
function somenteLeitura(papel: string | undefined): boolean {
  return papel === 'consulta' || papel === 'orcamento'
}

function fatiaValida(f: any): boolean {
  return !!f && typeof f === 'object' && Array.isArray(f.lancamentosEnoki)
}

export default async function handler(req: any, res: any) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token || !authConfigurada()) {
    res.status(500).json({ erro: 'Armazenamento/autenticação na nuvem não configurados.' })
    return
  }

  const atual = await usuarioAtual(req)
  if (!atual) {
    res.status(401).json({ erro: 'Não autenticado.' })
    return
  }

  if (req.method === 'GET') {
    const enoki = await lerDocMaisRecente(PREFIXO, token)
    res.status(200).json({ enoki: enoki ?? null })
    return
  }

  if (req.method !== 'PUT') {
    res.status(405).json({ erro: 'Método não suportado.' })
    return
  }

  // Só quem sincroniza grava: a fatia é derivada da API, não editável à mão.
  if (somenteLeitura(atual.papel)) {
    res.status(403).json({ erro: 'Somente leitura.' })
    return
  }

  const { enoki } = parseBody(req) as { enoki?: unknown }
  if (!fatiaValida(enoki)) {
    res.status(400).json({ erro: 'Envie { enoki: { lancamentosEnoki: [...] } }.' })
    return
  }

  await gravarDoc(PREFIXO, enoki, token)
  res.status(200).json({ ok: true })
}
