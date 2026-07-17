import { RouteIntro } from '@/components/ui/RouteIntro';
import { Reach } from '@/components/sections/Reach';
import { routeMetadata } from '@/i18n/server';

export const generateMetadata = () => routeMetadata('contact');

/**
 * /contact — three channels that actually work, and no form.
 *
 * The form is missing on purpose and the page says so: there is no server action to
 * post one to, and a text box that silently eats what you type would be the least
 * honest thing on this site. See the note at the top of Reach.tsx.
 */
export default function ContactPage() {
  return (
    <>
      <RouteIntro section="contact" />
      <Reach />
    </>
  );
}
