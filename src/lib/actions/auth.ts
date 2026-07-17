'use server';

import { revalidatePath } from 'next/cache';

import { signInSchema, signUpSchema, type SignInInput, type SignUpInput } from '@/lib/schemas';
import { failFromAuth, failUnexpected, failValidation, ok } from '@/lib/server/errors';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/types/api';

/**
 * Auth actions.
 *
 * Every one of them RETURNS its error rather than throwing. A thrown error crosses
 * the RSC boundary as an opaque digest, and the UI cannot branch on a digest.
 *
 * The parameter types below are compile-time convenience for `design`. They are
 * NOT what protects the endpoint — a server action is a public HTTP endpoint and a
 * hostile caller can post anything at all to it. The `safeParse` on the first line
 * of each function is the protection.
 */

/**
 * Sign up with email + password.
 *
 * `fullName`, when supplied, is written to `raw_user_meta_data.full_name`, which is
 * where the `on_auth_user_created` trigger reads it from to populate
 * `profiles.full_name`. The key must be exactly `full_name` — the trigger does
 * `new.raw_user_meta_data ->> 'full_name'`, and a camelCase key here would silently
 * produce a profile with a null name and no error anywhere.
 *
 * `needsEmailConfirmation` is true when Supabase returns no session, which is what
 * it does when email confirmation is switched on in the project. `design` needs a
 * "check your inbox" state for that case.
 *
 * On user enumeration: when confirmation is ON, Supabase deliberately returns a
 * *success* for an email that already exists, rather than revealing that it does.
 * We pass that through unchanged instead of "helpfully" detecting it (the usual
 * trick is to inspect `user.identities.length === 0`), because doing so would turn
 * this endpoint into an account-existence oracle. When confirmation is OFF Supabase
 * returns an explicit error, which maps to EMAIL_ALREADY_REGISTERED.
 */
export async function signUp(
  input: SignUpInput,
): Promise<ActionResult<{ userId: string; needsEmailConfirmation: boolean }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return failValidation(parsed.error);

  const { email, password, fullName } = parsed.data;

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Only send the key when we have a value: an explicit `undefined` would
        // land in the metadata as a null and overwrite nothing useful.
        data: fullName ? { full_name: fullName } : undefined,
      },
    });

    if (error) return failFromAuth('auth.signUp', error);

    if (!data.user) {
      // Should be unreachable: no error and no user is not a documented outcome.
      return failUnexpected(
        'auth.signUp',
        new Error('signUp returned neither an error nor a user.'),
      );
    }

    // The session cookie has changed. Blow away the cached render of everything
    // under the root layout, or the nav keeps showing "Sign in".
    revalidatePath('/', 'layout');

    return ok({
      userId: data.user.id,
      needsEmailConfirmation: data.session === null,
    });
  } catch (cause) {
    return failUnexpected('auth.signUp', cause);
  }
}

/** Sign in with email + password. */
export async function signIn(input: SignInInput): Promise<ActionResult<{ userId: string }>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return failValidation(parsed.error);

  const { email, password } = parsed.data;

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return failFromAuth('auth.signIn', error);

    if (!data.user) {
      return failUnexpected(
        'auth.signIn',
        new Error('signInWithPassword returned neither an error nor a user.'),
      );
    }

    revalidatePath('/', 'layout');

    return ok({ userId: data.user.id });
  } catch (cause) {
    return failUnexpected('auth.signIn', cause);
  }
}

/**
 * Sign out.
 *
 * Note there is no redirect here. `redirect()` inside a Server Action throws a
 * control-flow exception, which would be caught by the `catch` below and reported
 * as an INTERNAL error while still, confusingly, redirecting. The caller navigates.
 */
export async function signOut(): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.signOut();
    if (error) return failFromAuth('auth.signOut', error);

    revalidatePath('/', 'layout');

    return ok(null);
  } catch (cause) {
    return failUnexpected('auth.signOut', cause);
  }
}

/**
 * Whether there is a signed-in user, for client components that need to branch.
 *
 * Returns the user id and email only. Never the session, never the access token —
 * handing a token to the client is how it ends up in `localStorage`, in a log, or
 * in an error report.
 */
export async function getSessionUser(): Promise<
  ActionResult<{ userId: string; email: string | null } | null>
> {
  try {
    const supabase = await createClient();

    // getUser(), not getSession(). getSession() decodes the cookie and trusts it.
    const { data, error } = await supabase.auth.getUser();

    // No session is a signed-out visitor, not a fault.
    if (error || !data.user) return ok(null);

    return ok({ userId: data.user.id, email: data.user.email ?? null });
  } catch (cause) {
    return failUnexpected('auth.getSessionUser', cause);
  }
}
