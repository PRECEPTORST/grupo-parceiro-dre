// Ingestão do que o ROBÔ (robot/scrape-dre.mjs) lê do ERP de produção.
//
// POR QUE ESTA ROTA EXISTE
// ------------------------
// O scraper roda fora da Vercel (precisa de Playwright e de uma sessão no ERP).
// Ele produz exatamente o mesmo formato que a API Safra devolvia — `{nfs, pagar,
// receber}` — e entrega aqui. A partir deste ponto o caminho é o mesmo de antes:
// o front normaliza com `src/lib/enokiDre.ts` e o DRE se monta sozinho.
//
// SEGURANÇA: fail-CLOSED
// ----------------------
// Sem `INGEST_KEY` configurada a rota RECUSA. O inverso — "sem chave, libera" —
// é o erro clássico que deixa uma rota de escrita aberta na internet.
//
// IDEMPOTÊNCIA
// ------------
// O robô roda em janelas que se sobrepõem de propósito (é a defesa contra a
// paginação travar). Reingerir a mesma janela não pode duplicar nada: os
// registros de uma janela SUBSTITUEM os daquela janela, e o que está fora dela
// é preservado — a mesma regra do sync incremental da API.
import { lerDocMaisRecente, gravarDoc } from '../lib/blobdoc.js'

export const config = { maxDuration: 60 }

/** Documento onde o material CRU do robô fica, por janela. */
const PREFIXO = 'enoki-scrape'

interface Janela {
  de: string
  ate: string
  geradoEm: string
  empresa?: string
  parcial?: boolean
  nfs: unknown[]
  pagar: unknown[]
  receber: unknown[]
  diagnostico?: unknown
}

function autorizado(req: any): boolean {
  const esperada = process.env.INGEST_KEY
  if (!esperada) return false // fail-closed: sem chave, ninguém entra
  return String(req.headers?.['x-ingest-key'] ?? '') === esperada
}

function corpoValido(b: any): b is Janela {
  return (
    !!b &&
    typeof b.de === 'string' &&
    typeof b.ate === 'string' &&
    Array.isArray(b.nfs) &&
    Array.isArray(b.pagar) &&
    Array.isArray(b.receber)
  )
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Use POST.' })
  }
  if (!autorizado(req)) {
    return res.status(401).json({ erro: 'Não autorizado.' })
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return res.status(500).json({ erro: 'Armazenamento não configurado.' })
  }

  const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
  if (!corpoValido(corpo)) {
    return res.status(400).json({ erro: 'Envie { de, ate, nfs, pagar, receber }.' })
  }

  const doc = (await lerDocMaisRecente(PREFIXO, token)) ?? { janelas: [] }
  const janelas: Janela[] = Array.isArray(doc.janelas) ? doc.janelas : []

  // A janela recebida manda no próprio período: substitui a anterior de mesmo
  // intervalo em vez de somar. Sobreposição vira atualização, não duplicata.
  const semEsta = janelas.filter((j) => !(j.de === corpo.de && j.ate === corpo.ate))
  const atualizado = {
    atualizadoEm: new Date().toISOString(),
    janelas: [...semEsta, corpo].sort((a, b) => a.de.localeCompare(b.de)),
  }

  await gravarDoc(PREFIXO, atualizado, token)

  const totais = atualizado.janelas.reduce(
    (s, j) => ({
      nfs: s.nfs + j.nfs.length,
      pagar: s.pagar + j.pagar.length,
      receber: s.receber + j.receber.length,
    }),
    { nfs: 0, pagar: 0, receber: 0 },
  )

  res.status(200).json({
    ok: true,
    janela: { de: corpo.de, ate: corpo.ate },
    substituiu: janelas.length - semEsta.length > 0,
    janelasGuardadas: atualizado.janelas.length,
    totais,
  })
}
