import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// FINAL_RC_SOURCE_CONTRACT_INTERFACE = 1
// Default execution is strict final authority. Only the assembler may provide
// a byte-pinned context for a known intermediate source tree.
const laneOrder = ['homepage','wealthsimple','reporting','designDay','grocery','askWill','coast','compound','smith','releaseTooling'];
const sourcePath = fileURLToPath(import.meta.url);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (root,args) => execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
let sourceRoot = path.resolve(path.dirname(sourcePath),'..');
let finalLanes = new Set(laneOrder);
if (process.env.FINAL_RC_SOURCE_CONTEXT) {
  assert.equal(process.env.QA_AUTHORITY_PROFILE,'assembler-wave','Wave context requires explicit assembler-wave profile.');
  const contextPath = fs.realpathSync(process.env.FINAL_RC_SOURCE_CONTEXT);
  const context = JSON.parse(fs.readFileSync(contextPath,'utf8'));
  assert.equal(context.schemaVersion,1);
  assert.deepEqual(context.laneOrder,laneOrder);
  assert.equal(context.sourceSha256,hash(fs.readFileSync(sourcePath)),'External source contract changed.');
  assert.match(context.toolingCommit,/^[a-f0-9]{40}$/);
  assert.match(context.candidateSha,/^[a-f0-9]{40}$/);
  assert.match(context.candidateTree,/^[a-f0-9]{40}$/);
  sourceRoot = fs.realpathSync(context.candidateRoot);
  for (const external of [sourcePath,contextPath]) {
    const rel=path.relative(sourceRoot,external);
    assert.ok(rel==='..'||rel.startsWith('..'+path.sep),'Wave tooling must remain outside candidate tree.');
  }
  assert.equal(git(sourceRoot,['rev-parse','HEAD']),context.candidateSha);
  assert.equal(git(sourceRoot,['rev-parse','HEAD^{tree}']),context.candidateTree);
  assert.equal(git(sourceRoot,['status','--porcelain=v1']),context.candidateStatus);
  assert.equal(context.candidateStatus,'','Wave candidate must be clean.');
  const phaseIndex=laneOrder.indexOf(context.phase);
  assert.ok(phaseIndex>=0 && context.phase!=='releaseTooling','Only pre-tooling waves accept a context.');
  assert.ok(Array.isArray(context.includedLanes));
  assert.deepEqual(context.includedLanes,laneOrder.filter(l=>context.includedLanes.includes(l)),'Included lanes must be unique and ordered.');
  assert.ok(context.includedLanes.includes('releaseTooling'),'A wave overlay needs a final release-tooling lane.');
  assert.ok(context.includedLanes.includes(context.phase));
  const expectedApplied=laneOrder.slice(0,phaseIndex+1).filter(l=>context.includedLanes.includes(l));
  assert.deepEqual(context.appliedLanes,expectedApplied,'Final assertions apply only to the exact completed lane prefix.');
  assert.equal(hash(fs.readFileSync(path.join(sourceRoot,'tests/source-contract.test.mjs'))),'090a372b5821044740d0bb7f543c0d195812bb7c03dafde89da8dced1854d566','Unexpected obsolete test module.');
  finalLanes = new Set(context.appliedLanes);
} else {
  assert.notEqual(process.env.QA_AUTHORITY_PROFILE,'assembler-wave','Missing required wave context.');
}
const isFinal = lane => finalLanes.has(lane);
const normalizedText = html => html.replace(/^---[\s\S]*?---/,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi,(_,tag)=>/^(?:h[1-6]|p|div|section|article|header|footer|main|ul|ol|li|dl|dt|dd|br|hr|table|thead|tbody|tr|td|th|figure|figcaption|details|summary|form|fieldset|legend)$/i.test(tag)?' ':'').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&#39;',"'").replace(/\s+/g,' ').trim();
const headingText=(html,id)=>{const match=html.match(new RegExp('<h[1-6]\\b[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)<\\/h[1-6]>'));assert.ok(match,'Missing heading '+id);return normalizedText(match[1]);};

