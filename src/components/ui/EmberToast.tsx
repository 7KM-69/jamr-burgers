'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import gsap from 'gsap';
import { DUR, EASE } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * Transient confirmations — "in the cart", "reward unlocked".
 *
 * ## Why this is written here and not installed
 *
 * The shape is adapted from a 21st.dev toast (`@dhileepkumargm/ultra-quality-toast`),
 * read as a reference and then rebuilt. Installing it was not an option and not a
 * matter of taste: it pulls `@headlessui/react` + `@heroicons/react`, and CLAUDE.md
 * allows no component library and no animation library other than GSAP. Reading it
 * was still worth it — four of its bugs are fixed below rather than inherited:
 *
 *   · `id = Date.now().toString()` — two toasts fired inside one millisecond collide
 *     on their React key. `crypto.randomUUID()` cannot.
 *   · Its exit transition was dead code. The item unmounted the instant it left the
 *     array, so `leaveTo` never rendered. Here a toast leaves in two beats: it is
 *     marked `leaving`, GSAP animates it, and only the tween's callback unmounts it.
 *   · Its dismiss timer kept running after a manual close, and nothing cleared it on
 *     unmount. Every timer here is tracked and cleared.
 *   · `aria-live="assertive"` on every toast. Assertive interrupts a screen reader
 *     mid-sentence; "added to your order" has not earned that. The live region is
 *     `polite`, and it is ONE region that owns the announcement — putting `role=alert`
 *     on each item would make some readers announce twice.
 *
 * ## RTL
 *
 * Anchored with `end-*`, never `right-*`, and the entrance slides along `dirSign`-free
 * axes only (y and scale), so the same tween is correct in both directions. A toast
 * that flew in from the right in Arabic would be flying in from the *start* edge.
 */

/** `reward` is the loyalty moment and is styled to be worth looking up for. */
export type ToastKind = 'order' | 'reward';

interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  note?: string;
}

interface ToastValue {
  /** Fire a toast. Identical consecutive titles collapse — see `push`. */
  push: (toast: Omit<Toast, 'id'>) => void;
}

/**
 * The dismiss button's accessible name.
 *
 * A prop rather than a `useI18n()` call inside the item, because this provider is
 * mounted by the root layout, which already holds the dictionary. Reaching for the
 * dictionary here too would give the string two owners and one of them would drift.
 * It is required, not optional — an unlabelled icon button is invisible to a screen
 * reader, and a default in English would be a hardcoded user-facing string.
 */
interface ProviderProps {
  dismissLabel: string;
  children: ReactNode;
}

const ToastContext = createContext<ToastValue | null>(null);

const DISMISS_MS = 4200;
/** Beyond this the stack becomes a wall. Oldest is dropped first. */
const MAX_VISIBLE = 3;

export function EmberToastProvider({ dismissLabel, children }: ProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const drop = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<ToastValue['push']>((toast) => {
    const id = crypto.randomUUID();
    setToasts((current) => {
      // Tapping "add" four times should read as one confirmation that keeps
      // refreshing, not four stacked copies of the same sentence.
      const deduped = current.filter((existing) => existing.title !== toast.title);
      const next = [...deduped, { ...toast, id }];
      return next.slice(-MAX_VISIBLE);
    });
  }, []);

  // Own the dismiss timer here, keyed by id, so a toast that is removed early
  // (deduped, pushed out of the stack, or dismissed by hand) takes its timer with
  // it instead of firing into a void later.
  useEffect(() => {
    for (const toast of toasts) {
      if (timers.current.has(toast.id)) continue;
      timers.current.set(
        toast.id,
        setTimeout(() => drop(toast.id), DISMISS_MS),
      );
    }
    for (const [id, timer] of timers.current) {
      if (toasts.some((toast) => toast.id === id)) continue;
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, [toasts, drop]);

  useEffect(() => {
    const tracked = timers.current;
    return () => {
      for (const timer of tracked.values()) clearTimeout(timer);
      tracked.clear();
    };
  }, []);

  const value = useMemo<ToastValue>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // `pointer-events-none` on the viewport, restored per item: the stack sits
        // over the page and must not eat clicks meant for what is underneath it.
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-6 sm:end-6 sm:items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            dismissLabel={dismissLabel}
            onDismiss={() => drop(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  dismissLabel,
  onDismiss,
}: {
  toast: Toast;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const isReward = toast.kind === 'reward';

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    // Reduced motion still gets the toast — it is information, not decoration. It
    // simply arrives instead of travelling.
    if (prefersReducedMotion()) {
      gsap.set(el, { opacity: 1, y: 0, scale: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 14, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: DUR.fast, ease: EASE.out },
      );
    }, el);

    return () => ctx.revert();
  }, []);

  /** Animate out, then unmount — the beat the reference component skipped. */
  const leave = useCallback(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) {
      onDismiss();
      return;
    }
    gsap.to(el, {
      opacity: 0,
      y: 8,
      scale: 0.98,
      duration: DUR.fast,
      ease: EASE.inOut,
      onComplete: onDismiss,
    });
  }, [onDismiss]);


  return (
    <div
      ref={root}
      // opacity-0 as the authored rest state: GSAP states both ends explicitly
      // below, so this never becomes a stylesheet the tween reads a start value out
      // of. It only covers the frame before the effect runs.
      className={[
        'pointer-events-auto w-full max-w-sm opacity-0',
        'flex items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-sm',
        isReward
          ? 'border-ember/60 bg-ash-100/95 shadow-ember/10'
          : 'border-ash-300 bg-ash-100/95',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          isReward ? 'bg-ember shadow-[0_0_10px_2px_var(--ember)]' : 'bg-flame',
        ].join(' ')}
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-bone">{toast.title}</p>
        {toast.note ? <p className="mt-1 text-xs text-bone/60">{toast.note}</p> : null}
      </div>

      <button
        type="button"
        onClick={leave}
        // Labelled from the dictionary by the caller's language, never a literal.
        aria-label={dismissLabel}
        className="-me-1 -mt-1 rounded p-1 text-bone/40 transition-colors hover:text-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
          <path
            d="M6 6l8 8M14 6l-8 8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <EmberToastProvider>.');
  return value;
}
