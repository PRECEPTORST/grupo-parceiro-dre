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
import type {
  Classificacao,
  LancamentoCanonico,
  Orcamento,
  PremissasCaixa,
  ConfigConfiabilidade,
} from '../lib/tipos'
import { useAuth } from './AuthContext'
import { ehSomenteLeitura } from '../lib/permissoes'

export type StatusSync = 'carregando' | 'sincronizado' | 'salvando' | 'erro' | 'offline'

interface DreContextValue {
  estado: EstadoDre
  /** Substitui os lançamentos (ex.: após sincronizar o Safragold). Faz merge por id. */
  mesclarLancamentos: (novos: LancamentoCanonico[]) => void
  /** Salva/atualiza classificações de contas (merge por contaSafragold). */
  salvarClassificacoes: (novas: Classificacao[]) => void
  /** Cria ou substitui o orçamento de uma competência. */
  salvarOrcamento: (orcamento: Orcamento) => void
  /** Atualiza as premissas da projeção de caixa. */
  salvarPremissasCaixa: (premissas: PremissasCaixa) => void
  /** Atualiza a configuração da confiabilidade (piso + ignorados). */
  salvarConfigConfiabilidade: (config: ConfigConfiabilidade) => void
  statusSync: StatusSync
  erroSync: string | null
  ressincronizar: () => void
}

const DreContext = createContext<DreContextValue | null>(null)

export function DreProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const soLeitura = ehSomenteLeitura(usuario?.papel)
  const [estado, setEstado] = useState<EstadoDre>(() => carregarEstado())
  const [statusSync, setStatusSync] = useState<StatusSync>('carregando')
  const [erroSync, setErroSync] = useState<string | null>(null)

  const hidratado = useRef(false)
  const estadoRef = useRef(estado)
  // Ref sempre atual do "somente leitura", para os efeitos/callbacks não
  // capturarem um papel velho se ele mudar no meio da sessão.
  const soLeituraRef = useRef(soLeitura)
  useEffect(() => {
    estadoRef.current = estado
    soLeituraRef.current = soLeitura
  })

  const ressincronizar = useCallback(async () => {
    setStatusSync('carregando')
    setErroSync(null)
    try {
      const nuvem = await carregarNuvem()
      if (nuvem) {
        setEstado(nuvem)
        salvarEstado(nuvem)
      } else if (!soLeituraRef.current) {
        // Nuvem vazia: semeia — mas só quem pode gravar.
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
    // Somente consulta: mantém só o cache local, nunca grava na nuvem.
    if (soLeituraRef.current) return
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

    const salvarPremissasCaixa = (premissas: PremissasCaixa) =>
      setEstado((s) => ({ ...s, premissasCaixa: premissas }))

    const salvarConfigConfiabilidade = (config: ConfigConfiabilidade) =>
      setEstado((s) => ({ ...s, confiabilidade: config }))

    return {
      estado,
      mesclarLancamentos,
      salvarClassificacoes,
      salvarOrcamento,
      salvarPremissasCaixa,
      salvarConfigConfiabilidade,
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
