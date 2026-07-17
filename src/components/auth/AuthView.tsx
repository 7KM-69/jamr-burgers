'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ZodError } from 'zod';

import { useI18n } from '@/components/providers/I18nProvider';
import { EmberAction } from '@/components/ui/EmberAction';
import { EASE, gsap } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { signIn, signUp } from '@/lib/actions/auth';
import { signInSchema, signUpSchema } from '@/lib/schemas';
import type { ApiError, ErrorCode } from '@/lib/types/api';
import { AuthStage } from './AuthStage';
import { AuthField } from './AuthField';

type Mode = 'signin' | 'signup';
type FieldKey = 'fullName' | 'email' | 'password';
/** Machine keys (from Zod), mapped to copy at render — never rendered raw. */
type FieldErrors = Partial<Record<FieldKey, string>>;

/**
 * Sign in / create account, in the brand's identity.
 *
 * ## The server owns truth; this owns feedback
 *
 * The same Zod schemas the server actions parse with run here too, before the
 * network — not as a second source of truth (there is one, and it is the server)
 * but so a missing password is a red line under a field in the same frame, not a
 * round trip later. If the browser copy and the server copy ever disagreed, the
 * server would win: it re-parses everything and returns VALIDATION_ERROR, which
 * this renders identically to the local one.
 *
 * ## Errors are codes, never messages
 *
 * Every action returns an `ApiError` whose `.message` is English and dev-facing.
 * It is never shown. `.code` is mapped through `t.auth.errors` (exhaustive over
 * ErrorCode), and field-level Zod keys through `t.auth.fieldErrors`.
 *
 * ## EMAIL_NOT_CONFIRMED is a destination, not an error
 *
 * This project has email confirmation on. A sign-in against an unconfirmed address
 * is not "wrong password" — it is "check your inbox", so it routes to /auth/check
 * rather than flashing a red banner. Sign-up with confirmation on returns no
 * session and routes there too. If confirmation is ever turned off, sign-up
 * returns a session and this goes straight to `redirectTo` — the same code, both
 * ways.
 */
