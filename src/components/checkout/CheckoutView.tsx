'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ZodError } from 'zod';

import { useI18n } from '@/components/providers/I18nProvider';
import { EmberAction } from '@/components/ui/EmberAction';
import { EmberButton } from '@/components/ui/EmberButton';
import { formatMinor, lineTotal } from '@/components/menu/money';
import { useCart, type CartProduct } from '@/components/cart/CartProvider';
import { EASE, gsap } from '@/lib/gsap';
import { prefersReducedMotion } from '@/lib/motion';
import { placeOrder, confirmOrder } from '@/lib/actions/orders';
import { placeOrderSchema } from '@/lib/schemas';
import type { ApiError, ErrorCode, OrderLine, OrderSummary } from '@/lib/types/api';
import { AuthStage } from '@/components/auth/AuthStage';
import { CheckoutField } from './CheckoutField';

/**
 * /checkout — part 11. Collect name + phone + address, place a PENDING order,
 * confirm it. THERE IS NO PAYMENT (CLAUDE.md §Payment), and the `DemoNote` below
 * says so out loud so this build can never be taken for a real store.
 *
 * ## The five rules this component exists to obey
 *
 *  1. It sends product ids + quantities ONLY. No price, no discount, no total, no
 *     user id — `placeOrderSchema` has no field that would accept one, and the RPC
 *     recomputes the subtotal from `products`. The cart never held a price either.
 *  2. `clientToken` is ONE `crypto.randomUUID()` per checkout ATTEMPT, reused across
 *     retries (`ensureToken`), regenerated only when the user goes back to edit
 *     (`resetToken`). That is what makes `place_order` idempotent — a double-click,
 *     or a resubmit after a transient error, returns the SAME order, not a second.
 *  3. It renders the SERVER's totals. `provisionalSubtotalCents` is shown while the
 *     user fills the form and is labelled provisional; the instant `placeOrder`
 *     returns, `OrderSummary` (subtotal/discount/total, all computed in Postgres)
 *     replaces it, and `confirmOrder`'s summary — which may have been repriced by a
 *     concurrent cancel — is what the confirmed screen shows.
 *  4. A delisted line BLOCKS checkout before submit (`hasUnavailable`), because
 *     `place_order` would reject the whole order with PRODUCT_UNAVAILABLE and the
 *     user would meet an opaque error instead of a fixable one.
 *  5. Redeeming a reward is the user's choice; the SERVER decides if it is allowed.
 *     `rewardAvailable` is read server-side (`getLoyaltyProgress`); on
 *     REWARD_UNAVAILABLE the UI was stale, so it drops the reward, tells the user,
 *     and re-reads the server truth (`router.refresh()`). The 5-dot progress meter
 *     is part 12 — deliberately not faked here.
 *
 * ## Motion, and the gated-reveal trap
 *
 * The `AuthStage` intro (eyebrow, masked headline, lede) is revealed ONCE by the
 * stage's entrance timeline, so only content present at mount may carry `data-mask`
 * / `data-animate`. The interactive body swaps between phases, so it uses NEITHER —
 * it is always visible (never stranded behind `html.motion`), and each phase gets a
 * short local fade that always ENDS visible, honouring reduced motion.
 */

type Phase = 'form' | 'review' | 'done';
type FieldKey = 'customerName' | 'customerPhone' | 'customerAddress';
type FieldErrors = Partial<Record<FieldKey, string>>;

