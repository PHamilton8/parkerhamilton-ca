export const projectTags = [
  'Research & Behaviour',
  'Financial Decision-Making',
  'Design & Experience',
  'Digital Strategy',
  'Automation & Workflow',
  'Modelling & Analysis',
  'Build & Systems',
] as const;

export type ProjectTag = (typeof projectTags)[number];

export type Project = {
  number: string;
  slug: string;
  route: `/work/${string}`;
  title: string;
  kicker: string;
  premise: string;
  tags: ProjectTag[];
  featured: boolean;
  /** Set false when a dedicated src/pages/work/<slug>.astro page replaces the shared shell. */
  usesSharedShell: boolean;
  mediaKind:
    | 'thesis'
    | 'design-day'
    | 'askwill'
    | 'grocery'
    | 'reporting'
    | 'smith'
    | 'coast';
};

export const projects: Project[] = [
  {
    number: '01',
    slug: 'compound-growth',
    route: '/work/compound-growth',
    title: 'Line Graphs, Compound Growth & Retirement Judgments',
    kicker: 'MSc Thesis',
    premise: 'Can identical financial projections produce different judgments depending on how they are shown?',
    tags: ['Research & Behaviour', 'Financial Decision-Making', 'Modelling & Analysis'],
    featured: true,
    usesSharedShell: true,
    mediaKind: 'thesis',
  },
  {
    number: '02',
    slug: 'design-day',
    route: '/work/design-day',
    title: 'Interactive light-based musical instrument',
    kicker: 'Design Day',
    premise: 'An accessibility-oriented physical prototype built through interdisciplinary collaboration and informally tested with users.',
    tags: ['Research & Behaviour', 'Design & Experience', 'Build & Systems'],
    featured: true,
    usesSharedShell: true,
    mediaKind: 'design-day',
  },
  {
    number: '03',
    slug: 'askwill',
    route: '/work/askwill',
    title: "Rebuilding AskWill's digital presence",
    kicker: 'AskWill Water Technology',
    premise: 'Strategy, information architecture, copy, SEO, QA, and a maintainable static rebuild for a family-run service business.',
    tags: ['Digital Strategy', 'Design & Experience', 'Build & Systems'],
    featured: true,
    usesSharedShell: true,
    mediaKind: 'askwill',
  },
  {
    number: '04',
    slug: 'grocery-automation',
    route: '/work/grocery-automation',
    title: 'Grocery Automation',
    kicker: 'Automation',
    premise: 'Live flyer data, planning rules, structured AI output, and Excel generation for more varied, sale-aware weekly planning.',
    tags: ['Automation & Workflow', 'Build & Systems'],
    featured: false,
    usesSharedShell: true,
    mediaKind: 'grocery',
  },
  {
    number: '05',
    slug: 'reporting-workflow',
    route: '/work/reporting-workflow',
    title: 'Reporting Workflow Automation',
    kicker: 'Workflow redesign',
    premise: 'An Excel/VBA workflow redesign that reduced a recurring reporting process from 45+ minutes to under 10.',
    tags: ['Automation & Workflow', 'Build & Systems'],
    featured: false,
    usesSharedShell: true,
    mediaKind: 'reporting',
  },
  {
    number: '06',
    slug: 'smith-manoeuvre',
    route: '/work/smith-manoeuvre',
    title: 'Smith Manoeuvre Model',
    kicker: 'Decision support',
    premise: 'A scenario model comparing leveraged and non-leveraged paths across debt, investment, account, and tax assumptions.',
    tags: ['Financial Decision-Making', 'Modelling & Analysis', 'Build & Systems'],
    featured: false,
    usesSharedShell: true,
    mediaKind: 'smith',
  },
  {
    number: '07',
    slug: 'coast-fi',
    route: '/work/coast-fi',
    title: 'Coast FI / Net Worth Calculator',
    kicker: 'Long-horizon modelling',
    premise: 'A planning model connecting contributions, account allocation, investment growth, Coast FI, and retirement projections.',
    tags: ['Financial Decision-Making', 'Modelling & Analysis', 'Build & Systems'],
    featured: false,
    usesSharedShell: true,
    mediaKind: 'coast',
  },
];

export const featuredProjects = projects.filter((project) => project.featured);
export const secondaryProjects = projects.filter((project) => !project.featured);
