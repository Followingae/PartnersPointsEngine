'use client';

import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  disabled?: boolean;
  loading?: boolean;
}) {
  const styles = {
    primary: 'bg-ink text-white hover:bg-ink-soft',
    ghost: 'bg-muted text-foreground hover:bg-secondary',
    outline: 'border border-input bg-white text-foreground hover:bg-muted',
    danger: 'bg-destructive text-white hover:opacity-90',
  }[variant];
  const sizing = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-2xl font-semibold transition disabled:opacity-60 ${sizing} ${styles}`}
    >
      {loading ? <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  error,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-2xl border bg-white px-4 py-2.5 text-sm outline-none transition focus:ring-4 ${
          error ? 'border-destructive focus:border-destructive focus:ring-destructive/20' : 'border-input focus:border-ink focus:ring-primary/30'
        }`}
      />
      {error ? <span className="mt-1 block text-xs font-medium text-destructive">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Textarea({ label, value, onChange, placeholder, rows = 3, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-2xl border border-input bg-white px-4 py-2.5 text-sm outline-none transition focus:border-ink focus:ring-4 focus:ring-primary/30"
      />
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Select({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-input bg-white px-4 py-2.5 text-sm outline-none transition focus:border-ink focus:ring-4 focus:ring-primary/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Modal({ open, onClose, title, subtitle, children, size = 'md' }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; size?: 'md' | 'lg' }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full ${size === 'lg' ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-hero`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl font-bold tracking-tight">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  tone = 'danger',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-hero" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-2xl ${tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-primary/15 text-ink'}`}>
            <AlertTriangle size={18} />
          </span>
          <h3 className="font-display text-lg font-bold tracking-tight">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} | Partners Points Platform`;
  }, [title]);
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {subtitle ? <p className="text-sm font-medium text-muted-foreground">{subtitle}</p> : null}
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">{title}</h1>
      </div>
      {action}
    </header>
  );
}