export function CheckoutView({
  initialName,
  rewardAvailable,
  catalog,
}: {
  initialName: string | null;
  /** Server truth at page load: does the diner hold a spendable reward? */
  rewardAvailable: boolean;
  /** The live product rows, for joining server order lines back to a name + photo. */
  catalog: CartProduct[];
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const {
    lines,
    resolved,
    provisionalSubtotalCents,
    hasUnavailable,
    catalogOk,
    hydrated,
    open,
    remove,
  } = useCart();

  const [phase, setPhase] = useState<Phase>('form');
  const [name, setName] = useState(initialName ?? '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [redeem, setRedeem] = useState(rewardAvailable);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<ErrorCode | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [placed, setPlaced] = useState<OrderSummary | null>(null);
  const [confirmed, setConfirmed] = useState<OrderSummary | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  /**
   * The idempotency key. Null until the first submit, then held for the whole
   * attempt — a retry reuses it (idempotent), and only `resetToken()` (a genuine
   * re-edit) mints a fresh one so the new order is genuinely new.
   */
  const tokenRef = useRef<string | null>(null);
  const ensureToken = () => (tokenRef.current ??= crypto.randomUUID());
  const resetToken = () => {
    tokenRef.current = null;
  };

  // The reward can only be applied if the server said one exists. If a refresh
  // takes it away, `redeem` is clamped off so we never SEND a stale true.
  const canRedeem = rewardAvailable;
  const effectiveRedeem = redeem && canRedeem;

  /* --- phase fade — always ends visible, skipped under reduced motion ------ */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || prefersReducedMotion()) return;
    gsap.fromTo(
      el,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.42, ease: EASE.out },
    );
  }, [phase]);

  /* --- error plumbing ------------------------------------------------------ */

  function fieldMessage(field: FieldKey, key: string): string {
    const map = t.checkout.fieldErrors[field] as Record<string, string>;
    return map[key] ?? t.checkout.fieldErrors.fallback;
  }

  function focusFirst(next: FieldErrors) {
    const order: FieldKey[] = ['customerName', 'customerPhone', 'customerAddress'];
    const bad = order.find((key) => next[key]);
    if (bad) {
      formRef.current
        ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${bad}"]`)
        ?.focus();
    }
  }

  function applyFieldErrors(source: Partial<Record<string, string[] | undefined>>) {
    const next: FieldErrors = {};
    for (const key of ['customerName', 'customerPhone', 'customerAddress'] as const) {
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

  /* --- place: form → review ------------------------------------------------ */

  async function handlePlace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);
    setFieldErrors({});

    // Defensive: these states render something other than the form, but never
    // build an order out of an empty or broken cart.
    if (!catalogOk || hasUnavailable || lines.length === 0) return;

    const input = {
      items: lines.map((line) => ({ productId: line.id, qty: line.qty })),
      redeemReward: effectiveRedeem,
      customerName: name.trim(),
      customerPhone: phone.trim(),
      customerAddress: address.trim(),
      clientToken: ensureToken(),
    };

    // Same schema the server parses with — a courtesy that fails a bad field in
    // this frame instead of after a round trip. The server re-parses regardless.
    const parsed = placeOrderSchema.safeParse(input);
    if (!parsed.success) {
      fromZod(parsed.error);
      return;
    }

    setPending(true);
    const result = await placeOrder(parsed.data);
    setPending(false);

    if (result.ok) {
      setPlaced(result.data);
      setBanner(null);
      setPhase('review');
      return;
    }

    // The order was NOT created in either of these; recover in place.
    if (result.error.code === 'UNAUTHENTICATED') {
      router.push('/auth?redirect=/checkout');
      return;
    }
    if (result.error.code === 'REWARD_UNAVAILABLE') {
      setRedeem(false);
      setBanner('REWARD_UNAVAILABLE');
      router.refresh(); // re-read loyalty; the toggle disappears if the reward is gone
      return;
    }
    if (result.error.code === 'PRODUCT_UNAVAILABLE') {
      setBanner('PRODUCT_UNAVAILABLE');
      router.refresh(); // re-read the catalogue; the blocked state may now apply
      return;
    }
    fromApiError(result.error);
  }

  /* --- confirm: review → done ---------------------------------------------- */

  async function handleConfirm() {
    if (!placed) return;
    setBanner(null);
    setPending(true);
    const result = await confirmOrder({ orderId: placed.id });
    setPending(false);

    if (result.ok) {
      // Render THIS summary — a concurrent cancel may have repriced the order
      // between place and confirm (CONTRACT.md §8.1).
      setConfirmed(result.data);
      setPhase('done');
      // The order is placed; the cart has done its job. Clearing it here means a
      // reload does not offer to order the same thing twice.
      for (const line of lines) remove(line.id);
      return;
    }

    if (result.error.code === 'UNAUTHENTICATED') {
      router.push('/auth?redirect=/checkout');
      return;
    }
    fromApiError(result.error);
  }

  function handleEdit() {
    setBanner(null);
    setPlaced(null);
    resetToken(); // a genuine new attempt gets a fresh idempotency key
    setPhase('form');
  }

  /* --- what to render ------------------------------------------------------- */

  const bySlug = new Map(catalog.map((product) => [product.slug, product]));

  let content: React.ReactNode;
  if (phase === 'done' && confirmed) {
    content = <Done summary={confirmed} bySlug={bySlug} />;
  } else if (phase === 'review' && placed) {
    content = (
      <Review
        summary={placed}
        bySlug={bySlug}
        banner={banner}
        pending={pending}
        onConfirm={handleConfirm}
        onEdit={handleEdit}
      />
    );
  } else if (!hydrated) {
    content = <Loading />;
  } else if (!catalogOk) {
    content = <Offline />;
  } else if (resolved.length === 0) {
    content = <EmptyOrder />;
  } else if (hasUnavailable) {
    content = <Blocked onOpen={open} />;
  } else {
    content = (
      <Form
        formRef={formRef}
        name={name}
        phone={phone}
        address={address}
        onName={setName}
        onPhone={setPhone}
        onAddress={setAddress}
        redeem={effectiveRedeem}
        canRedeem={canRedeem}
        onRedeem={setRedeem}
        banner={banner}
        fieldErrors={fieldErrors}
        fieldMessage={fieldMessage}
        pending={pending}
        onSubmit={handlePlace}
        subtotalCents={provisionalSubtotalCents}
        lines={resolved.map((line) => ({ product: line.product, qty: line.qty, key: line.id }))}
        lang={lang}
      />
    );
  }

  return (
    <AuthStage section="checkout">
      <div className="mx-auto w-full max-w-5xl">
        <p data-animate className="eyebrow">
          {t.checkout.eyebrow}
        </p>

        <h1 className="display mt-5 text-h1 text-bone">
          {t.checkout.headline.map((line, index) => (
            <span key={index} className="mask-line">
              <span data-mask className="block will-change-transform">
                {line}
              </span>
            </span>
          ))}
        </h1>

        <p data-animate className="measure mt-6 text-lead text-ash-700">
          {t.checkout.lede}
        </p>

        <div ref={bodyRef} className="mt-12">
          {content}
        </div>
      </div>
    </AuthStage>
  );
}

