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
  RegraImposto,
  Grao,
} from '../lib/tipos'
import { useAuth } from './AuthContext'
import { ehSomenteLeitura, podeAdministrar } from '../lib/permissoes'

export type StatusSync = 'carregando' | 'sincronizado' | 'salvando' | 'erro' | 'offline'

interface DreContextValue {
  estado: EstadoDre
  /** Salva/atualiza classificações de contas (merge por contaSafragold). */
  salvarClassificacoes: (novas: Classificacao[]) => void
  /** Cria ou substitui o orçamento de uma competência. */
  salvarOrcamento: (orcamento: Orcamento) => void
  /** Atualiza as premissas da projeção de caixa. */
  salvarPremissasCaixa: (premissas: PremissasCaixa) => void
  /** Atualiza a configuração da confiabilidade (piso + ignorados). */
  salvarConfigConfiabilidade: (config: ConfigConfiabilidade) => void
  /** Salva as sacas vendidas de cada grão numa competência. */
  salvarSacas: (competencia: string, sacas: Partial<Record<Grao, number>>) => void
  /** Salva as sacas de VÁRIAS competências de uma vez (merge por competência). */
  salvarSacasLote: (sacas: Record<string, Partial<Record<Grao, number>>>) => void
  /** Atualiza as regras de tributos automáticos do orçamento. */
  salvarImpostos: (regras: RegraImposto[]) => void
  /** Define se a margem de contribuição inclui as despesas comerciais (além do CPV). */
  salvarMcIncluirComerciais: (incluir: boolean) => void
  /**
   * Importa uma DRE gerencial já parseada: SUBSTITUI todos os lançamentos, MESCLA
   * as classificações (memoriza) e grava o resultado declarado por competência.
   */
  importarDreGerencial: (dados: {
    lancamentos: LancamentoCanonico[]
    classificacoes: Classificacao[]
    resultadoDeclarado: Record<string, number>
  }) => void
  /** Puxa os lançamentos do Safragold e mescla no estado (merge por id). */
  sincronizarSafragold: () => Promise<{ importados: number; simulado: boolean }>
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

  // Sincronização com o Safragold — compartilhada pelo botão manual (Lançamentos)
  // e pela sincronização automática abaixo. Faz merge por id no estado.
  const sincronizarSafragold = useCallback(async () => {
    const resp = await fetch('/api/safragold-sync', { headers: { accept: 'application/json' } })
    const d = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error(d?.erro || `Erro ${resp.status}`)
    const novos = (d.lancamentos ?? []) as LancamentoCanonico[]
    setEstado((s) => {
      const porId = new Map(s.lancamentos.map((l) => [l.id, l]))
      for (const n of novos) porId.set(n.id, n)
      return { ...s, lancamentos: [...porId.values()] }
    })
    return { importados: novos.length, simulado: !!d.simulado }
  }, [])

  // Sincroniza o Safragold AUTOMATICAMENTE uma vez por sessão, assim que a nuvem
  // termina de hidratar, para quem pode gravar (o merge dispara o save na nuvem).
  // Silencioso: o botão manual em Lançamentos segue disponível p/ retry/feedback.
  const autoSincronizado = useRef(false)
  useEffect(() => {
    if (autoSincronizado.current) return
    if (statusSync !== 'sincronizado') return
    if (!podeAdministrar(usuario?.papel)) return
    autoSincronizado.current = true
    void sincronizarSafragold().catch(() => {})
  }, [statusSync, usuario?.papel, sincronizarSafragold])

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

    const salvarSacas = (competencia: string, sacas: Partial<Record<Grao, number>>) =>
      setEstado((s) => ({ ...s, sacas: { ...s.sacas, [competencia]: sacas } }))

    const salvarSacasLote = (sacas: Record<string, Partial<Record<Grao, number>>>) =>
      setEstado((s) => ({ ...s, sacas: { ...s.sacas, ...sacas } }))

    const salvarImpostos = (regras: RegraImposto[]) =>
      setEstado((s) => ({ ...s, impostos: regras }))

    const salvarMcIncluirComerciais = (incluir: boolean) =>
      setEstado((s) => ({ ...s, mcIncluirComerciais: incluir }))

    const importarDreGerencial: DreContextValue['importarDreGerencial'] = (dados) =>
      setEstado((s) => {
        // Classificações: mescla por contaSafragold (memoriza; a importada vence).
        const porConta = new Map(s.classificacoes.map((c) => [c.contaSafragold, c]))
        for (const c of dados.classificacoes) porConta.set(c.contaSafragold, c)
        return {
          ...s,
          lancamentos: dados.lancamentos, // substitui tudo
          classificacoes: [...porConta.values()],
          resultadoDeclarado: dados.resultadoDeclarado,
        }
      })

    return {
      estado,
      salvarClassificacoes,
      salvarOrcamento,
      salvarPremissasCaixa,
      salvarConfigConfiabilidade,
      salvarSacas,
      salvarSacasLote,
      salvarImpostos,
      salvarMcIncluirComerciais,
      importarDreGerencial,
      sincronizarSafragold,
      statusSync,
      erroSync,
      ressincronizar,
    }
  }, [estado, statusSync, erroSync, ressincronizar, sincronizarSafragold])

  return <DreContext.Provider value={value}>{children}</DreContext.Provider>
}

export function useDre(): DreContextValue {
  const ctx = useContext(DreContext)
  if (!ctx) throw new Error('useDre precisa estar dentro de <DreProvider>')
  return ctx
}
