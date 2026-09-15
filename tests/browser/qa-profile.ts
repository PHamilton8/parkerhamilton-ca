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

export const auxiliaryNoindexRoutes = ['/wealthsimple-2026'] as const;
export const allHtmlRoutes = [...publicRoutes, ...auxiliaryNoindexRoutes] as const;

export type AuthoritySurface = 'home' | 'designDay' | 'reporting' | 'grocery' | 'askWill' | 'coast' | 'compound' | 'smith' | 'wealthsimple';

const profileSurfaces: Record<string, ReadonlySet<AuthoritySurface>> = {
  baseline: new Set(),
  'homepage-v3': new Set(['home']),
  'reporting-v3': new Set(['reporting']),
  'final-rc': new Set(['home', 'designDay', 'reporting', 'grocery', 'askWill', 'coast', 'compound', 'smith', 'wealthsimple']),
};

export function requiresAuthority(surface: AuthoritySurface): boolean {
  return (profileSurfaces[QA_PROFILE] ?? profileSurfaces.baseline).has(surface);
}

export const routeAuthority = {
  '/': { visual: 'final', note: 'Homepage V3 owner approved; final global white-email ContactBand is canonical.' },
  '/work/design-day': { visual: 'final', note: 'Final Minimal Crop layout and 8.475-second replacement demo approved; human audio gate is closed. VTT retiming is technical implementation work.' },
  '/work/reporting-workflow': { visual: 'final', note: 'V3 owner approved with four synchronized stages.' },
  '/work/grocery-automation': { visual: 'final', note: 'House Rules C and The workflow owner approved.' },
  '/work/askwill': { visual: 'final', note: 'Sep-14 Option B + Hosting C owner approved with authentic screenshots.' },
  '/work/coast-fi': { visual: 'final', note: 'Four-mode final interactive approved; graph/engine/workbook remain frozen.' },
  '/work/compound-growth': { visual: 'final', note: 'Five-experiment evidence frozen; final simulator uses monthly recurring contributions, $0 start, and 8% default.' },
  '/work/smith-manoeuvre': { visual: 'final', note: 'Simplified page approved; Graph A with Emerald ladder is the only final graph.' },
  '/wealthsimple-2026': { visual: 'final', note: 'Implemented noindex auxiliary application route; verbatim synchronized caption track remains a final-RC accessibility gate.' },
} as const;
