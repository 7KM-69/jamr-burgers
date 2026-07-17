'use client';

import { useId } from 'react';

/**
 * One labelled input for the auth forms — the only place a field is drawn, so a
 * text field, an email field and a password field cannot drift into three
 * slightly different controls.
 *
 * Accessibility is the whole point of factoring it out:
 *   · the `<label>` is a real label, tied by `htmlFor`.
 *   · the hint and the error are wired into `aria-describedby`, so a screen reader
 *     announces the requirement and the failure, not just the label.
 *   · `aria-invalid` marks the field when it has an error, and the message carries
 *     `role="alert"` so it is spoken the moment it appears.
 *   · the reveal control is a real `<button type="button">` with an accessible
 *     name that flips between show/hide — never an icon alone.
 *
 * The focus ring is the site-wide flame `:focus-visible` outline (globals.css);
 * this only adds the ember border on error and on hover, which is colour, not the
 * a11y affordance.
 */
export function AuthField({
  label,
  type,
  name,
  value,
  onChange,
  hint,
  error,
  autoComplete,
  inputMode,
  reveal,
  revealed,
  onToggleReveal,
  revealLabel,
  hideLabel,
}: {
  label: string;
  type: 'text' | 'email' | 'password';
  name: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  /** Already mapped to copy in the reader's language. */
  error?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'email';
  /** Password only: render the show/hide affordance. */
  reveal?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
  revealLabel?: string;
  hideLabel?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  // A revealed password renders as plain text; otherwise the field's own type.
  const inputType = reveal ? (revealed ? 'text' : 'password') : type;

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

      <div className="relative">
        <input
          id={id}
          name={name}
          type={inputType}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full bg-ash-100 px-4 py-3.5 text-bone placeholder-ash-600 outline-none transition-colors duration-200 ${
            reveal ? 'pe-12' : ''
          } border ${
            error ? 'border-ember' : 'border-ash-400 hover:border-ash-500 focus:border-ember'
          }`}
          style={{ borderRadius: 'var(--radius-sharp)' }}
        />

        {reveal ? (
          <button
            type="button"
            onClick={onToggleReveal}
            aria-label={revealed ? hideLabel : revealLabel}
            aria-pressed={revealed}
            className="absolute inset-y-0 end-0 grid w-12 place-items-center text-ash-700 transition-colors duration-200 hover:text-bone"
          >
            <span aria-hidden>
              {revealed ? (
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10Z" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" />
                  <path d="M3 3l14 14" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10Z" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" />
                </svg>
              )}
            </span>
          </button>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-ember">
          {error}
        </p>
      ) : null}
    </div>
  );
}
