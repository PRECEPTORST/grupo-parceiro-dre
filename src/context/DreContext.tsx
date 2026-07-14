import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { carregarEstado, salvarEstado, type EstadoDre } from '../lib/storage'
import { carregarNuvem, salvarNuvem } from '../lib/nuvem'
import type { Classificacao, LancamentoCanonico, Orcamento } from '../lib/tipos'

export type StatusSync = 'carregando' | 'sincronizado' | 'salvando' | 'erro' | 'offline'

interface DreContextValue {
  estado: EstadoDre
  /** Substitui os lançamentos (ex.: após sincronizar o Safragold). Faz merge por id. */
  mesclarLancamentos: (novos: LancamentoCanonico[]) => void
  /** Salva/atualiza classificações de contas (merge por contaSafragold). */
  salvarClassificacoes: (novas: Classificacao[]) => void
  /** Cria ou substitui o orçamento de uma competência. */
  salvarOrcamento: (orcamento: Orcamento) => void
  statusSync: StatusSync
  erroSync: string | null
  ressincronizar: () => void
}

const DreContext = createContext<DreContextValue | null>(null)

export function DreProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoDre>(() => carregarEstado())
  const [statusSync, setStatusSync] = useState<StatusSync>('carregando')
  const [erroSync, setErroSync] = useState<string | null>(null)

  const hidratado = useRef(false)
  const estadoRef = useRef(estado)
  useEffect(() => {
    estadoRef.current = estado
  })

  const ressincronizar = useCallback(async () => {
    setStatusSync('carregando')
    setErroSync(null)
    try {
      const nuvem = await carregarNuvem()
      if (nuvem) {
        setEstado(nuvem)
        salvarEstado(nuvem)
      } else {
        await salvarNuvem(estadoRef.current)
      }
      setStatusSync('sincronizado')
    } catch (e) {
      setStatusSync('offline')
      setErroSync(e instanceof Error ? e.message : String(e))
    } finally {
      hidratado.current = true
    }
  }, [])

  useEffect(() => {
    ressincronizar()
  }, [ressincronizar])

  useEffect(() => {
    salvarEstado(estado)
    if (!hidratado.current) return
    setStatusSync((s) => (s === 'offline' ? s : 'salvando'))
    const timer = setTimeout(async () => {
      try {
        await salvarNuvem(estado)
        setStatusSync('sincronizado')
        setErroSync(null)
      } catch (e) {
        setStatusSync('erro')
        setErroSync(e instanceof Error ? e.message : String(e))
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [estado])

  const value = useMemo<DreContextValue>(() => {
    const mesclarLancamentos = (novos: LancamentoCanonico[]) =>
      setEstado((s) => {
        const porId = new Map(s.lancamentos.map((l) => [l.id, l]))
        for (const n of novos) porId.set(n.id, n)
        return { ...s, lancamentos: [...porId.values()] }
      })

    const salvarClassificacoes = (novas: Classificacao[]) =>
      setEstado((s) => {
        const porConta = new Map(s.classificacoes.map((c) => [c.contaSafragold, c]))
        for (const n of novas) porConta.set(n.contaSafragold, n)
        return { ...s, classificacoes: [...porConta.values()] }
      })

    const salvarOrcamento = (orcamento: Orcamento) =>
      setEstado((s) => ({
        ...s,
        orcamentos: [
          ...s.orcamentos.filter((o) => o.competencia !== orcamento.competencia),
          orcamento,
        ],
      }))

    return {
      estado,
      mesclarLancamentos,
      salvarClassificacoes,
      salvarOrcamento,
      statusSync,
      erroSync,
      ressincronizar,
    }
  }, [estado, statusSync, erroSync, ressincronizar])

  return <DreContext.Provider value={value}>{children}</DreContext.Provider>
}

export function useDre(): DreContextValue {
  const ctx = useContext(DreContext)
  if (!ctx) throw new Error('useDre precisa estar dentro de <DreProvider>')
  return ctx
}