/* ========================================================================== *
 * The persistent guardrail note. CLAUDE.md requires it to be visible so the
 * build can never be mistaken for a real store.
 * ========================================================================== */

function DemoNote() {
  const { t } = useI18n();
  return (
    <div
      className="flex items-start gap-3 border border-flame/30 bg-flame/5 px-4 py-3"
      style={{ borderRadius: 'var(--radius-sharp)' }}
    >
      <span
        className="mt-0.5 shrink-0 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-ink"
        style={{ backgroundColor: 'var(--color-flame)', borderRadius: 'var(--radius-sharp)' }}
      >
        {t.checkout.demo.label}
      </span>
      <p className="text-xs leading-relaxed text-ash-700">{t.checkout.demo.body}</p>
    </div>
  );
}

/* ========================================================================== *
 * The error banner — a code becomes a sentence a human reads.
 * ========================================================================== */

function Banner({ code }: { code: ErrorCode }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="border border-ember/40 bg-ember/10 px-4 py-3"
      style={{ borderRadius: 'var(--radius-sharp)' }}
    >
      <h2 className="sr-only">{t.checkout.a11y.problem}</h2>
      <p className="text-sm text-bone">{t.checkout.errors[code]}</p>
    </div>
  );
}

/* ========================================================================== *
 * Shared order-line + totals rendering.
 * ========================================================================== */

