import { RouteIntro } from '@/components/ui/RouteIntro';
import { Blend } from '@/components/sections/Blend';
import { Grind } from '@/components/sections/Grind';
import { routeMetadata } from '@/i18n/server';

export const generateMetadata = () => routeMetadata('spices');

/**
 * /spices — the rub, and the rule about grinding it.
 *
 * The stage states the claim ("nine grinders, one blend"); the wheel proves it,
 * by weight; the grind explains why the whole thing is thrown away every Sunday.
 * Three beats, loud → loudest → quiet.
 */
export default function SpicesPage() {
  return (
    <>
      <RouteIntro section="spices" />
      <Blend />
      <Grind />
    </>
  );
}
