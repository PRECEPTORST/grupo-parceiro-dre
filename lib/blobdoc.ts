// Documento JSON versionado sobre o Vercel Blob, com leitura forte.
//
// O Blob força cache de CDN (~60s) na leitura por pathname fixo — reescrever o
// mesmo arquivo e reler devolve versão antiga. Para contornar: cada gravação
// cria um objeto NOVO (addRandomSuffix) sob um prefixo, e a leitura sempre pega
// o mais recente via list() (API de controle, sem CDN → consistente). Versões
// antigas são apagadas em best-effort; a correção nunca depende dessa limpeza.
import { put, get, list, del } from '@vercel/blob'

/** Lê o documento mais recente sob o prefixo (ou null se não houver). */
export async function lerDocMaisRecente(prefixo: string, token: string): Promise<any | null> {
  const { blobs } = await list({ prefix: `${prefixo}/`, token })
  if (!blobs.length) return null
  const maisRecente = blobs.reduce((a, b) =>
    +new Date(a.uploadedAt) >= +new Date(b.uploadedAt) ? a : b,
  )
  const r = await get(maisRecente.pathname, { access: 'private', token })
  if (!r || r.statusCode !== 200) return null
  const txt = await new Response(r.stream).text()
  return txt ? JSON.parse(txt) : null
}

/** Grava uma nova versão do documento e remove as anteriores (best-effort). */
export async function gravarDoc(prefixo: string, valor: unknown, token: string): Promise<void> {
  const criado = await put(`${prefixo}/v.json`, JSON.stringify(valor), {
    access: 'private',
    addRandomSuffix: true,
    contentType: 'application/json',
    token,
  })
  try {
    const { blobs } = await list({ prefix: `${prefixo}/`, token })
    const antigas = blobs.filter((b) => b.url !== criado.url).map((b) => b.url)
    if (antigas.length) await del(antigas, { token })
  } catch {
    // Limpeza é best-effort — a leitura sempre usa a mais recente por uploadedAt.
  }
}
