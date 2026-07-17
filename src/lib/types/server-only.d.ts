/**
 * Type declaration for the `server-only` marker module.
 *
 * `server-only` is not in `package.json` — it does not need to be. Next.js aliases
 * the specifier internally: in a Server Component graph it resolves to an empty
 * module, and in a Client Component graph it resolves to a module that throws at
 * BUILD time. That is exactly the guarantee we want — importing a server module
 * into a client component becomes a failed build, not a runtime secret leak.
 *
 * TypeScript does not know about that alias, so it needs this declaration to
 * resolve the bare side-effect import. Without it, `import 'server-only'` is a
 * TS2307 "cannot find module".
 */
declare module 'server-only';