const read = relative => fs.readFileSync(path.join(sourceRoot,relative),'utf8');
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
  smithBase: read('src/components/calculators/SmithManoeuvreCalculatorBase.astro'),
  smithView: read('src/lib/calculators/smithManoeuvreView.ts'),
  compoundEngine: read('src/lib/calculators/compoundGrowth.ts'),
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
  if (isFinal('grocery')) {
    includesAll(normalizedText(files.grocery), [
      'Python · Flipp/Wishabi · Gemini API · JSON · Excel', 'The workflow',
      'The bot detector won. I changed tactics.', 'Giving the model some house rules',
      "Pork-free and shellfish-free, and no expensive proteins just because they happened to be on sale (sorry beef tenderloin, $2 off per kilo still doesn't make you a budget protein).",
      'Switching the output to JSON', 'Two six-dinner menu options, ready for review.',
      'This is a sample version of the final output, with six dinners for nine people and two store options to compare.',
    ]);
    assert.match(files.grocery,/aria-label="House Rules treatment C"/);
    excludesAll(normalizedText(files.grocery),['Sample data','How the workflow works','cheapest basket','formal optimization']);
    return;
  }
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
  if (isFinal('askWill')) {
    includesAll(normalizedText(files.askwill),[
      'I built the original AskWill site in Wix and maintained it for several years.',
      '“amateur PowerPoint deck” vibe','19-page site now live at AskWill.ca',
      'Starting with the problem','What maintaining the first site taught me',
      'Structure, SEO, and hosting','199','source tests','Firefox + WebKit',
      'The rebuilt site is now live at AskWill.ca.',
    ]);
    const liveLinks=[...files.askwill.matchAll(/<a\b[^>]*class="askwill-live-link"[^>]*>[\s\S]*?<\/a>/g)].map(match=>match[0]);
    assert.equal(liveLinks.length,2);
    for(const link of liveLinks){assert.match(link,/href="https:\/\/askwill\.ca\/"/);assert.match(link,/target="_blank"/);assert.match(link,/rel="noopener noreferrer"/);assert.equal(normalizedText(link),'AskWill.ca');}
    excludesAll(normalizedText(files.askwill),['Authorship','Making it easier to know where to start','Two more changes','Structure, SEO, and QA','Water Softener Repair']);
    assert.doesNotMatch(files.askwill,/data-kind="repair"/);
    return;
  }
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
  if (isFinal('coast')) {
    const corpus=files.coast+files.coastUi+files.coastScript;
    includesAll(corpus,[
      '<h1>Coast FI Calculator</h1>','What would it take to hit your Coast target?',
      'Coast FI is an investment strategy built around doing more of your retirement saving early in your career',
      'Where am I now?','Coast by age','When could I Coast?','Retirement target',
      'Making the public version simpler','Checking the web model','All 34 passed.',
      'Download the workbook','What the calculator leaves out',
      'Today’s dollars · real annual return · month-end contributions · month-level Coast search.',
      '/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx',
    ]);
    assert.equal(headingText(files.coast,'origin-title'),'It started as a much bigger spreadsheet.');
    excludesAll(corpus,['What would it take to reach your Coast threshold?',
      'Calculations run in your browser. Financial inputs are not stored or sent anywhere.',
      '34 regression tests · 34 passed · 0 failed','Download the sanitized workbook',
      'Invested assets included in this simplified model.']);
    return;
  }
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
  if (isFinal('compound')) {
    const corpus=files.compound+files.compoundFixed+files.compoundEvidence+files.compoundExplorer;
    includesAll(corpus,[
      'Across five randomized experiments, I tested whether identical retirement-growth projections produce different judgments when shown as a numerical table or a line graph.',
      '1,248 participants','Line graphs made compound-growth acceleration more apparent than tables.',
      'The same projection, shown two ways','How the five studies built on each other',
      'How perceived acceleration was measured','2.61 = the correct ratio for the experimental projection.',
      'Experiment 4 results','What changed?','What this could mean for retirement tools',
      'Experiment 5: What part of the visual representation matters?',
      'The line graph again exceeded the table on perceived acceleration, but the area-card condition left the exact visual mechanism unresolved.',
      'Create your own compound-growth scenarios',
      'starting invested balance is fixed at $0.',
      'The assumed annual return is converted to an equivalent monthly rate; the existing balance grows each month, then the monthly contribution is added at month-end.',
      'Illustrative projection only. It does not model fees, taxes, inflation, return volatility, or changes in contributions.',
    ]);
    excludesAll(corpus,['Download thesis','Testing the visual mechanism',
      'Explore a separate compound-growth scenario',
      'This adjustable projection is separate from the experiments and was not tested in them.']);
    assert.match(files.compoundExplorer,/<input\b[^>]*id="cg-monthly-contribution"[^>]*value="100"/);
    assert.match(files.compoundExplorer,/<input\b[^>]*id="cg-annual-return"[^>]*value="8"/);
    assert.doesNotMatch(files.compoundExplorer,/<input\b[^>]*(?:startingPortfolio|starting-balance|initial-balance)/i);
    assert.match(files.compoundEngine,/monthlyContribution:\s*100/);
    assert.match(files.compoundEngine,/Math\.expm1\(Math\.log1p\(normalized\.annualReturn\) \/ 12\)/);
    assert.doesNotMatch(files.compoundEngine,/(?:import|require)[^\n]*(?:fixedExperimentalData|projection-data|experiment-4-results|experiment-summary)/);
    return;
  }
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
  if (isFinal('smith')) {
    const corpus=files.smith+files.smithUi+files.smithBase;
    includesAll(corpus,[
      'Educational scenario model only. Not financial, tax, legal, or lending advice.',
      'What is the Smith Manoeuvre?','Making the comparison fair','Simplifying the model for the web',
      'What the model leaves out','Download the workbook','Calculations stay in your browser.',
      'Uses the Canadian semi-annual compounding convention.',
      "import SmithManoeuvreCalculatorBase from './SmithManoeuvreCalculatorBase.astro'",
      'The public UI fixes the model assumption at 100% of modeled HELOC interest eligible before applying the marginal tax-rate proxy.',
      'Actual deductibility depends on the use and tracing of borrowed funds, income-earning purpose, legal obligations, record keeping, and other tax rules.',
      'This calculator does not determine tax eligibility.',
      'Multi-series balances','View yearly model data',
      '/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx',
    ]);
    excludesAll(corpus,['21 regression scenarios · 21 passed · 0 failed','Download the sanitized workbook',
      'Must be no more than 80% of home value in this model.']);
    assert.doesNotMatch(files.smithBase,/<input\b[^>]*data-smith-field="deductibleInterestAssumption"/);
    assert.match(files.smithBase,/deductibleInterestAssumption:\s*1/);
    assert.match(files.smithBase,/data-fixed-deductible-interest-assumption="1"/);
    assert.match(files.smithBase,/data-chart-a/);
    assert.doesNotMatch(files.smithBase,/data-chart-[bc]\b|data-graph-choice|data-colou?r-option/);
    for(const color of ['#5A7D67','#14A76C','#0B4A33','#9AA29F','#232A28']) assert.ok(files.smithView.includes(color),color);
    assert.match(files.smithBase,/<caption>Exact annual\/end-horizon values sampled from the existing monthly model states<\/caption>/);
    assert.match(files.smithBase,/role="region" tabindex="0" aria-label="Yearly exact model values used by the chart"/);
    assert.match(files.smithBase,/<th scope="col">Smith mortgage<\/th>/);
    assert.match(files.smithBase,/<th scope="row">/);
    return;
  }
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
