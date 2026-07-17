import { getLoyaltyProgress } from '@/lib/server/loyalty';
import { LOYALTY_CYCLE_LENGTH, type LoyaltyProgress } from '@/lib/types/api';

import { LoyaltyMeter } from './LoyaltyMeter';

/**
 * The loyalty seam — part 12. A self-fetching async SERVER component that reads
 * the three numbers on the server and hands them to the client meter, which owns
 * the copy (reactive to the language toggle) and the coal animation.
 *
 * ## Why this shape
 *
 * The language toggle is a client context, so the copy has to render in a client
 * component. The three loyalty numbers are user-scoped server truth. So the split
 * is exactly here: `getLoyaltyProgress()` (server) → `LoyaltyMeter` (client). It is
 * mounted in TWO places — the account page and the cart drawer — and CLAUDE.md
 * requires both. `getLoyaltyProgress` is wrapped in React's `cache()`, so when a
 * render touches both mount sites (the /account route carries the drawer too) the
 * two calls collapse to one query for the request. It is a within-render dedup, not
 * a cross-request cache — see the header comment on `src/lib/server/loyalty.ts`.
 *
 * ## Why the read is CAUGHT here
 *
 * `getLoyaltyProgress()` throws on a genuine read failure (e.g. a missing profiles
 * row). The drawer panel renders in the ROOT LAYOUT, on every route — an uncaught
 * throw here would take down the whole site, the way a thrown catalogue read would
 * (see layout.tsx). So a failed read degrades to "no meter" rather than a crash:
 * `null` is already the signed-out state the meter draws gracefully, and a soft
 * loss of the meter is never a wrong number. The account page's own guard means a
 * signed-in diner effectively never sees this fallback there.
 *
 * `null` from the fetch (signed out) is passed straight through — it is not an
 * error, it is the "sign in to start the count" state.
 */
export async function LoyaltyPanel({ variant }: { variant: 'account' | 'drawer' }) {
  let progress: LoyaltyProgress | null = null;
  try {
    progress = await getLoyaltyProgress();
  } catch {
    progress = null;
  }

  return <LoyaltyMeter progress={progress} variant={variant} cycleLength={LOYALTY_CYCLE_LENGTH} />;
}