function LineRow({
  name,
  imagePath,
  unitPriceCents,
  qty,
  eachLabel,
  currency,
}: {
  name: string | null;
  imagePath: string | null;
  unitPriceCents: number;
  qty: number;
  eachLabel: string;
  currency: string;
}) {
  return (
    <li className="flex items-start gap-4 py-4">
      <span
        className="relative block size-14 shrink-0 overflow-hidden border border-ash-400 bg-ash-100"
        style={{ borderRadius: 'var(--radius-sharp)' }}
      >
        {imagePath ? (
          <Image src={imagePath} alt="" fill sizes="56px" className="object-cover" />
        ) : (
          <span aria-hidden className="grid h-full w-full place-items-center">
            <span className="block size-2 rounded-full border border-ash-600" />
          </span>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="display truncate text-lg leading-tight text-bone">{name ?? '—'}</h3>
          <span className="flex shrink-0 items-baseline gap-1.5">
            <span className="num text-base font-semibold text-bone">
              {formatMinor(lineTotal(unitPriceCents, qty))}
            </span>
            <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ash-700">
              {currency}
            </span>
          </span>
        </div>
        <p className="mt-1 flex items-baseline gap-1.5 text-xs text-ash-700">
          <span className="num">{qty}</span>
          <span aria-hidden>×</span>
          <span className="num">{formatMinor(unitPriceCents)}</span>
          <span>{currency}</span>
          <span>{eachLabel}</span>
        </p>
      </div>
    </li>
  );
}

/** A totals row. `emphasis` styles the final total line. */
function TotalRow({
  label,
  cents,
  currency,
  emphasis = false,
  negative = false,
}: {
  label: string;
  cents: number;
  currency: string;
  emphasis?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span
        className={
          emphasis
            ? 'eyebrow text-bone'
            : 'text-sm text-ash-700'
        }
      >
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span
          className={
            emphasis
              ? 'num text-2xl font-semibold text-bone'
              : negative
                ? 'num text-base font-semibold text-ember'
                : 'num text-base font-semibold text-bone'
          }
        >
          {negative ? `−${formatMinor(cents)}` : formatMinor(cents)}
        </span>
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ash-700">
          {currency}
        </span>
      </span>
    </div>
  );
}

/* ========================================================================== *
 * Phase: the form.
 * ========================================================================== */

function Form({
  formRef,
  name,
  phone,
  address,
  onName,
  onPhone,
  onAddress,
  redeem,
  canRedeem,
  onRedeem,
  banner,
  fieldErrors,
  fieldMessage,
  pending,
  onSubmit,
  subtotalCents,
  lines,
  lang,
}: {
  formRef: React.RefObject<HTMLFormElement | null>;
  name: string;
  phone: string;
  address: string;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onAddress: (value: string) => void;
  redeem: boolean;
  canRedeem: boolean;
  onRedeem: (value: boolean) => void;
  banner: ErrorCode | null;
  fieldErrors: FieldErrors;
  fieldMessage: (field: FieldKey, key: string) => string;
  pending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  subtotalCents: number;
  lines: { product: CartProduct | null; qty: number; key: string }[];
  lang: 'en' | 'ar';
}) {
  const { t } = useI18n();

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,22rem)] lg:gap-14">
      {/* Details ---------------------------------------------------------- */}
      <div className="flex flex-col gap-6">
        <DemoNote />

        {banner ? <Banner code={banner} /> : null}

        <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <fieldset disabled={pending} className="flex flex-col gap-5 border-0 p-0">
            <legend className="text-h3 text-bone">{t.checkout.form.detailsTitle}</legend>

            <CheckoutField
              name="customerName"
              label={t.checkout.form.name.label}
              hint={t.checkout.form.name.hint}
              value={name}
              onChange={onName}
              autoComplete="name"
              error={
                fieldErrors.customerName
                  ? fieldMessage('customerName', fieldErrors.customerName)
                  : undefined
              }
            />

            <CheckoutField
              type="tel"
              inputMode="tel"
              name="customerPhone"
              label={t.checkout.form.phone.label}
              hint={t.checkout.form.phone.hint}
              value={phone}
              onChange={onPhone}
              autoComplete="tel"
              error={
                fieldErrors.customerPhone
                  ? fieldMessage('customerPhone', fieldErrors.customerPhone)
                  : undefined
              }
            />

            <CheckoutField
              as="textarea"
              name="customerAddress"
              label={t.checkout.form.address.label}
              hint={t.checkout.form.address.hint}
              value={address}
              onChange={onAddress}
              autoComplete="street-address"
              error={
                fieldErrors.customerAddress
                  ? fieldMessage('customerAddress', fieldErrors.customerAddress)
                  : undefined
              }
            />
          </fieldset>

          {canRedeem ? (
            <RewardToggle redeem={redeem} onRedeem={onRedeem} disabled={pending} />
          ) : null}

          <EmberAction type="submit" data-checkout-submit disabled={pending} className="w-full">
            {pending ? t.checkout.form.working : t.checkout.form.submit}
          </EmberAction>
        </form>
      </div>

      {/* Summary (provisional) -------------------------------------------- */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div
          className="border border-ash-400 bg-ash-200/70 p-6"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          <h2 className="text-h3 text-bone">{t.checkout.summary.title}</h2>

          <ul className="mt-4 divide-y divide-ash-400 border-y border-ash-400">
            {lines.map((line) => (
              <LineRow
                key={line.key}
                name={line.product ? (lang === 'ar' ? line.product.name_ar : line.product.name_en) : null}
                imagePath={line.product?.image_path ?? null}
                unitPriceCents={line.product?.price_cents ?? 0}
                qty={line.qty}
                eachLabel={t.checkout.summary.each}
                currency={t.menu.currency}
              />
            ))}
          </ul>

          <div className="mt-5">
            <TotalRow
              label={t.checkout.summary.subtotal}
              cents={subtotalCents}
              currency={t.menu.currency}
              emphasis
            />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-ash-700">
            {t.checkout.summary.provisional}
          </p>
        </div>
      </aside>
    </div>
  );
}

