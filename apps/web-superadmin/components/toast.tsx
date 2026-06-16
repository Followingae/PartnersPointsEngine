'use client';

import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastCtx = createContext<{ push: (tone: ToastTone, message: string) => void } | null>(null);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = ++seq;
      setToasts((t) => [...t, { id, tone, message }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove],
  );

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-[360px] max-w-[calc(100vw-3rem)] flex-col gap-2.5">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

const TONES: Record<ToastTone, { icon: ReactNode; edge: string }> = {
  success: { icon: <CheckCircle2 size={18} className="text-[#1f7a3d]" />, edge: '#5fd08a' },
  error: { icon: <XCircle size={18} className="text-destructive" />, edge: '#e0567a' },
  info: { icon: <Info size={18} className="text-[#0f6b66]" />, edge: '#3bb0a8' },
};

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const t = TONES[toast.tone];
  return (
    <div
      className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-l-4 border-border bg-card px-4 py-3 shadow-hero transition"
      style={{ borderLeftColor: t.edge }}
    >
      <span className="mt-0.5">{t.icon}</span>
      <p className="flex-1 text-sm font-medium leading-snug text-foreground">{toast.message}</p>
      <button onClick={onClose} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.push;
}
