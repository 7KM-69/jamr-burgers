import type { ErrorCode } from '@/lib/types/api';
import type { BunKey, OrderStatus, PattyKey, SpiceLevel } from '@/lib/types/db';

/**
 * English copy. This object is the *source of truth for the shape* of the
 * dictionary — `ar.ts` is typed against it, so a missing Arabic key is a
 * compile error, not a bug someone finds in production.
 *
 * Voice: short, punchy, imperative. Never marketing filler.
 */
export const en = {
  meta: {
    title: 'Charcoal-fired burgers',
    description:
      'Patties pressed onto white-hot coal the second the flame dies. Six burgers, five layers, no excuses.',
  },

  a11y: {
    skipToContent: 'Skip to content',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    cartWithCount: 'Cart, {count} items',
    /** Not a nicety: "Cart, 1 items" is the kind of seam a screen-reader user hears
     *  and a sighted reviewer never notices. Arabic needs the split too. */
    cartWithOne: 'Cart, 1 item',
    switchToArabic: 'التبديل إلى العربية',
    loading: 'Loading',
    primaryNav: 'Primary',
  },

  nav: {
    home: 'Home',
    menu: 'Menu',
    spices: 'Spices',
    locations: 'Locations',
    contact: 'Contact',
    account: 'Account',
    /** Shown in place of `account` when nobody is signed in — see Nav. */
    signIn: 'Sign in',
    cart: 'Cart',
    /** Label on the toggle = the language you would switch TO. */
    langToggle: 'ع',
  },

  loader: {
    line: 'Stoking the coals',
  },

  hero: {
    eyebrow: 'Charcoal-fired — Riyadh',
    // Rendered as separate mask-revealed lines, in order.
    headline: ['Born in', 'the embers'],
    lede: 'We press the patty the second the flame dies and the coal turns white. Ninety seconds later it is yours.',
    cta: 'Order hot',
    scroll: 'Scroll',
  },

  origin: {
    eyebrow: 'Origin',
    headline: ["We don't cook over flames.", 'We cook over what is left of them.'],
    body: [
      'Flame scorches. Embers cook. The difference is patience — waiting for the fire to collapse into coal, for the heat to go quiet and even and mean. That is the moment the patty goes down.',
      'No sauce to hide behind. Five layers, sourced inside a day’s drive, and a grill we refuse to rush.',
    ],
    signature: 'Jamr — the ember, the moment the flame lets go.',
  },

  experience: {
    eyebrow: 'The numbers',
    headline: 'Nothing to hide',
    stats: [
      { value: 520, suffix: '', label: 'Kcal', note: 'A full stack, weighed.' },
      { value: 38, suffix: 'g', label: 'Protein', note: 'Per patty, ungarnished.' },
      { value: 90, suffix: 's', label: 'On the coal', note: 'The only timer we keep.' },
      { value: 100, suffix: '%', label: 'Local beef', note: 'Inside a day’s drive.' },
    ],
  },

  stack: {
    eyebrow: 'The stack',
    headline: ['Five layers.', 'No passengers.'],
    /**
     * Oversized ghost word behind the burger — architecture, not copy.
     *
     * `null` means the language does not get one, and Arabic does not. This is not
     * a translation gap; it is a property of the script. The burger is opaque and
     * sits across the middle of the stage, so the word is always cut through its
     * centre. Latin survives that: S · T · A · C · K are five separate marks, and
     * occluding two of them still leaves three whole letters to read. Arabic is
     * cursive — «التركيب» is drawn as joined strokes, and cutting it through the
     * middle severs the joins and leaves fragments that resolve as nothing. In the
     * screenshot they read as a rendering fault, which is worse than an absence.
     *
     * Sizing it down does not help (the burger still crosses it); a shorter word
     * does not help (a shorter word is MORE covered, not less). The device itself
     * is script-specific. Arabic gets the composition without it — the glow, the
     * separation and the leader lines carry the section, and they carry it clean.
     *
     * Typed `string | null` here because Dictionary is `typeof en`.
     */
    ghost: 'Stack' as string | null,
    hint: 'Scroll to pull it apart',
    layers: {
      bun: { name: 'Bun', spec: 'Brioche. Buttered, face-down, forty seconds.' },
      lettuce: { name: 'Lettuce', spec: 'Iceberg heart. Ice bath, then shaken dry.' },
      tomato: { name: 'Tomato', spec: 'Vine-ripened. Cut thick or not at all.' },
      cheese: { name: 'Cheese', spec: 'Aged cheddar. Melted by the patty, never by a lamp.' },
      patty: { name: 'Patty', spec: 'Chuck and brisket. Ground at six in the morning.' },
    },
  },

  /**
   * /spices.
   *
   * The KEYS of `spices.spices` are a contract: `blend.ts` gives each one an angle
   * on the wheel and a share of the rub, and a key here without geometry there (or
   * the reverse, or a typo in either) is a COMPILE error rather than a spoke that
   * quietly points at nothing. Same arrangement as locations/branches.ts.
   */
  spices: {
    eyebrow: 'The blend',
    headline: ['Nine grinders.', 'One rub.'],
    lede: 'No secret recipe, because a secret would only be worth keeping if it were clever. It is not clever. It is nine things, weighed, and here they are.',
    /** The hub of the wheel. The rub has a name, and this is it. */
    hubName: 'The Nine',
    hubNote: 'Ground every Monday',
    /** Annotation under the wheel. It is a diagram, and it says so. */
    plan: 'By weight. Ratios, not grams — the batch size moves, the rub does not.',
    shareLabel: 'Share of the rub',
    spices: {
      pepper: {
        name: 'Black pepper',
        note: 'Cracked, never milled. Milled pepper is dust, and it tastes like dust.',
      },
      coriander: {
        name: 'Coriander',
        note: 'Toasted whole. It smells of citrus before it smells of spice.',
      },
      cumin: { name: 'Cumin', note: 'The floor of the blend. Everything else stands on it.' },
      paprika: { name: 'Paprika', note: 'Sweet, not smoked. The coal is already doing the smoke.' },
      fennel: { name: 'Fennel', note: 'Two seconds of anise, then it gets out of the way.' },
      sumac: { name: 'Sumac', note: 'The sour that cuts the fat. Nothing else in here can do that.' },
      cardamom: { name: 'Cardamom', note: 'Green pods, cracked wet. This is the Riyadh in the rub.' },
      chilli: { name: 'Chilli', note: 'Heat you meet on the third bite, never on the first.' },
      cinnamon: { name: 'Cinnamon', note: 'Six percent. Enough to notice, never enough to name.' },
    },
    grind: {
      eyebrow: 'The grind',
      headline: ['Ground Monday.', 'Gone by Sunday.'],
      body: [
        'A rub is not a pantry item. The volatile oils are the entire point of a spice, and they begin leaving the moment the seed is broken. A fortnight in a jar and you are rubbing sawdust onto good beef.',
        'So we grind on Monday, for the week, in the quantity the week will actually eat. Whatever is left on Sunday is not saved for the next one. That is not a virtue we invented — it is arithmetic.',
      ],
      signature: 'Nine grinders. One rub. Fifty-two batches a year.',
    },
  },

  /**
   * /menu — the grid, the cards, and the cart drawer.
   *
   * ## `bun`, `patty` and `heat` are DB KEYS, and this is where they become words
   *
   * `supabase/CONTRACT.md` §9.2: `products.bun`, `products.patty` and
   * `products.spice_level` come out of Postgres as KEYS (`smash_beef`, `pretzel`,
   * `2`), not as copy. Rendering `{product.bun}` would print `potato` — an English
   * word — into the Arabic UI, and nothing would fail: not the build, not the types,
   * not the tests. Only a reader.
   *
   * So the three maps below are `satisfies Record<BunKey | PattyKey | SpiceLevel, …>`
   * against the unions in `src/lib/types/db.ts`. That is the L5 move: if `db` ever
   * adds a sixth bun, this file stops compiling instead of quietly shipping a
   * half-translated menu. The `satisfies` (rather than an annotation) keeps the
   * literal key type, so `ar.ts` is still forced to translate every one of them.
   *
   * `name_en` / `name_ar` and `desc_en` / `desc_ar` are NOT here: they are already
   * bilingual in the row. Pick the column by locale; never translate a product name
   * in the dictionary, or the menu and the database will drift apart.
   */
  menu: {
    /** CONTRACT.md §10: currency is not stored. `design` picks the symbol. */
    currency: 'SAR',
    /**
     * The grid is ordered `price_cents asc, slug asc` — by the server, per
     * CONTRACT.md §1. The rank stamped on each card is therefore real information,
     * not decoration, and this line is what makes it legible. Same device as the
     * annotation under the locations plan and the spice wheel.
     */
    ladder: 'Ordered by price. The cheapest is not the least.',
    add: 'Add to order',

    /**
     * Confirmations. `added` takes the burger's name so the sentence says WHICH one
     * — with six cards on a grid, "Added to your order" alone leaves the user
     * checking the cart to find out what they just tapped.
     */
    toast: {
      dismiss: 'Dismiss',
      added: (name: string) => `${name} — in your order`,
      addedNote: 'Open the cart to change the count.',
    },
    /** The whole menu is delisted. Rare, and it must not look like a design with no data. */
    emptyTitle: 'Nothing on the grill',
    emptyBody: 'Every burger is off the menu right now. That is not normal — try again shortly.',

    /**
     * The menu could not be READ (error.tsx) — a different failure from the menu
     * being empty, and it gets different words. Reusing the 404's "Back to the fire"
     * for a retry button was the lazy version of this and it said the wrong thing:
     * the user is not lost, the kitchen is not answering.
     */
    error: {
      title: 'The kitchen is not answering.',
      body: 'We could not load the menu. The burgers are fine; the wire is not.',
      retry: 'Try again',
    },

    spec: {
      heat: 'Heat',
      prep: 'Prep',
      bun: 'Bun',
      patty: 'Patty',
      kcal: 'Kcal',
      protein: 'Protein',
    },
    unit: {
      min: 'min',
      gram: 'g',
    },

    bun: {
      potato: 'Potato',
      brioche: 'Brioche',
      sesame: 'Sesame',
      pretzel: 'Pretzel',
      sourdough: 'Sourdough',
    } satisfies Record<BunKey, string>,

    patty: {
      smash_beef: 'Smashed beef',
      beef: 'Beef',
      double_beef: 'Double beef',
      crispy_chicken: 'Crispy chicken',
      lamb: 'Lamb',
      halloumi_mushroom: 'Halloumi & mushroom',
    } satisfies Record<PattyKey, string>,

    heat: {
      0: 'None',
      1: 'Mild',
      2: 'Medium',
      3: 'Hot',
    } satisfies Record<SpiceLevel, string>,

    a11y: {
      add: 'Add {name} to your order',
      increase: 'One more {name}',
      decrease: 'One fewer {name}',
      remove: 'Remove {name} from your order',
      quantity: 'Quantity',
      /** The gauge is three glyphs; a screen reader gets the sentence instead. */
      heat: 'Heat: {label}, {level} of 3',
      openCart: 'Open your order',
    },

    cart: {
      title: 'Your order',
      close: 'Close',

      /**
       * The empty cart is an UNLIT COAL — the same hollow ring the locations plan
       * uses for the branch that has not opened yet. "Your cart is empty" states a
       * fact about a database; this states a fact about a fire.
       */
      empty: {
        title: 'The coal is unlit.',
        body: 'Nothing in your order yet. Six burgers, ninety seconds each.',
        cta: 'See the menu',
      },

      each: 'each',
      subtotal: 'Subtotal',
      /**
       * The number above this line was computed in the browser. CLAUDE.md forbids
       * the client from owning a price, so the UI says out loud which number is
       * real. `place_order` recomputes the subtotal from `products` and that one
       * wins — this label is the design honouring that, not apologising for it.
       */
      provisional: 'Provisional. The kitchen prices your order at checkout, and that price wins.',

      checkout: 'Checkout',
      /** Reinforces the guardrail at the point of departure. Full note is on /checkout. */
      demo: 'Demo — no real payment.',

      /** The DB CHECK caps a line at 20. The UI says so before the server has to. */
      maxed: 'Twenty is the limit for one burger.',

      /** A line whose product is no longer in the catalogue — delisted since it was added. */
      gone: 'Off the menu',
      goneBody: 'This one was taken off the grill. Remove it to carry on.',
      goneBlocks: 'Remove what is off the menu before you check out.',

      /**
       * The catalogue itself failed to load. NOT the same state as "this burger is
       * gone" — telling a user their order is delisted when the database is simply
       * unreachable is a lie the UI has no business telling.
       */
      offline: {
        title: 'We cannot reach the kitchen.',
        body: 'Your order is saved. Reload the page to price it.',
      },
    },
  },

  /** /contact. There is no form, and the page says so on purpose — see `noForm`. */
  contact: {
    eyebrow: 'Reach',
    headline: ['Say it straight.', 'A human replies.'],
    lede: 'No ticket number, no chatbot, no form that vanishes into a queue. Three ways in, and all of them are answered the same day.',
    channels: {
      call: { label: 'Call the pass', note: 'The phone sits by the grill. Someone near it is holding tongs.' },
      whatsapp: { label: 'WhatsApp', note: 'Fastest, if we are mid-service and the pass is loud.' },
      email: { label: 'Email', note: 'Press, supply, complaints. Complaints especially.' },
    },
    noForm: {
      title: 'Why there is no form',
      body: 'A contact form is a way of looking like you are listening. We would rather you simply had the number.',
    },
    hoursTitle: 'Hours',
    addressTitle: 'The flagship',
    /** Screen-reader context for a link that leaves the site. */
    opensWhatsApp: 'Opens WhatsApp',
  },

  locations: {
    eyebrow: 'Locations',
    headline: ['Four fires lit.', 'One more catching.'],
    lede: 'All of them Riyadh. All of them burning by noon.',
    /** Annotation under the schematic. It is a diagram, and it says so. */
    plan: 'Riyadh — schematic. Not to scale.',
    /** Column head above the hours in a branch row. */
    open: 'Open',
    /** Replaces the hours on a branch that has not lit yet. */
    soon: 'Lighting soon',
    /**
     * Branch copy. The KEYS are the contract — `branches.ts` positions a pin for
     * each one, and a key here without a pin there is a compile error.
     */
    branches: {
      olaya: {
        district: 'Al Olaya',
        street: 'Tahlia Street, opposite the water tower',
        hours: 'Noon — 2am, daily',
      },
      nakheel: {
        district: 'Al Nakheel',
        street: 'Al Takhassusi, behind the palms',
        hours: 'Noon — 2am, daily',
      },
      malqa: {
        district: 'Al Malqa',
        street: 'Al Thumamah Road, north of the ring',
        hours: 'Noon — 1am, daily',
      },
      qurtubah: {
        district: 'Qurtubah',
        street: 'Eastern Ring Road, exit 10',
        hours: 'Noon — 2am, daily',
      },
      diriyah: {
        district: 'Diriyah',
        street: 'Wadi Hanifah, at the mud wall',
        hours: 'Opens this autumn',
      },
    },
  },

  supply: {
    eyebrow: 'Farm to hand',
    headline: ['Four pairs of hands.', 'Then yours.'],
    lede: 'No warehouse, no middleman, no cold chain we cannot see the end of. Four stops between the field and your table — we can name every one.',
    steps: [
      {
        title: 'The herd',
        body: 'Najd pasture, three hours out. One farm, one breed. We never blend two.',
      },
      {
        title: 'The grind',
        body: 'Chuck and brisket, coarse, at six in the morning. Never the night before.',
      },
      {
        title: 'The coal',
        body: 'Hardwood, burned down in our own yard until it runs white and goes quiet.',
      },
      {
        title: 'The pass',
        body: 'Ninety seconds down. Thirty to build. Then it is out of our hands.',
      },
    ],
  },

  closing: {
    headline: ['The coal is', 'already white.'],
    lede: 'Six burgers. Ninety seconds each. Nothing here waits for long.',
    action: 'Order hot',
    note: 'Riyadh only. For now.',
  },

  footer: {
    /** The marquee band. Paired with the wordmark and repeated across the track. */
    marquee: 'Born in the embers',
    explore: 'Explore',
    yours: 'Yours',
    reach: 'Reach',
    signIn: 'Sign in',
    address: 'Al Olaya, Riyadh',
    hours: 'Noon — 2am, daily',
    /** `{brand}` and `{year}` are filled by format(). Never hardcode the name. */
    rights: '© {year} {brand}. All fire, no franchise.',
    backToTop: 'Back to the top',
  },

  /**
   * /auth — sign in and sign up.
   *
   * ## `errors` is keyed by the SERVER'S machine code, and it is exhaustive
   *
   * `src/lib/types/api.ts` returns an `ApiError` whose `message` is English,
   * developer-facing, and — its own comment says so — must never be rendered. What
   * the UI is given is a stable `code`. This map is where a code becomes a sentence
   * a human reads, in their own language.
   *
   * It `satisfies Record<ErrorCode, string>`, which is the point: it covers EVERY
   * member of the union, including the four order/loyalty codes that cannot reach an
   * auth form. That is not padding. `ErrorCode` is one union shared by every action
   * in the app, so when part 11 wires checkout it inherits a complete map instead of
   * discovering a hole in production — and if `api` ever adds a code, this file stops
   * compiling instead of quietly rendering an empty string where an explanation
   * should be. A blank error message is the most expensive kind of nothing.
   *
   * "Something went wrong" appears nowhere below, deliberately. A user who typed the
   * wrong password is owed that sentence, not a shrug.
   */
  auth: {
    eyebrow: 'The pass',

    /** Two headlines, because they are two different jobs. Mask-revealed lines. */
    headline: {
      signin: ['Back to', 'the coal'],
      signup: ['Start', 'the count'],
    },
    lede: {
      signin: 'Your orders and your rewards, where you left them.',
      signup:
        'One account, no card. Five confirmed orders and the sixth is half price — the kitchen keeps the count, not you.',
    },

    /** The three reasons an account is worth having. Stated flat, never sold. */
    promise: [
      {
        title: 'Ninety seconds',
        body: 'Your address is kept, so an order is a tap and a wait — not a form.',
      },
      {
        title: 'Five, then half',
        body: 'Every fifth confirmed order earns the next one at half price. Counted in the kitchen.',
      },
      {
        title: 'Nothing to steal',
        body: 'There is no payment here and there never will be. We hold an email and an address.',
      },
    ],

    mode: {
      signin: 'Sign in',
      signup: 'Create account',
    },

    field: {
      name: { label: 'Name', hint: 'Optional. What we call you at the pass.' },
      email: { label: 'Email' },
      password: { label: 'Password', hint: 'Eight characters, minimum.' },
    },

    submit: {
      signin: 'Sign in',
      signup: 'Create account',
      /** The button under load. It is disabled, and it says what it is doing. */
      working: 'One moment',
    },

    /** The other mode, offered rather than hidden. */
    switch: {
      toSignup: { question: 'No account yet?', action: 'Create one' },
      toSignin: { question: 'Already have one?', action: 'Sign in' },
    },

    /**
     * Shown in sign-up mode only, BEFORE the email is sent. The project has email
     * confirmation switched on (`mailer_autoconfirm: false`), so the account does
     * not work until a link is clicked, and a user should learn that from the form
     * rather than from a screen they did not expect.
     */
    confirmNote: 'We send one link to check the address is real. Click it, then sign in.',

    /** EMAIL_ALREADY_REGISTERED offers the way out instead of just refusing. */
    signInInstead: 'Sign in instead',

    /** The machine code → a sentence. Exhaustive over ErrorCode; see above. */
    errors: {
      VALIDATION_ERROR: 'Check the fields marked below.',
      UNAUTHENTICATED: 'Your session ran out. Sign in again.',
      INVALID_CREDENTIALS: 'That email and password do not match.',
      EMAIL_ALREADY_REGISTERED: 'This email already has an account.',
      EMAIL_NOT_CONFIRMED: 'This address was never confirmed. The link is in your inbox.',
      WEAK_PASSWORD: 'Too weak. Eight characters, and make them count.',
      RATE_LIMITED: 'Too many tries. Wait a minute, then go again.',
      NOT_FOUND: 'We cannot find that order.',
      PRODUCT_UNAVAILABLE: 'Something in your order came off the grill. Check the cart.',
      REWARD_UNAVAILABLE: 'That reward is already spent.',
      ORDER_NOT_PENDING: 'That order is closed.',
      INTERNAL: 'The kitchen is not answering. Try again shortly.',
    } satisfies Record<ErrorCode, string>,

    /**
     * Field-level messages, keyed by FIELD and then by the machine key Zod puts in
     * `message` (`src/lib/schemas.ts` — every message there is a key, never copy).
     *
     * Keyed by field and not only by code, because `TOO_SHORT` means "eight
     * characters" on a password and "two letters" on a name. One map keyed by code
     * alone would have to say something vague enough to be true of both, which is
     * how forms end up saying "invalid input".
     */
    fieldErrors: {
      email: {
        REQUIRED: 'We need an email address.',
        INVALID_EMAIL: 'That is not an email address.',
        TOO_LONG: 'That address is too long.',
      },
      password: {
        REQUIRED: 'We need a password.',
        TOO_SHORT: 'Eight characters, minimum.',
        TOO_LONG: 'Seventy-two characters is the ceiling.',
      },
      fullName: {
        TOO_SHORT: 'Two letters, minimum.',
        TOO_LONG: 'Eighty characters is the ceiling.',
      },
      /** A key we have no sentence for. Never rendered blank. */
      fallback: 'Check this field.',
    },

    a11y: {
      modeGroup: 'Sign in, or create an account',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      /** The <h2> of the error banner. Screen readers get a heading, not a colour. */
      problem: 'There is a problem',
    },

    /**
     * The "check your inbox" screen — a ROUTE (`/auth/check`), not a toast.
     *
     * With confirmation on, sign-up hands back no session: the account exists and
     * cannot be used. That is a destination, not an error, and it survives a reload
     * because it has a URL.
     */
    check: {
      eyebrow: 'One more step',
      headline: ['Check your', 'inbox'],
      /** `{email}` is filled by format(). */
      body: 'We sent a link to {email}. Click it, and the account is lit.',
      /**
       * The same screen, reached from SIGN-IN instead: the account exists, the
       * address was never confirmed. Same instruction, different reason — and
       * telling someone "wrong password" here would be a lie.
       */
      fromSignin: 'This account exists, but the address was never confirmed.',
      /**
       * Clicking the link CONFIRMS the address. It does not sign anyone in — there
       * is no callback route to exchange the code for a session, so the browser
       * lands on the home page signed out. Say so. A promise of "you will be
       * signed in" that does not happen is worse than a plain instruction.
       */
      then: 'The link confirms the address. Come back here and sign in.',
      spam: 'Nothing yet? Look in spam, and check the address you typed.',
      back: 'Back to sign in',
    },
  },

  /** /account — the signed-in shell. */
  account: {
    eyebrow: 'Your account',
    headline: ['Your', 'pass'],
    lede: 'Everything we keep on you. Which is not much.',

    profile: {
      title: 'Who you are',
      name: 'Name',
      email: 'Email',
      since: 'With us since',
      /** `full_name` is nullable — email + password sign-up may carry no name. */
      noName: 'Not given',
    },

    signOut: {
      label: 'Sign out',
      working: 'Signing out',
      /** signOut returns an ApiError like anything else. It gets real copy too. */
      failed: 'We could not sign you out. Try again.',
    },

    orders: {
      title: 'Your orders',
      /**
       * The true state of every account today: `place_order` has no caller until
       * part 11, so nobody has an order. This is the honest empty state, and it
       * stays correct for a genuinely new account once checkout exists.
       */
      empty: {
        title: 'Nothing on the fire.',
        body: 'You have not ordered yet. Six burgers, ninety seconds each.',
        cta: 'See the menu',
      },
    },

    /**
     * Month names, because `Intl.DateTimeFormat('ar', …)` renders Arabic-Indic
     * digits (`١٤`) and CLAUDE.md keeps numerals Latin in BOTH languages. Exactly
     * the trap `src/components/menu/money.ts` documents for prices — same class of
     * silent failure, and it would again be invisible in the English screenshots.
     * So the date is assembled by hand from these, and the digits are Latin by
     * construction.
     */
    months: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ],

    /** For when order history lands (part 11/12). */
    status: {
      pending: 'Pending',
      confirmed: 'Confirmed',
      cancelled: 'Cancelled',
    } satisfies Record<OrderStatus, string>,
  },

  /**
   * The loyalty meter — part 12. Shown on /account (full) and in the cart drawer
   * (compact). It DISPLAYS the three numbers `getLoyaltyProgress()` returns; it
   * never computes eligibility or the discount. `{n}` placeholders are filled by
   * format() and stay Latin in both languages.
   *
   * ## The five coals
   *
   * The meter is five coals, one per confirmed order in the current cycle — lit
   * coals for the orders that landed, unlit rings for the ones still to come. The
   * denominator is always five; the numerator is `progressInCycle` (0–4), never a
   * number the client worked out. When the fifth lands the server resets the cycle
   * and hands back a reward, which is why "reward available" is its OWN field and
   * its own line here — a reward can be held while a fresh cycle is already filling.
   */
  loyalty: {
    eyebrow: 'Rewards',
    title: 'Five, then half',
    /** The rule, stated once. Never sold — the kitchen keeps the count, not you. */
    rule: 'Every fifth confirmed order earns the next one at half price. The kitchen keeps the count.',

    /**
     * The caption under the coals, by how many confirmed orders are still to come
     * in this cycle. `.one` when a single order stands between the diner and the
     * reward; `.many` for two or more.
     */
    remaining: {
      one: 'One more confirmed order, and the next is half price.',
      many: '{count} confirmed orders to your next half-price burger.',
    },

    /** Screen-reader label for the coal meter — a sentence, not five glyphs. */
    meterLabel: '{filled} of {total} confirmed orders this cycle',

    /**
     * The reward badge (availableRewards > 0). `.one` for a single held reward,
     * `.many` for the rare stack. The server applies it at checkout — the diner
     * never does the maths.
     */
    reward: {
      one: 'Your next order is half price.',
      many: 'You have {count} half-price orders waiting.',
      note: 'Applied at checkout. You never do the maths.',
      cta: 'Start an order',
    },

    /**
     * Signed out. The account page never reaches this (it redirects), but the cart
     * drawer is on every route and is opened by visitors who never signed in.
     */
    signedOut: {
      title: 'Start the count',
      body: 'Five confirmed orders, and the sixth is half price.',
      cta: 'Sign in',
    },
  },

  /**
   * /checkout — part 11. Collect name + phone + address, place a PENDING order,
   * confirm it. THERE IS NO PAYMENT and there never will be (CLAUDE.md §Payment).
   *
   * ## The numbers here are the SERVER'S, and the copy says so
   *
   * The form shows a PROVISIONAL summary from the cart. The moment `place_order`
   * returns, every number is replaced by the one Postgres computed from the
   * `products` table — subtotal, discount, total — and the review step renders those.
   * `summary.priced` is the line that tells the truth about which price is real.
   *
   * ## `errors` is the SERVER'S machine code → a sentence, exhaustive over ErrorCode
   *
   * `placeOrder` / `confirmOrder` return an `ApiError` whose `.message` is English and
   * dev-facing and must never be rendered. This map turns `.code` into copy. It
   * `satisfies Record<ErrorCode, string>` so a new code from `api` is a compile error
   * here, not a blank banner in production — the same discipline as `auth.errors`.
   */
  checkout: {
    eyebrow: 'The pass',
    /** One headline for the page — the stage reveals it once; the phase is told in the body. */
    headline: ['One step', 'from hot'],
    lede: 'Where it goes, and who to call when it is at the door. No card — there is nothing to pay.',

    /**
     * The hard guardrail made visible. CLAUDE.md forbids any payment provider and
     * requires a note so the build can never be mistaken for a real store.
     */
    demo: {
      label: 'Demo',
      body: 'A learning build. No card is taken, no money moves, and no burger is actually made.',
    },

    states: {
      /** localStorage has not been read yet — the cart is unknown for one frame. */
      loading: 'Reading your order…',
      /** Nothing to check out. Send them back to the grid. */
      empty: {
        title: 'Nothing to check out.',
        body: 'Your order is empty. Pick a burger first — ninety seconds each.',
        cta: 'See the menu',
      },
      /** The catalogue could not be loaded, so nothing can be priced. Not "delisted". */
      offline: {
        title: 'We cannot reach the kitchen.',
        body: 'Your order is saved. Reload the page to price it and check out.',
        cta: 'Reload',
      },
      /** A line in the cart was delisted. `place_order` would reject the whole order,
       *  so we stop before submit and say which. */
      blocked: {
        title: 'One thing came off the grill.',
        body: 'Something in your order is no longer on the menu. Open your order and remove it to carry on.',
        cta: 'Open your order',
      },
    },

    form: {
      detailsTitle: 'Where it goes',
      name: { label: 'Name', hint: 'Who we ask for at the door.' },
      phone: { label: 'Phone', hint: 'So the rider can reach you.' },
      address: { label: 'Address', hint: 'Street, building, and the floor.' },
      submit: 'Review order',
      /** The button under load. It is disabled, and it says what it is doing. */
      working: 'Pricing your order',
    },

    /**
     * The reward is OFFERED here; the server DECIDES. The UI shows whether one is
     * available (read from `getLoyaltyProgress()` server-side) and lets the user
     * apply it — it never computes the discount. If the server answers
     * REWARD_UNAVAILABLE the UI was stale, and it says so. The 5-dot progress meter
     * itself is part 12; this is only the redeem affordance.
     */
    reward: {
      title: 'Your reward',
      available: 'You have a half-off reward.',
      apply: 'Use it on this order',
      note: 'Half off this order’s subtotal. The kitchen applies it — you never do the maths.',
      /** After REWARD_UNAVAILABLE: the reward was spent elsewhere; we took it off. */
      revoked: 'That reward is already spent. We took it off — your order still stands.',
    },

    summary: {
      title: 'Your order',
      /** The form-phase total is computed in the browser; this says which one is real. */
      provisional: 'Provisional. The kitchen prices your order when you review it, and that price wins.',
      each: 'each',
      subtotal: 'Subtotal',
      /** The discount line, shown only when a reward was applied. */
      discount: 'Reward',
      total: 'Total',
      /** Under the total on the review step: these are the server’s numbers now. */
      priced: 'Priced by the kitchen, from the live menu.',
    },

    review: {
      title: 'Confirm your order',
      body: 'This is what the kitchen will make and what it will cost. Nothing is charged.',
      /** Header above the customer details on the review card. */
      to: 'Delivering to',
      edit: 'Change details',
      confirm: 'Confirm order',
      /** The confirm button under load. */
      working: 'Sending to the pass',
    },

    done: {
      eyebrow: 'Confirmed',
      title: 'On the fire.',
      body: 'Your order is in. We are already on it — ninety seconds a burger.',
      /** Shown only when a reward was spent on this order. */
      rewardApplied: 'Half-off reward applied.',
      /** Label before the short order reference. */
      orderRef: 'Order',
      account: 'See your orders',
      menu: 'Order again',
    },

    a11y: {
      /** The reward apply control is a real switch; it gets a name, not just a colour. */
      rewardToggle: 'Apply your half-off reward to this order',
      /** The banner heading a screen reader hears instead of a red border. */
      problem: 'There is a problem',
    },

    /** Machine code → a sentence. Exhaustive over ErrorCode; never rendered raw. */
    errors: {
      VALIDATION_ERROR: 'Check the fields marked below.',
      UNAUTHENTICATED: 'Your session ran out. Sign in and try again.',
      INVALID_CREDENTIALS: 'That email and password do not match.',
      EMAIL_ALREADY_REGISTERED: 'This email already has an account.',
      EMAIL_NOT_CONFIRMED: 'Confirm your email before you order.',
      WEAK_PASSWORD: 'That password is too weak.',
      RATE_LIMITED: 'Too many tries. Wait a minute, then go again.',
      NOT_FOUND: 'We cannot find that order.',
      PRODUCT_UNAVAILABLE: 'Something in your order came off the grill. Check your order below.',
      REWARD_UNAVAILABLE: 'That reward is already spent. We took it off — your order stands.',
      ORDER_NOT_PENDING: 'This order is already closed.',
      INTERNAL: 'The kitchen is not answering. Try again shortly.',
    } satisfies Record<ErrorCode, string>,

    /**
     * Field-level messages, keyed by FIELD then by the machine key Zod puts in
     * `message` (`src/lib/schemas.ts`). Keyed by field, not code alone, because
     * TOO_LONG means "eighty characters" on a name and "three hundred" on an address.
     */
    fieldErrors: {
      customerName: {
        REQUIRED: 'We need a name.',
        TOO_LONG: 'Eighty characters is the ceiling.',
      },
      customerPhone: {
        TOO_SHORT: 'That number is too short.',
        TOO_LONG: 'Thirty-two characters is the ceiling.',
        INVALID_PHONE: 'Digits, spaces and + ( ) - only.',
      },
      customerAddress: {
        REQUIRED: 'We need an address.',
        TOO_LONG: 'Three hundred characters is the ceiling.',
      },
      /** A key we have no sentence for. Never rendered blank. */
      fallback: 'Check this field.',
    },
  },

  routes: {
    menu: {
      title: 'The menu',
      lede: 'Six burgers. No specials, no seasonal excuses.',
    },
    spices: {
      title: 'Spices',
      lede: 'Nine grinders, one blend, ground every week.',
    },
    locations: {
      title: 'Locations',
      lede: 'Follow the smoke.',
    },
    contact: {
      title: 'Contact',
      lede: 'Say it straight. We answer the same day.',
    },
    account: {
      title: 'Account',
      lede: 'Your orders. Your rewards.',
    },
    auth: {
      title: 'Sign in',
      lede: 'Five orders in, the sixth is half price.',
    },
    checkout: {
      title: 'Checkout',
      lede: 'Name, address, done. No card — nothing to pay.',
    },
    notFound: {
      eyebrow: 'Page not found',
      title: '404',
      lede: 'This one burned. Nothing left at that address.',
      cta: 'Back to the fire',
    },
  },
};

/**
 * The shape every dictionary must satisfy.
 *
 * Deliberately NOT `typeof (en as const)`: a const assertion would freeze every
 * value to its English string literal, and `ar.ts` could then only type-check by
 * being written in English. Widened types are the point here.
 */
export type Dictionary = typeof en;
