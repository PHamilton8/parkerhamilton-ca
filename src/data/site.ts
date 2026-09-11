export const site = {
  name: 'Parker Hamilton',
  origin: 'https://parkerhamilton.ca',
  defaultTitle: 'Parker Hamilton',
  titleTemplate: '%s — Parker Hamilton',
  description:
    'Most of my projects start with a research question or something I think could work better.',
  email: 'parkerhamilton5324@gmail.com',
  linkedinUrl: undefined as string | undefined,
  location: 'Ottawa, Canada',
  credential: 'MSc · Marketing Research & Behavioural Science',
  ogImage: '/assets/site/og-default.png',
} as const;

export const navigation = [
  { label: 'Work', href: '/#work' },
  { label: 'About', href: '/#about' },
  { label: 'Contact', href: '/#contact' },
] as const;