export function AuthView({ redirectTo }: { redirectTo: string }) {
  const { t } = useI18n();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<ErrorCode | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const formRef = useRef<HTMLFormElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const ledeRef = useRef<HTMLParagraphElement>(null);
  const firstRender = useRef(true);

  const isSignup = mode === 'signup';
  const headlineLines = t.auth.headline[mode];
  const lede = t.auth.lede[mode];

  // A mode switch refreshes the editorial column: the two headlines are different
  // jobs and should not merely cut. Opacity + a short lift, never the masked-line
  // machinery — that rest state is gated in CSS and re-triggering it here would
  // strand the type (see src/lib/gsap.ts). The masked spans keep the yPercent:0
  // the entrance already gave them; this moves their container, not them.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (prefersReducedMotion()) return;
    const targets = [headlineRef.current, ledeRef.current].filter(Boolean);
    gsap.fromTo(
      targets,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.45, ease: EASE.out, stagger: 0.06 },
    );
  }, [mode]);

  function fieldMessage(field: FieldKey, key: string): string {
    const map = t.auth.fieldErrors[field] as Record<string, string>;
    return map[key] ?? t.auth.fieldErrors.fallback;
  }

  function focusFirst(next: FieldErrors) {
    const order: FieldKey[] = isSignup ? ['fullName', 'email', 'password'] : ['email', 'password'];
    const bad = order.find((key) => next[key]);
    if (bad) formRef.current?.querySelector<HTMLInputElement>(`[name="${bad}"]`)?.focus();
  }

  function applyFieldErrors(source: Partial<Record<string, string[] | undefined>>) {
    const next: FieldErrors = {};
    for (const key of ['fullName', 'email', 'password'] as const) {
      const messages = source[key];
      if (messages && messages.length > 0) next[key] = messages[0];
    }
    setFieldErrors(next);
    setBanner('VALIDATION_ERROR');
    focusFirst(next);
  }

  function fromZod(error: ZodError) {
    applyFieldErrors(error.flatten().fieldErrors);
  }

  function fromApiError(error: ApiError) {
    if (error.code === 'VALIDATION_ERROR' && error.fieldErrors) {
      applyFieldErrors(error.fieldErrors);
      return;
    }
    setBanner(error.code);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setBanner(null);
    setFieldErrors({});
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);
    setFieldErrors({});

    if (isSignup) {
      const trimmedName = fullName.trim();
      const parsed = signUpSchema.safeParse({
        email,
        password,
        ...(trimmedName ? { fullName: trimmedName } : {}),
      });
      if (!parsed.success) {
        fromZod(parsed.error);
        return;
      }

      setPending(true);
      const result = await signUp(parsed.data);
      if (result.ok) {
        if (result.data.needsEmailConfirmation) {
          router.push(`/auth/check?email=${encodeURIComponent(email.trim())}`);
        } else {
          router.push(redirectTo);
          router.refresh();
        }
        return; // Navigating away — keep the button in its working state.
      }
      setPending(false);
      fromApiError(result.error);
      return;
    }

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      fromZod(parsed.error);
      return;
    }

    setPending(true);
    const result = await signIn(parsed.data);
    if (result.ok) {
      router.push(redirectTo);
      router.refresh();
      return;
    }
    setPending(false);
    if (result.error.code === 'EMAIL_NOT_CONFIRMED') {
      router.push(`/auth/check?email=${encodeURIComponent(email.trim())}&from=signin`);
      return;
    }
    fromApiError(result.error);
  }

  return (
    <AuthStage section="auth">
      <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_minmax(0,26rem)] lg:gap-20">
        {/* Editorial column ------------------------------------------------ */}
        <div>
          <p data-animate className="eyebrow">
            {t.auth.eyebrow}
          </p>

          <h1 ref={headlineRef} className="display mt-5 text-h1 text-bone">
            {headlineLines.map((line, index) => (
              <span key={index} className="mask-line">
                <span data-mask className="block will-change-transform">
                  {line}
                </span>
              </span>
            ))}
          </h1>

          <p ref={ledeRef} data-animate className="measure mt-6 text-lead text-ash-700">
            {lede}
          </p>

          <ul data-animate className="mt-12 hidden max-w-md gap-7 lg:grid">
            {t.auth.promise.map((item) => (
              <li key={item.title} className="flex gap-4">
                <span aria-hidden className="mt-2 h-2 w-2 shrink-0 bg-ember" />
                <div>
                  <h2 className="text-sm font-semibold text-bone">{item.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-ash-700">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Form column ----------------------------------------------------- */}
        <div
          data-animate
          className="border border-ash-400 bg-ash-200/70 p-6 backdrop-blur-sm sm:p-8"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          {/* Mode switch — a real, labelled group of two pressed-state buttons. */}
          <div
            role="group"
            aria-label={t.auth.a11y.modeGroup}
            className="grid grid-cols-2 gap-1 border border-ash-400 p-1"
            style={{ borderRadius: 'var(--radius-sharp)' }}
          >
            {(['signin', 'signup'] as const).map((value) => {
              const active = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  data-mode={value}
                  onClick={() => switchMode(value)}
                  aria-pressed={active}
                  className={`px-3 py-2.5 text-sm font-semibold transition-colors duration-200 ${
                    active ? 'bg-ash-300 text-bone' : 'text-ash-700 hover:text-bone'
                  }`}
                  style={{ borderRadius: 'var(--radius-sharp)' }}
                >
                  {t.auth.mode[value]}
                </button>
              );
            })}
          </div>

          <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-5">
            {banner ? (
              <div
                role="alert"
                className="border border-ember/40 bg-ember/10 px-4 py-3"
                style={{ borderRadius: 'var(--radius-sharp)' }}
              >
                <h2 className="sr-only">{t.auth.a11y.problem}</h2>
                <p className="text-sm text-bone">{t.auth.errors[banner]}</p>
                {banner === 'EMAIL_ALREADY_REGISTERED' ? (
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="mt-1.5 text-sm font-semibold text-ember underline decoration-ember/40 underline-offset-4 transition-colors hover:decoration-ember"
                  >
                    {t.auth.signInInstead}
                  </button>
                ) : null}
              </div>
            ) : null}

            {isSignup ? (
              <AuthField
                type="text"
                name="fullName"
                label={t.auth.field.name.label}
                hint={t.auth.field.name.hint}
                value={fullName}
                onChange={setFullName}
                autoComplete="name"
                error={fieldErrors.fullName ? fieldMessage('fullName', fieldErrors.fullName) : undefined}
              />
            ) : null}

            <AuthField
              type="email"
              name="email"
              label={t.auth.field.email.label}
              value={email}
              onChange={setEmail}
              autoComplete="email"
              inputMode="email"
              error={fieldErrors.email ? fieldMessage('email', fieldErrors.email) : undefined}
            />

            <AuthField
              type="password"
              name="password"
              label={t.auth.field.password.label}
              hint={isSignup ? t.auth.field.password.hint : undefined}
              value={password}
              onChange={setPassword}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              reveal
              revealed={revealed}
              onToggleReveal={() => setRevealed((value) => !value)}
              revealLabel={t.auth.a11y.showPassword}
              hideLabel={t.auth.a11y.hidePassword}
              error={fieldErrors.password ? fieldMessage('password', fieldErrors.password) : undefined}
            />

            {isSignup ? (
              <p className="text-xs leading-relaxed text-ash-700">{t.auth.confirmNote}</p>
            ) : null}

            <EmberAction type="submit" data-auth-submit disabled={pending} className="mt-1 w-full">
              {pending ? t.auth.submit.working : t.auth.submit[mode]}
            </EmberAction>
          </form>

          <p className="mt-6 text-center text-sm text-ash-700">
            {isSignup ? t.auth.switch.toSignin.question : t.auth.switch.toSignup.question}{' '}
            <button
              type="button"
              onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
              className="font-semibold text-ember underline decoration-ember/40 underline-offset-4 transition-colors hover:decoration-ember"
            >
              {isSignup ? t.auth.switch.toSignin.action : t.auth.switch.toSignup.action}
            </button>
          </p>
        </div>
      </div>
    </AuthStage>
  );
}
