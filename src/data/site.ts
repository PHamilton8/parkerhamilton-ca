export const site = {
  name: 'Parker Hamilton',
  origin: 'https://parkerhamilton.ca',
  defaultTitle: 'Parker Hamilton — Researcher who builds things',
  titleTemplate: '%s — Parker Hamilton',
  description:
    'A project-focused portfolio spanning behavioural research, digital strategy, automation, modelling, and practical problem solving.',
  email: 'parkerhamilton5324@gmail.com',
  linkedinUrl: undefined as string | undefined,
  location: 'Ottawa, Canada',
  credential: 'MSc · Marketing Research & Behavioural Science · University of Ottawa',
  ogImage: '/assets/site/og-default.png',
} as const;

export const navigation = [
  { label: 'Work', href: '/#work' },
  { label: 'About', href: '/#about' },
  { label: 'Contact', href: '/#contact' },
] as const;
