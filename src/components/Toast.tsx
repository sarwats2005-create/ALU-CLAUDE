'use client';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/client/app-context';

type Toast = { id: number; tone: 'success' | 'error'; text: string };
type Ctx = { success: (text: string) => void; error: (text: string) => void };

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: Toast['tone'], text: string) => {
      if (!text) return;
      const id = ++seq.current;
      setToasts((l) => [...l.slice(-3), { id, tone, text }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );
  const value = useRef<Ctx>({ success: (x) => push('success', x), error: (x) => push('error', x) });
  value.current.success = (x) => push('success', x);
  value.current.error = (x) => push('error', x);

  return (
    <ToastCtx.Provider value={value.current}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((x) => (
          <div
            key={x.id}
            className={cx(
              'anim-sheet pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card border bg-surface px-4 py-3 text-body shadow-pop',
              x.tone === 'success' ? 'border-success/30' : 'border-danger/30',
            )}
          >
            {x.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />}
            <p className="bidi min-w-0 flex-1 font-medium text-ink">{x.text}</p>
            <button type="button" onClick={() => dismiss(x.id)} className="-me-1 rounded p-0.5 text-muted hover:text-ink" aria-label={t('common.close')}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): Ctx {
  const c = useContext(ToastCtx);
  if (!c) throw new Error('useToast outside ToastProvider');
  return c;
}
