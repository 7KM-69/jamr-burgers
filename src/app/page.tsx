import { Hero } from '@/components/sections/Hero';
import { Origin } from '@/components/sections/Origin';
import { Experience } from '@/components/sections/Experience';
import { IngredientShowcase } from '@/components/sections/IngredientShowcase';
import { Locations } from '@/components/sections/Locations';
import { Supply } from '@/components/sections/Supply';
import { ClosingCta } from '@/components/sections/ClosingCta';

/**
 * The home page, in the order CLAUDE.md sets out. Section 10 — the animated
 * footer — is site chrome rather than a page section and lives in layout.tsx, so
 * that every route ends the same way instead of only this one.
 *
 * A server component: the sections are the client boundary, not the page.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <Origin />
      <Experience />
      <IngredientShowcase />
      <Locations />
      <Supply />
      <ClosingCta />
    </>
  );
}
