import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Anton, Archivo, Cairo, IBM_Plex_Sans_Arabic } from 'next/font/google';

import './globals.css';

import { brand } from '@/lib/brand';
import { DEFAULT_LANG, LANG_COOKIE, dictionaries, dirFor, isLang, type Lang } from '@/i18n';
import { getProducts } from '@/lib/server/products';
import { getCurrentUser } from '@/lib/supabase/server';
import { I18nProvider } from '@/components/providers/I18nProvider';
import { LoaderProvider } from '@/components/providers/LoaderProvider';
import { SmoothScrollProvider } from '@/components/providers/SmoothScrollProvider';
import { CartProvider, type CartProduct } from '@/components/cart/CartProvider';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { LoyaltyPanel } from '@/components/loyalty/LoyaltyPanel';
import { Footer } from '@/components/chrome/Footer';
import { Loader } from '@/components/chrome/Loader';
import { Nav } from '@/components/chrome/Nav';
import { SkipLink } from '@/components/chrome/SkipLink';

/* --- Latin ---------------------------------------------------------------- */

/** Display. Ultra-condensed, one weight, built to be set enormous. */
const displayLatin = Anton({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display-latin',
});

/** Body. A grotesque with a spine — deliberately not the default UI sans. */
const bodyLatin = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body-latin',
});

/* --- Arabic ---------------------------------------------------------------
 * A Latin face must never render Arabic. These are not fallbacks; they are the
 * Arabic typeface pairing, chosen to carry the same weight and voice as Anton /
 * Archivo do in Latin. `globals.css` swaps --font-display and --font-body to
 * these under [lang='ar'], so no component ever has to know which it is in.
 * -------------------------------------------------------------------------- */

/** Display. Goes to 900 — the only Arabic face here that can hold a 200px headline. */
const displayArabic = Cairo({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-display-ar',
});

/** Body. Properly drawn Arabic text face; sets long paragraphs without fatigue. */
const bodyArabic = IBM_Plex_Sans_Arabic({
  weight: ['400', '500', '600', '700'],
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-body-ar',
});

async function readLang(): Promise<Lang> {
  const store = await cookies();
  const value = store.get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

/**
 * The catalogue the CART DRAWER renders against — not the menu grid's copy.
 *
 * The drawer lives in the root layout, because the cart button is in the nav and a
 * cart you can only open on one route is not a cart. But the drawer needs product
 * rows to draw a line (a name, a photograph, a price), and it holds only ids — so
 * the layout has to supply the catalogue.
 *
 * ## Why this one is CAUGHT and /menu's is not
 *
 * `getProducts()` throws on a database error, deliberately: an empty menu renders
 * as "we sell nothing" instead of "something is broken", and nobody investigates a
 * page that renders. On /menu that throw is exactly right — it hits the route's
 * error boundary and the user is told.
 *
 * In the ROOT LAYOUT the same throw would take down every route on the site,
 * including the home page, because the drawer could not be drawn. That is a wildly
 * disproportionate failure. So here it is caught, and `catalogOk: false` is passed
 * down instead — the drawer then renders "we cannot reach the kitchen", which is
 * true, rather than "your burgers were delisted", which would not be.
 *
 * The two states are different and the UI must not confuse them. See CartProvider.
 */
async function readCatalog(): Promise<{ products: CartProduct[]; catalogOk: boolean }> {
  try {
    const rows = await getProducts();

    // Projected down to the six columns the drawer draws with. Whatever shape is
    // handed to CartProvider is serialized into the RSC payload of EVERY route —
    // the home page, the spice wheel, the 404 — so shipping the full row would put
    // both languages' descriptions, the calories and the prep time on every page
    // load, for a drawer most visitors never open. See CartProduct.
    const products: CartProduct[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name_en: row.name_en,
      name_ar: row.name_ar,
      price_cents: row.price_cents,
      image_path: row.image_path,
    }));

    return { products, catalogOk: true };
  } catch {
    return { products: [], catalogOk: false };
  }
}

export const viewport: Viewport = {
  themeColor: '#0b0a09',
  colorScheme: 'dark',
};

export async function generateMetadata(): Promise<Metadata> {
  const lang = await readLang();
  const t = dictionaries[lang];
  const name = lang === 'ar' ? brand.nameAr : brand.name;

  return {
    title: {
      default: `${name} — ${t.meta.title}`,
      template: `%s — ${name}`,
    },
    description: t.meta.description,
    applicationName: name,
  };
}

/**
 * The motion gate.
 *
 * Runs before the body is parsed, so it lands before first paint — no flash.
 * It adds `html.motion` only when JS is alive AND the user has not asked for
 * reduced motion. Everything an entrance timeline reveals is hidden behind that
 * class in CSS, which means the failure mode of "the animation never ran" is a
 * fully visible page rather than a blank one. See globals.css.
 */
const MOTION_GATE = `(function(){try{if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.classList.add('motion');}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await readLang();
  const dir = dirFor(lang);
  const { products, catalogOk } = await readCatalog();

  // The nav's account button reflects this: signed in → "Account", signed out →
  // "Sign in". `getCurrentUser()` VERIFIES the JWT (never `getSession()`), and the
  // auth actions call `revalidatePath('/', 'layout')`, so this re-reads and the bar
  // flips the instant a sign-in or sign-out lands. It is a boolean only — no id, no
  // email, nothing a client component has any business holding in the chrome.
  const authed = (await getCurrentUser()) !== null;

  const fontVars = [
    displayLatin.variable,
    bodyLatin.variable,
    displayArabic.variable,
    bodyArabic.variable,
  ].join(' ');

  return (
    <html lang={lang} dir={dir} className={fontVars} suppressHydrationWarning>
      <body className="grain bg-ink text-bone antialiased">
        <script dangerouslySetInnerHTML={{ __html: MOTION_GATE }} />

        <I18nProvider initialLang={lang}>
          <LoaderProvider>
            <SmoothScrollProvider>
              {/* The cart is chrome, like the nav and the footer: it must survive a
                  route change, and its button is in a bar that is on every page. A
                  drawer mounted by /menu would vanish the moment you navigated to
                  /spices, taking the order with it. */}
              <CartProvider products={products} catalogOk={catalogOk}>
                <SkipLink />
                <Loader />
                <Nav authed={authed} />
                {children}
                {/* Section 10. It lives here rather than on the home page because a
                    footer is chrome: every route should end the same way, and the
                    nav already points at five that would otherwise stop dead.
                    Outside <main> (which template.tsx owns) — it is not the page's
                    main content, and a landmark says so. */}
                <Footer />
                {/* The drawer is a client component, so its loyalty meter is
                    rendered here on the server and passed in as a slot — the same
                    self-fetching LoyaltyPanel the account page uses, deduped by
                    cache() within a request. */}
                <CartDrawer loyaltyMeter={<LoyaltyPanel variant="drawer" />} />
              </CartProvider>
            </SmoothScrollProvider>
          </LoaderProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
