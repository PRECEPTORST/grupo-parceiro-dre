import { useEffect, useState, type ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-cyan/25 bg-white/[0.03] p-5 shadow-[0_0_24px_rgba(53,214,232,0.06)] ${className}`}
    >
      {children}
    </div>
  )
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan">
      {children}
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slateblue">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-cyan/20 bg-navy-2 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan/60'

/** Input numérico controlado (em reais). Vazio → 0, ou null quando permitido. */
export function NumInput({
  value,
  onChange,
  allowNull = false,
  step,
  min,
  disabled = false,
}: {
  value: number | null
  onChange: (v: number | null) => void
  allowNull?: boolean
  step?: number
  min?: number
  disabled?: boolean
}) {
  const [texto, setTexto] = useState(value == null ? '' : String(value))

  useEffect(() => {
    setTexto((atual) => {
      const atualNum = atual === '' ? null : Number(atual)
      if (atualNum === value || (Number.isNaN(atualNum) && value == null)) return atual
      return value == null ? '' : String(value)
    })
  }, [value])

  return (
    <input
      type="number"
      className={`${inputClass} disabled:opacity-60`}
      value={texto}
      step={step}
      min={min}
      disabled={disabled}
      onChange={(e) => {
        const t = e.target.value
        setTexto(t)
        if (t === '') {
          onChange(allowNull ? null : 0)
        } else {
          const n = Number(t)
          if (!Number.isNaN(n)) onChange(n)
        }
      }}
    />
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="text"
      className={inputClass}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-navy-2 text-white">
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Botao({
  children,
  onClick,
  variante = 'primario',
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  variante?: 'primario' | 'fantasma' | 'perigo'
  disabled?: boolean
}) {
  const base = 'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50'
  const estilos = {
    primario: 'bg-cyan text-navy hover:brightness-110',
    fantasma: 'border border-cyan/30 text-cyan hover:bg-cyan/10',
    perigo: 'border border-danger/40 text-danger hover:bg-danger/10',
  }
  return (
    <button className={`${base} ${estilos[variante]}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
