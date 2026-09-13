export const QA_PROFILE = process.env.QA_AUTHORITY_PROFILE ?? 'baseline';

export const publicRoutes = [
  '/',
  '/work/design-day',
  '/work/reporting-workflow',
  '/work/grocery-automation',
  '/work/askwill',
  '/work/coast-fi',
  '/work/compound-growth',
  '/work/smith-manoeuvre',
] as const;

export type AuthoritySurface = 'home' | 'reporting' | 'coast' | 'compound';

const profileSurfaces: Record<string, ReadonlySet<AuthoritySurface>> = {
  baseline: new Set(),
  'homepage-v3': new Set(['home']),
  'reporting-v3': new Set(['reporting']),
  'final-rc': new Set(['home', 'reporting', 'coast', 'compound']),
};

export function requiresAuthority(surface: AuthoritySurface): boolean {
  return (profileSurfaces[QA_PROFILE] ?? profileSurfaces.baseline).has(surface);
}

export const routeAuthority = {
  '/': { visual: 'conditional', note: 'Cathedral, Compound media, More Work assets locked; full Homepage V3 required only in homepage-v3/final-rc profiles.' },
  '/work/design-day': { visual: 'deferred', note: 'Option C remains owner-review pending; human audio listen remains a manual release gate.' },
  '/work/reporting-workflow': { visual: 'conditional', note: 'V3 owner approved; required only in reporting-v3/final-rc profiles.' },
  '/work/grocery-automation': { visual: 'deferred', note: 'V2 visual candidate still owner-review pending; generic safety/accessibility only.' },
  '/work/askwill': { visual: 'deferred', note: 'V2 visual candidate still owner-review pending; generic safety/accessibility only.' },
  '/work/coast-fi': { visual: 'conditional', note: 'Existing graph is locked unchanged; Coast-by-age default/reset required in final-rc.' },
  '/work/compound-growth': { visual: 'conditional', note: 'Canonical data/engine required; four-zone visual candidate remains owner-review pending.' },
  '/work/smith-manoeuvre': { visual: 'deferred', note: 'Engine/workbook locked; graph A/B/C and simplification visual remain unresolved.' },
} as const;
