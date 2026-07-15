import { useEffect, useState, type ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(35,40,31,0.04),0_8px_24px_-12px_rgba(35,40,31,0.12)] ${className}`}
    >
      {children}
    </div>
  )
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <div className="font-head text-[12px] font-semibold uppercase tracking-[0.22em] text-green">
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
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-green focus:ring-2 focus:ring-green/20'

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
      className={`${inputClass} text-right tabular-nums disabled:cursor-not-allowed disabled:bg-cream disabled:text-muted`}
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
        <option key={o.value} value={o.value}>
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
  const base =
    'rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100'
  const estilos = {
    primario:
      'bg-green text-white shadow-sm hover:bg-green-deep hover:shadow-md hover:-translate-y-px',
    fantasma: 'border border-green/40 text-green hover:bg-green/10',
    perigo: 'border border-danger/40 text-danger hover:bg-danger/10',
  }
  return (
    <button className={`${base} ${estilos[variante]}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
