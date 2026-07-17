import Image from 'next/image';
import { BURGER_LAYERS } from './layers';

/**
 * The burger, assembled. Every layer is the same 1000x800 canvas with the
 * ingredient drawn at its resting position and transparency everywhere else, so
 * six absolutely-positioned copies at inset-0 compose into a whole burger with
 * no offset maths — and pulling them apart is a pure `yPercent` on each, which
 * is a transform, which is free.
 *
 * The hero renders this whole. The showcase renders the same instance and takes
 * it apart. That is deliberate: it must read as *the* burger coming apart, not
 * as a diagram of a different one.
 */
export function BurgerStack({
  label,
  sizes,
  priority = false,
  className = '',
}: {
  /** Describes the burger for assistive tech; the layers themselves are decorative. */
  label: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      data-burger-stack
      className={`relative aspect-[1000/800] w-full ${className}`}
    >
      {BURGER_LAYERS.map((layer, index) => (
        <div
          key={layer.key}
          data-layer={layer.key}
          className="absolute inset-0 will-change-transform"
          style={{ zIndex: index + 1 }}
        >
          <Image
            src={layer.src}
            alt=""
            aria-hidden
            fill
            sizes={sizes}
            priority={priority}
            className="object-contain"
          />
        </div>
      ))}
    </div>
  );
}
