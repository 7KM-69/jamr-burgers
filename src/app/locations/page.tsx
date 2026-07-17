import { RouteIntro } from '@/components/ui/RouteIntro';
import { Locations } from '@/components/sections/Locations';
import { routeMetadata } from '@/i18n/server';

export const generateMetadata = () => routeMetadata('locations');

/**
 * The route and the home section are the SAME component, not two designs of one
 * idea. RouteStage carries the title here, so the section drops its own headline
 * and renders the plan and the index directly beneath it.
 */
export default function LocationsPage() {
  return (
    <>
      <RouteIntro section="locations" />
      <Locations variant="route" />
    </>
  );
}
