// Função serverless (Vercel): persiste o EstadoDre (lançamentos + classificações
// + orçamentos) num Vercel Blob PRIVADO, acessível de qualquer dispositivo.
//   GET  /api/estado          -> { estado: EstadoDre | null }   (qualquer papel)
//   PUT  /api/estado {estado} -> { ok: true }                   (exige login)
import { authConfigurada, usuarioAtual } from '../lib/auth.js'
import { lerDocMaisRecente, gravarDoc } from '../lib/blobdoc.js'

const PREFIXO = 'estado'

function estadoValido(estado: any): boolean {
  return (
    !!estado &&
    typeof estado === 'object' &&
    Array.isArray(estado.lancamentos) &&
    Array.isArray(estado.classificacoes) &&
    Array.isArray(estado.orcamentos)
  )
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

  try {
    if (req.method === 'GET') {
      const estado = await lerDocMaisRecente(PREFIXO, token)
      res.status(200).json({ estado })
      return
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
      const estado = corpo?.estado
      if (!estadoValido(estado)) {
        res
          .status(400)
          .json({ erro: 'Corpo inválido: envie { estado: { lancamentos, classificacoes, orcamentos } }.' })
        return
      }
      await gravarDoc(PREFIXO, estado, token)
      res.status(200).json({ ok: true })
      return
    }

    res.status(405).json({ erro: 'Use GET ou PUT.' })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha no armazenamento em nuvem: ${e?.message ?? String(e)}` })
  }
}
