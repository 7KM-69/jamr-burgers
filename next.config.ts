import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // The dev-tools badge floats over the bottom-start corner of every page — which
  // is exactly where the hero's "SCROLL" cue and the footer's type live. Every
  // screenshot in screenshots/ is shot against `next dev`, so the badge lands in
  // the evidence we review the design against. Off.
  devIndicators: false,

  images: {
    // All artwork in /public/art is authored by us as SVG (cut-out burger layers).
    // next/image refuses to optimise SVG unless explicitly allowed, so we allow it
    // and lock it down: no scripts, sandboxed, same-origin only.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
