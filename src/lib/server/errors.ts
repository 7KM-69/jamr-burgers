import 'server-only';

import type { AuthError, PostgrestError } from '@supabase/supabase-js';
import type { ZodError } from 'zod';

import type { ActionResult, ApiError, ErrorCode } from '@/lib/types/api';

/**
 * Errors: safe outward, detailed inward.
 *
 * The caller gets a machine `code` and a fixed English developer message. The real
 * error — the Postgres text, the stack, the Supabase internals — is logged
 * server-side and never crosses the wire. A leaked database error is a map of the
 * system for whoever is poking at it.
 */

// ---------------------------------------------------------------------------
// Result constructors
// ---------------------------------------------------------------------------

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(
  code: ErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  const error: ApiError = { code, message };
  if (fieldErrors) error.fieldErrors = fieldErrors;
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/**
 * Structured server-side log. JSON, never string concatenation.
 *
 * Never pass a request body, a token, a password, or an email address into
 * `context`. Identify by user id, which is safe and is what you actually need to
 * reproduce the problem.
 */
export function logServerError(
  scope: string,
  cause: unknown,
  context: Record<string, string | number | boolean | null> = {},
): void {
  const detail =
    cause instanceof Error
      ? { name: cause.name, message: cause.message, stack: cause.stack }
      : { name: 'NonError', message: String(cause), stack: null };

  console.error(
    JSON.stringify({
      level: 'error',
      scope,
      at: new Date().toISOString(),
      ...context,
      error: detail,
    }),
  );
}

// ---------------------------------------------------------------------------
// Zod → VALIDATION_ERROR
// ---------------------------------------------------------------------------

export function failValidation(zodError: ZodError): ActionResult<never> {
  const flattened = zodError.flatten().fieldErrors;

  const fieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(flattened)) {
    if (messages && messages.length > 0) fieldErrors[field] = messages;
  }

  return fail('VALIDATION_ERROR', 'Input failed validation.', fieldErrors);
}

// ---------------------------------------------------------------------------
// Postgres RPC errors → ErrorCode
// ---------------------------------------------------------------------------

/**
 * The RPCs raise exceptions whose *message* is a stable machine code
 * (CONTRACT.md §5). We switch on the message. We never switch on, and never
 * render, the `hint` — that is developer prose and may change.
 */
const RPC_CODE_MAP: Record<string, { code: ErrorCode; message: string }> = {
  UNAUTHENTICATED: {
    code: 'UNAUTHENTICATED',
    message: 'The RPC ran with no auth.uid(). The session did not reach Postgres.',
  },
  EMPTY_CART: {
    code: 'VALIDATION_ERROR',
    message: 'Cart was empty at the database. Zod should have caught this first.',
  },
  INVALID_ITEMS: {
    code: 'VALIDATION_ERROR',
    message: 'p_items was malformed at the database. Zod should have caught this first.',
  },
  INVALID_QTY: {
    code: 'VALIDATION_ERROR',
    message: 'Merged quantity for a product fell outside 1..20.',
  },
  INVALID_CUSTOMER_DETAILS: {
    code: 'VALIDATION_ERROR',
    message: 'Customer name, phone or address was blank after trimming.',
  },
  PRODUCT_UNAVAILABLE: {
    code: 'PRODUCT_UNAVAILABLE',
    message: 'A product in the cart is missing or delisted. No order was created.',
  },
  REWARD_UNAVAILABLE: {
    code: 'REWARD_UNAVAILABLE',
    message: 'Redemption requested with no available reward. No order was created.',
  },
  ORDER_NOT_FOUND: {
    code: 'NOT_FOUND',
    message: 'No order with that id belongs to this user.',
  },
  ORDER_NOT_PENDING: {
    code: 'ORDER_NOT_PENDING',
    message: 'The order is cancelled and cannot be confirmed.',
  },
};

/**
 * `INVALID_QTY` / `INVALID_CUSTOMER_DETAILS` come back from Postgres without a
 * field name. Zod normally catches both before the RPC is ever called, so this is
 * the belt-and-braces path — but if it fires, the UI still needs to know which
 * input to mark.
 */
const RPC_FIELD_HINTS: Record<string, Record<string, string[]>> = {
  EMPTY_CART: { items: ['EMPTY_CART'] },
  INVALID_ITEMS: { items: ['INVALID_ITEMS'] },
  INVALID_QTY: { items: ['INVALID_QTY'] },
};

export function failFromRpc(
  scope: string,
  error: PostgrestError,
  context: Record<string, string | number | boolean | null> = {},
): ActionResult<never> {
  const mapped = RPC_CODE_MAP[error.message];

  if (!mapped) {
    // An unmapped Postgres error is a real fault — a constraint we did not expect,
    // a permissions problem, a schema drift. Log everything, tell the caller
    // nothing.
    logServerError(scope, new Error(`Unmapped RPC error: ${error.message}`), {
      ...context,
      pgCode: error.code ?? null,
      pgDetails: error.details ?? null,
    });
    return fail('INTERNAL', 'Internal server error.');
  }

  // Expected, mapped failures are normal business outcomes (a delisted burger, a
  // reward someone else just spent). They are not faults, so they are not logged
  // as errors — logging them would drown the real ones in noise.
  return fail(mapped.code, mapped.message, RPC_FIELD_HINTS[error.message]);
}

// ---------------------------------------------------------------------------
// Supabase Auth errors → ErrorCode
// ---------------------------------------------------------------------------

const AUTH_CODE_MAP: Record<string, { code: ErrorCode; message: string }> = {
  invalid_credentials: {
    code: 'INVALID_CREDENTIALS',
    message: 'Email or password is wrong.',
  },
  email_not_confirmed: {
    code: 'EMAIL_NOT_CONFIRMED',
    message: 'The email address has not been confirmed yet.',
  },
  user_already_exists: {
    code: 'EMAIL_ALREADY_REGISTERED',
    message: 'An account already exists for this email.',
  },
  email_exists: {
    code: 'EMAIL_ALREADY_REGISTERED',
    message: 'An account already exists for this email.',
  },
  weak_password: {
    code: 'WEAK_PASSWORD',
    message: 'The password was rejected by the password policy.',
  },
  over_request_rate_limit: {
    code: 'RATE_LIMITED',
    message: 'Too many attempts. Back off and retry.',
  },
  over_email_send_rate_limit: {
    code: 'RATE_LIMITED',
    message: 'Too many emails requested. Back off and retry.',
  },
};

export function failFromAuth(scope: string, error: AuthError): ActionResult<never> {
  const mapped = error.code ? AUTH_CODE_MAP[error.code] : undefined;

  if (mapped) return fail(mapped.code, mapped.message);

  // Supabase does not give every auth failure a `code`, but it does set `status`.
  if (error.status === 429) {
    return fail('RATE_LIMITED', 'Too many attempts. Back off and retry.');
  }

  logServerError(scope, error, {
    authCode: error.code ?? null,
    authStatus: error.status ?? null,
  });
  return fail('INTERNAL', 'Internal server error.');
}

// ---------------------------------------------------------------------------
// Unexpected throws
// ---------------------------------------------------------------------------

/** The last line. Log the truth, return a generic. Never an empty catch. */
export function failUnexpected(
  scope: string,
  cause: unknown,
  context: Record<string, string | number | boolean | null> = {},
): ActionResult<never> {
  logServerError(scope, cause, context);
  return fail('INTERNAL', 'Internal server error.');
}
