import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const files = {
  hero: read('src/components/layout/HeroShell.astro'),
  home: read('src/pages/index.astro'),
  projects: read('src/data/projects.ts'),
  contact: read('src/components/layout/ContactBand.astro'),
  design: read('src/pages/work/design-day.astro'),
  reporting: read('src/pages/work/reporting-workflow.astro'),
  grocery: read('src/pages/work/grocery-automation.astro'),
  askwill: read('src/pages/work/askwill.astro'),
  coast: read('src/pages/work/coast-fi.astro'),
  coastUi: read('src/components/calculators/CoastFiCalculator.astro'),
  coastScript: read('src/scripts/coastFiCalculator.ts'),
  compound: read('src/pages/work/compound-growth.astro'),
  compoundFixed: read('src/components/compound-growth/FixedExperimentalRecreation.astro'),
  compoundEvidence: read('src/components/compound-growth/ResearchEvidenceInteractions.astro'),
  compoundExplorer: read('src/components/compound-growth/AnnualCompoundGrowthExplorer.astro'),
  smith: read('src/pages/work/smith-manoeuvre.astro'),
  smithUi: read('src/components/calculators/SmithManoeuvreCalculator.astro'),
};

function includesAll(corpus, phrases) {
  for (const phrase of phrases) assert.ok(corpus.includes(phrase), `Missing locked copy: ${phrase}`);
}

function excludesAll(corpus, phrases) {
  for (const phrase of phrases) assert.equal(corpus.includes(phrase), false, `Rejected/obsolete copy remains: ${phrase}`);
}

test('homepage copy lock is present and obsolete homepage copy is absent', () => {
  includesAll(files.hero + files.home + files.projects + files.contact, [
    'I like figuring things out.',
    'Most of my projects start with a research question or something I think could work better.',
    'MSc · Marketing Research & Behavioural Science',
    'Explore my work',
    'Selected work',
    'More work',
    'About me',
    'I like digging into problems, testing ideas, and building useful solutions. Some of my interests include consumer insights, behavioural science, financial decision-making, and automation.',
    'Have a question?',
    'Compound Growth & Retirement Investing',
    'Design Day 2023',
    'Rebuilding AskWill.ca',
    'Grocery Automation',
    'Automating a Reporting Workflow',
    'Smith Manoeuvre Model',
    'Coast FI / Net Worth Calculator',
  ]);
  includesAll(files.projects, [
    "Our team built a laser-powered musical instrument that won 1st place at uOttawa's Design Day 2023",
    'Behavioural Research', 'Financial Decision-Making', 'Product Design', 'Automation', 'Modelling', 'Builds and Systems',
    'usesSharedShell: false',
  ]);
  excludesAll(files.hero + files.home + files.projects, [
    'Researcher who builds things',
    'Smaller in the homepage hierarchy, not smaller in substance.',
    'Three projects where the research, the decisions, and the thing that got built are all visible.',
    'Line Graphs, Compound Growth & Retirement Judgments',
    "Rebuilding AskWill's digital presence",
    'Reporting Workflow Automation',
  ]);
});

test('Design Day copy lock is present', () => {
  includesAll(files.design, [
    'For Design Day 2023, we built our own take on a laser-powered musical instrument.',
    '1st place at Design Day 2023',
    'Where it started',
    'Working demo',
    'Here’s the prototype in action.',
    'Break the beam',
    'Building the prototype',
    'I’d be giving myself far too much credit if I pretended I was an electronics expert, but I was fortunate to have teammates who were.',
  ]);
  excludesAll(files.design, ['Informal testing', 'Use the player controls']);
});

test('Reporting Workflow copy lock is present', () => {
  includesAll(files.reporting, [
    'Excel/VBA · Internal reporting',
    '45+ min', '&lt; 10 min',
    'Built for and used by a 12-person team.',
    'How the workflow worked',
    'The real workbook contains confidential workplace information, so I rebuilt this demo from scratch with fictional data.',
    'Too much repeated work',
    'Simplifying the workflow',
    'What stayed manual',
  ]);
  excludesAll(files.reporting, ['What I learned']);
});

test('Grocery Automation copy lock is present', () => {
  includesAll(files.grocery, [
    'Python · Flipp/Wishabi · Gemini API · JSON · Excel',
    'How the workflow works',
    'The bot detector won. I changed tactics.',
    'Giving the model some house rules',
    'Sorry beef tenderloin, $2 off per kilo still does not make you a budget protein.',
    'Switching the output to JSON',
    'Two six-dinner options, ready for review',
    'Sample data',
  ]);
  excludesAll(files.grocery, ['cheapest basket', 'formal optimization']);
});

test('AskWill copy lock is present', () => {
  includesAll(files.askwill, [
    'I built the original AskWill site in Wix and maintained it for several years.',
    '“amateur PowerPoint deck” vibe',
    '19-page site now live at AskWill.ca',
    'Starting with the problem',
    'What maintaining the first site taught me',
    'Making it easier to know where to start',
    'Two more changes',
    'Structure, SEO, and QA',
    '199', 'source tests', 'Firefox + WebKit',
    'The rebuilt site is now live at AskWill.ca.',
  ]);
  excludesAll(files.askwill, ['Authorship']);
});

test('Coast FI copy lock is present without changing engine-facing contract', () => {
  includesAll(files.coast + files.coastUi + files.coastScript, [
    'What would it take to reach your Coast threshold?',
    'Coast FI is an investment strategy built around doing more of your retirement saving early in your career',
    'Calculations run in your browser. Financial inputs are not stored or sent anywhere.',
    'Where am I now?', 'Coast by age', 'When could I Coast?', 'Retirement target',
    'It started as a much bigger spreadsheet.',
    'Making the public version simpler',
    '34 regression tests · 34 passed · 0 failed',
    'Download the sanitized workbook',
    'What the calculator leaves out',
    'Today’s dollars · real annual return · month-end contributions · month-level Coast search.',
  ]);
});

test('Compound Growth copy lock preserves evidence/explorer boundary', () => {
  const corpus = files.compound + files.compoundFixed + files.compoundEvidence + files.compoundExplorer;
  includesAll(corpus, [
    'Across five randomized experiments, I tested whether identical retirement-growth projections produce different judgments when shown as a numerical table or a line graph.',
    '1,248 participants',
    'Line graphs made compound-growth acceleration more apparent than tables.',
    'The same projection, shown two ways',
    'How the five studies built on each other',
    'How perceived acceleration was measured',
    '2.61 = the correct ratio for the experimental projection.',
    'Experiment 4 results', 'What changed?',
    'Testing the visual mechanism',
    'What this could mean for retirement tools',
    'Explore a separate compound-growth scenario',
    'This adjustable projection is separate from the experiments and was not tested in them.',
  ]);
  excludesAll(corpus, ['Download thesis']);
});

test('Smith Manoeuvre copy lock is present and calculator math implementation remains wrapped separately', () => {
  includesAll(files.smith + files.smithUi, [
    'Educational scenario model only. Not financial, tax, legal, or lending advice.',
    'What is the Smith Manoeuvre?',
    'Making the comparison fair',
    'Simplifying the model for the web',
    '21 regression scenarios · 21 passed · 0 failed',
    'What the model leaves out',
    'Download the sanitized workbook',
    'Calculations stay in your browser.',
    'Must be no more than 80% of home value in this model.',
    'Uses the Canadian semi-annual compounding convention.',
    "import SmithManoeuvreCalculatorBase from './SmithManoeuvreCalculatorBase.astro'",
  ]);
});
