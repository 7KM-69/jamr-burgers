'use client';

import { useId } from 'react';

/**
 * One labelled field for the checkout form — the only place a checkout input is
 * drawn, so the name, the phone and the address cannot drift into three slightly
 * different controls. Sibling of `AuthField`; it adds a `textarea` mode the
 * address needs and drops the password reveal the auth form needs.
 *
 * Accessibility is the reason it is factored out:
 *   · the `<label>` is real, tied by `htmlFor`.
 *   · the hint and the error are wired into `aria-describedby`, so a screen reader
 *     announces the requirement and the failure, not just the label.
 *   · `aria-invalid` marks the field on error, and the message carries
 *     `role="alert"` so it is spoken the moment it appears.
 *
 * The focus ring is the site-wide flame `:focus-visible` outline (globals.css);
 * this only adds the ember border on error and on hover.
 */
export function CheckoutField({
  label,
  name,
  value,
  onChange,
  hint,
  error,
  type = 'text',
  as = 'input',
  autoComplete,
  inputMode,
  rows = 3,
  disabled,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  /** Already mapped to copy in the reader's language. */
  error?: string;
  type?: 'text' | 'tel';
  as?: 'input' | 'textarea';
  autoComplete?: string;
  inputMode?: 'text' | 'tel';
  rows?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  // No `outline-none` — see AuthField. The site's flame :focus-visible ring is the
  // keyboard focus signal; the ember border is the extra one. Killing the ring here
  // would strand a keyboard user mid-checkout with no idea which field is active.
  const surface = `w-full bg-ash-100 px-4 py-3.5 text-bone placeholder-ash-600 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 border ${
    error ? 'border-ember' : 'border-ash-400 hover:border-ash-500 focus:border-ember'
  }`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-bone">{label}</span>
        {hint ? (
          <span id={hintId} className="text-xs font-medium text-ash-700">
            {hint}
          </span>
        ) : null}
      </label>

      {as === 'textarea' ? (
        <textarea
          id={id}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          rows={rows}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${surface} resize-none`}
          style={{ borderRadius: 'var(--radius-sharp)' }}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={surface}
          style={{ borderRadius: 'var(--radius-sharp)' }}
        />
      )}

      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-ember">
          {error}
        </p>
      ) : null}
    </div>
  );
}