/** The redeem affordance — a real switch. The 5-dot meter is part 12. */
function RewardToggle({
  redeem,
  onRedeem,
  disabled,
}: {
  redeem: boolean;
  onRedeem: (value: boolean) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className="flex items-start gap-4 border border-ember/30 bg-ember/5 p-5"
      style={{ borderRadius: 'var(--radius-card)' }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-bone">{t.checkout.reward.available}</p>
        <p className="mt-1 text-xs leading-relaxed text-ash-700">{t.checkout.reward.note}</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={redeem}
        aria-label={t.checkout.a11y.rewardToggle}
        disabled={disabled}
        onClick={() => onRedeem(!redeem)}
        className={`relative mt-0.5 grid h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
          redeem ? 'border-ember bg-ember/30' : 'border-ash-500 bg-ash-100'
        }`}
      >
        <span
          className={`block size-5 rounded-full transition-transform duration-200 ${
            redeem ? 'translate-x-6 bg-ember rtl:-translate-x-6' : 'translate-x-1 bg-ash-600 rtl:-translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

/* ========================================================================== *
 * Phase: review — the SERVER's numbers, and the confirm step.
 * ========================================================================== */

function Review({
  summary,
  bySlug,
  banner,
  pending,
  onConfirm,
  onEdit,
}: {
  summary: OrderSummary;
  bySlug: Map<string, CartProduct>;
  banner: ErrorCode | null;
  pending: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const { t, lang } = useI18n();

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,22rem)] lg:gap-14">
      {/* Left: what and where -------------------------------------------- */}
      <div className="flex flex-col gap-6">
        <DemoNote />
        {banner ? <Banner code={banner} /> : null}

        <div>
          <h2 className="text-h3 text-bone">{t.checkout.review.title}</h2>
          <p className="measure mt-2 text-sm leading-relaxed text-ash-700">
            {t.checkout.review.body}
          </p>
        </div>

        <div
          className="border border-ash-400 bg-ash-200/70 p-6"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          <h3 className="eyebrow text-ash-700">{t.checkout.review.to}</h3>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ash-700">{t.checkout.form.name.label}</dt>
              <dd className="min-w-0 break-words text-bone">{summary.customerName}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ash-700">{t.checkout.form.phone.label}</dt>
              <dd className="num min-w-0 break-words text-bone">{summary.customerPhone}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ash-700">{t.checkout.form.address.label}</dt>
              <dd className="min-w-0 break-words text-bone">{summary.customerAddress}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            className="h-12 border border-ash-500 px-6 text-sm font-semibold text-bone transition-colors duration-200 hover:border-ember hover:text-ember disabled:cursor-not-allowed disabled:text-ash-600 disabled:hover:border-ash-500 sm:h-auto sm:py-4"
            style={{ borderRadius: 'var(--radius-sharp)' }}
          >
            {t.checkout.review.edit}
          </button>
          <EmberAction
            type="button"
            data-checkout-confirm
            onClick={onConfirm}
            disabled={pending}
            className="flex-1"
          >
            {pending ? t.checkout.review.working : t.checkout.review.confirm}
          </EmberAction>
        </div>
      </div>

      {/* Right: the priced summary --------------------------------------- */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <OrderSummaryCard summary={summary} bySlug={bySlug} lang={lang} priced />
      </aside>
    </div>
  );
}

/** The server order rendered as a receipt. Reused by review and done. */
function OrderSummaryCard({
  summary,
  bySlug,
  lang,
  priced = false,
}: {
  summary: OrderSummary;
  bySlug: Map<string, CartProduct>;
  lang: 'en' | 'ar';
  priced?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div
      className="border border-ash-400 bg-ash-200/70 p-6"
      style={{ borderRadius: 'var(--radius-card)' }}
    >
      <h2 className="text-h3 text-bone">{t.checkout.summary.title}</h2>

      <ul className="mt-4 divide-y divide-ash-400 border-y border-ash-400">
        {summary.items.map((item: OrderLine) => {
          const product = bySlug.get(item.slug);
          return (
            <LineRow
              key={item.productId}
              name={product ? (lang === 'ar' ? product.name_ar : product.name_en) : item.slug}
              imagePath={product?.image_path ?? null}
              unitPriceCents={item.unitPriceCents}
              qty={item.qty}
              eachLabel={t.checkout.summary.each}
              currency={t.menu.currency}
            />
          );
        })}
      </ul>

      <div className="mt-5 flex flex-col gap-2.5">
        <TotalRow
          label={t.checkout.summary.subtotal}
          cents={summary.subtotalCents}
          currency={t.menu.currency}
        />
        {summary.rewardApplied && summary.discountCents > 0 ? (
          <TotalRow
            label={t.checkout.summary.discount}
            cents={summary.discountCents}
            currency={t.menu.currency}
            negative
          />
        ) : null}
        <div className="mt-1 border-t border-ash-400 pt-3">
          <TotalRow
            label={t.checkout.summary.total}
            cents={summary.totalCents}
            currency={t.menu.currency}
            emphasis
          />
        </div>
      </div>

      {priced ? (
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ash-700">
          <span aria-hidden className="mt-1.5 block size-1.5 shrink-0 rounded-full bg-ember" />
          {t.checkout.summary.priced}
        </p>
      ) : null}
    </div>
  );
}

/* ========================================================================== *
 * Phase: done — confirmed. Cart already cleared by the caller.
 * ========================================================================== */

function Done({
  summary,
  bySlug,
}: {
  summary: OrderSummary;
  bySlug: Map<string, CartProduct>;
}) {
  const { t, lang } = useI18n();
  const ref = `#${summary.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,22rem)] lg:gap-14">
      <div className="flex flex-col gap-6">
        <span className="relative grid size-16 place-items-center">
          <span aria-hidden className="ember-glow absolute inset-0 opacity-40" />
          <span
            aria-hidden
            className="relative grid size-16 place-items-center rounded-full border border-ember text-ember"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 12.5 10 17.5 19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>

        <div>
          <p className="eyebrow text-ember">{t.checkout.done.eyebrow}</p>
          <h2 className="display mt-3 text-h2 text-bone">{t.checkout.done.title}</h2>
          <p className="measure mt-4 text-lead text-ash-700">{t.checkout.done.body}</p>
        </div>

        <p className="flex items-baseline gap-2 text-sm text-ash-700">
          <span>{t.checkout.done.orderRef}</span>
          <span className="num font-semibold tracking-[0.08em] text-bone">{ref}</span>
        </p>

        {summary.rewardApplied ? (
          <p
            className="inline-flex items-center gap-2 self-start border border-ember/40 bg-ember/10 px-3 py-1.5 text-xs font-semibold text-ember"
            style={{ borderRadius: 'var(--radius-sharp)' }}
          >
            <span aria-hidden className="block size-1.5 rounded-full bg-ember" />
            {t.checkout.done.rewardApplied}
          </p>
        ) : null}

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <EmberButton href="/account" className="flex-1 justify-center">
            {t.checkout.done.account}
          </EmberButton>
          <Link
            href="/menu"
            className="grid h-12 place-items-center border border-ash-500 px-6 text-sm font-semibold text-bone transition-colors duration-200 hover:border-ember hover:text-ember sm:h-auto sm:py-4"
            style={{ borderRadius: 'var(--radius-sharp)' }}
          >
            {t.checkout.done.menu}
          </Link>
        </div>
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start">
        <OrderSummaryCard summary={summary} bySlug={bySlug} lang={lang} />
      </aside>
    </div>
  );
}

/* ========================================================================== *
 * The non-form states.
 * ========================================================================== */

/** localStorage not read yet — the cart is unknown for one frame. */
function Loading() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-40 items-center justify-center">
      <p className="flex items-center gap-3 text-sm text-ash-700">
        <span aria-hidden className="ember-tick block h-4 w-0.5 bg-ember" />
        {t.checkout.states.loading}
      </p>
    </div>
  );
}

function StateCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center gap-6 border border-dashed border-ash-500 bg-ash-100/40 px-6 py-16 text-center"
      style={{ borderRadius: 'var(--radius-card)' }}
    >
      <span aria-hidden className="grid size-14 place-items-center rounded-full border border-ash-500">
        <span className="block size-2.5 rounded-full border border-ash-600 bg-ink" />
      </span>
      <div>
        <h2 className="display text-h3 text-bone">{title}</h2>
        <p className="measure mx-auto mt-3 text-sm leading-relaxed text-ash-700">{body}</p>
      </div>
      {children}
    </div>
  );
}

function EmptyOrder() {
  const { t } = useI18n();
  return (
    <StateCard title={t.checkout.states.empty.title} body={t.checkout.states.empty.body}>
      <EmberButton href="/menu">{t.checkout.states.empty.cta}</EmberButton>
    </StateCard>
  );
}

function Offline() {
  const { t } = useI18n();
  return (
    <StateCard title={t.checkout.states.offline.title} body={t.checkout.states.offline.body}>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="border border-ash-500 px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-bone transition-colors duration-200 hover:border-ember hover:text-ember"
        style={{ borderRadius: 'var(--radius-sharp)' }}
      >
        {t.checkout.states.offline.cta}
      </button>
    </StateCard>
  );
}

function Blocked({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <StateCard title={t.checkout.states.blocked.title} body={t.checkout.states.blocked.body}>
      <button
        type="button"
        onClick={onOpen}
        className="border border-ash-500 px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-bone transition-colors duration-200 hover:border-ember hover:text-ember"
        style={{ borderRadius: 'var(--radius-sharp)' }}
      >
        {t.checkout.states.blocked.cta}
      </button>
    </StateCard>
  );
}
