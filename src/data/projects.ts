export const projectTags = [
  'Behavioural Research',
  'Financial Decision-Making',
  'Product Design',
  'Automation',
  'Modelling',
  'Builds and Systems',
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
    title: 'Compound Growth & Retirement Investing',
    kicker: '',
    premise: 'Can identical financial projections produce different judgments depending on how they are shown?',
    tags: ['Behavioural Research', 'Financial Decision-Making', 'Modelling'],
    featured: true,
    usesSharedShell: false,
    mediaKind: 'thesis',
  },
  {
    number: '02',
    slug: 'design-day',
    route: '/work/design-day',
    title: 'Design Day 2023',
    kicker: '',
    premise: "Our team built a laser-powered musical instrument that won 1st place at uOttawa's Design Day 2023",
    tags: ['Behavioural Research', 'Product Design', 'Builds and Systems'],
    featured: true,
    usesSharedShell: false,
    mediaKind: 'design-day',
  },
  {
    number: '03',
    slug: 'askwill',
    route: '/work/askwill',
    title: 'Rebuilding AskWill.ca',
    kicker: '',
    premise: 'A full website rethink for a family-run water-service business, covering structure, content, SEO, privacy, and QA.',
    tags: ['Product Design', 'Builds and Systems'],
    featured: true,
    usesSharedShell: false,
    mediaKind: 'askwill',
  },
  {
    number: '04',
    slug: 'grocery-automation',
    route: '/work/grocery-automation',
    title: 'Grocery Automation',
    kicker: '',
    premise: 'To automate a recurring task at work, I built a Python workflow that turns weekly flyer data into menu options and grocery lists.',
    tags: ['Automation', 'Builds and Systems'],
    featured: false,
    usesSharedShell: false,
    mediaKind: 'grocery',
  },
  {
    number: '05',
    slug: 'reporting-workflow',
    route: '/work/reporting-workflow',
    title: 'Automating a Reporting Workflow',
    kicker: '',
    premise: 'An Excel/VBA workflow redesign that reduced a recurring reporting process from 45+ minutes to < 10.',
    tags: ['Automation', 'Builds and Systems'],
    featured: false,
    usesSharedShell: false,
    mediaKind: 'reporting',
  },
  {
    number: '06',
    slug: 'smith-manoeuvre',
    route: '/work/smith-manoeuvre',
    title: 'Smith Manoeuvre Model',
    kicker: '',
    premise: 'A calculator for comparing leveraged and non-leveraged investing outcomes under different debt, investment, and tax assumptions.',
    tags: ['Financial Decision-Making', 'Modelling', 'Builds and Systems'],
    featured: false,
    usesSharedShell: false,
    mediaKind: 'smith',
  },
  {
    number: '07',
    slug: 'coast-fi',
    route: '/work/coast-fi',
    title: 'Coast FI / Net Worth Calculator',
    kicker: '',
    premise: 'A planning model that connects today’s savings, future contributions, and investment growth to retirement targets.',
    tags: ['Financial Decision-Making', 'Modelling', 'Builds and Systems'],
    featured: false,
    usesSharedShell: false,
    mediaKind: 'coast',
  },
];

export const featuredProjects = projects.filter((project) => project.featured);
export const secondaryProjects = projects.filter((project) => !project.featured);
