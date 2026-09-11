  import {
    CoastFiCalculationError,
    CoastFiInputError,
    coastThreshold,
    estimatedCoastAge,
    portfolioFutureValue,
    requiredMonthlyToCoastByAge,
    retirementTargetContribution,
    whereAmINow,
    type ModeAResult,
    type ModeBResult,
    type ModeCResult,
    type ModeDResult,
    type SharedInputs,
  } from '../lib/calculators/coastFi';

  type Mode = 'A' | 'B' | 'C' | 'D';
  type AnyResult = ModeAResult | ModeBResult | ModeCResult | ModeDResult;
  type FieldName = 'current-age' | 'retirement-age' | 'current-portfolio' | 'retirement-target' | 'real-return' | 'target-coast-age' | 'monthly-contribution';
  type Metric = { label: string; value: string };
  type ChartPoint = { month: number; age: number; portfolio: number; threshold: number | null };

  const root = document.querySelector<HTMLElement>('[data-coast-calculator]');

  if (root) {
    const form = root.querySelector<HTMLFormElement>('[data-coast-form]')!;
    const resultContent = root.querySelector<HTMLElement>('[data-result-content]')!;
    const calculationError = root.querySelector<HTMLElement>('[data-calculation-error]')!;
    const answer = root.querySelector<HTMLElement>('[data-answer]')!;
    const primaryLabel = root.querySelector<HTMLElement>('[data-primary-label]')!;
    const primaryValue = root.querySelector<HTMLElement>('[data-primary-value]')!;
    const primaryNote = root.querySelector<HTMLElement>('[data-primary-note]')!;
    const metrics = root.querySelector<HTMLElement>('[data-metrics]')!;
    const warning = root.querySelector<HTMLElement>('[data-return-warning]')!;
    const assumptions = root.querySelector<HTMLElement>('[data-assumptions]')!;
    const helper = root.querySelector<HTMLElement>('[data-mode-helper]')!;
    const chartFigure = root.querySelector<HTMLElement>('[data-chart-figure]')!;
    const chartSummary = root.querySelector<HTMLElement>('[data-chart-summary]')!;
    const chartDesc = root.querySelector<SVGDescElement>('[data-chart-desc]')!;
    const thresholdPath = root.querySelector<SVGPathElement>('[data-threshold-path]')!;
    const portfolioPath = root.querySelector<SVGPathElement>('[data-portfolio-path]')!;
    const markerLayer = root.querySelector<SVGGElement>('[data-chart-markers]')!;
    const markerSummary = root.querySelector<HTMLElement>('[data-marker-summary]')!;
    const projectionTable = root.querySelector<HTMLTableSectionElement>('[data-projection-table]')!;

    const inputs = {
      currentAge: root.querySelector<HTMLInputElement>('#coast-current-age')!,
      retirementAge: root.querySelector<HTMLInputElement>('#coast-retirement-age')!,
      currentPortfolio: root.querySelector<HTMLInputElement>('#coast-current-portfolio')!,
      retirementTarget: root.querySelector<HTMLInputElement>('#coast-retirement-target')!,
      realReturn: root.querySelector<HTMLInputElement>('#coast-real-return')!,
      targetCoastAge: root.querySelector<HTMLInputElement>('#coast-target-age')!,
      monthlyContribution: root.querySelector<HTMLInputElement>('#coast-monthly-contribution')!,
    };

    const examples = {
      currentAge: '30', retirementAge: '65', currentPortfolio: '100000', retirementTarget: '1000000',
      realReturn: '5', targetCoastAge: '45', monthlyContribution: '500',
    };

    const modeHelpers: Record<Mode, string> = {
      A: "See how your current portfolio compares with today's Coast threshold.",
      B: 'Estimate the monthly contribution needed to reach Coast FI by a chosen age.',
      C: 'Enter a monthly contribution and estimate when the portfolio first reaches the Coast threshold.',
      D: 'Estimate the monthly contribution needed to reach the full target by retirement.',
    };

    const currencyWhole = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
    const currencyInput = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 });

    function selectedMode(): Mode {
      return (form.querySelector<HTMLInputElement>('input[name="coast-mode"]:checked')?.value ?? 'A') as Mode;
    }

    function value(input: HTMLInputElement): number {
      return input.valueAsNumber;
    }

    function isWholeYear(number: number): boolean {
      return Number.isInteger(number);
    }

    function setFieldError(field: FieldName, message: string): void {
      const element = root.querySelector<HTMLElement>(`[data-error-for="${field}"]`)!;
      const input = form.querySelector<HTMLInputElement>(`[name="${field}"]`)!;
      element.textContent = message;
      element.hidden = false;
      input.setAttribute('aria-invalid', 'true');
    }

    function clearErrors(): void {
      root.querySelectorAll<HTMLElement>('[data-error-for]').forEach((element) => {
        element.textContent = '';
        element.hidden = true;
      });
      form.querySelectorAll<HTMLInputElement>('input[aria-invalid="true"]').forEach((input) => input.removeAttribute('aria-invalid'));
      calculationError.textContent = '';
      calculationError.hidden = true;
    }

    function validate(mode: Mode): boolean {
      clearErrors();
      let valid = true;
      const currentAge = value(inputs.currentAge);
      const retirementAge = value(inputs.retirementAge);
      const currentPortfolio = value(inputs.currentPortfolio);
      const retirementTarget = value(inputs.retirementTarget);
      const realReturn = value(inputs.realReturn);

      if (!Number.isFinite(currentAge) || !isWholeYear(currentAge) || currentAge < 18 || currentAge > 100) {
        setFieldError('current-age', 'Enter a whole-number age from 18 to 100.'); valid = false;
      }
      if (!Number.isFinite(retirementAge) || !isWholeYear(retirementAge) || retirementAge < 18 || retirementAge > 100) {
        setFieldError('retirement-age', 'Enter a whole-number retirement age from 18 to 100.'); valid = false;
      } else if (Number.isFinite(currentAge)) {
        const orderingInvalid = mode === 'A' ? retirementAge < currentAge : retirementAge <= currentAge;
        if (orderingInvalid) {
          setFieldError('retirement-age', mode === 'A' ? 'Retirement age must be at least your current age.' : 'Retirement age must be greater than your current age for this mode.');
          valid = false;
        }
      }
      if (!Number.isFinite(currentPortfolio) || currentPortfolio < 0) {
        setFieldError('current-portfolio', 'Enter a current invested portfolio of $0 or more.'); valid = false;
      }
      if (!Number.isFinite(retirementTarget) || retirementTarget <= 0) {
        setFieldError('retirement-target', 'Enter a retirement portfolio target greater than $0.'); valid = false;
      }
      if (!Number.isFinite(realReturn) || realReturn <= -100 || realReturn > 20) {
        setFieldError('real-return', 'Enter a real annual return greater than −100% and no more than 20%.'); valid = false;
      }

      if (mode === 'B') {
        const targetAge = value(inputs.targetCoastAge);
        if (!Number.isFinite(targetAge) || !isWholeYear(targetAge) || targetAge < 18 || targetAge > 100) {
          setFieldError('target-coast-age', 'Enter a whole-number Coast age from 18 to 100.'); valid = false;
        } else if (Number.isFinite(currentAge) && Number.isFinite(retirementAge) && (targetAge < currentAge || targetAge > retirementAge)) {
          setFieldError('target-coast-age', 'Target Coast age must be between your current age and retirement age.'); valid = false;
        }
      }

      if (mode === 'C') {
        const contribution = value(inputs.monthlyContribution);
        if (!Number.isFinite(contribution) || contribution < 0) {
          setFieldError('monthly-contribution', 'Enter a monthly contribution of $0 or more.'); valid = false;
        }
      }

      return valid;
    }

    function sharedInputs(): SharedInputs {
      return {
        currentAge: value(inputs.currentAge),
        currentPortfolio: value(inputs.currentPortfolio),
        retirementAge: value(inputs.retirementAge),
        retirementTarget: value(inputs.retirementTarget),
        annualRealReturn: value(inputs.realReturn) / 100,
      };
    }

    function durationLabel(years: number, months: number): string {
      if (years === 0 && months === 0) return '0 months';
      const parts: string[] = [];
      if (years) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
      if (months) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
      return parts.join(' ');
    }

    function renderMetrics(items: Metric[]): void {
      metrics.replaceChildren();
      for (const item of items) {
        const wrapper = document.createElement('div');
        const term = document.createElement('dt');
        const detail = document.createElement('dd');
        term.textContent = item.label;
        detail.textContent = item.value;
        wrapper.append(term, detail);
        metrics.append(wrapper);
      }
    }

    function setPrimary(label: string, valueText: string, note = ''): void {
      primaryLabel.textContent = label;
      primaryValue.textContent = valueText;
      primaryNote.textContent = note;
    }

    function contributionPrimary(exact: number): string {
      return `${currencyWhole.format(Math.ceil(exact))} / month`;
    }

    function renderModeResult(mode: Mode, result: AnyResult, shared: SharedInputs): void {
      if (mode === 'A') {
        const data = result as ModeAResult;
        const gap = Math.abs(data.coastGapSurplus);
        answer.textContent = data.isAboveCoastThreshold
          ? 'Your current portfolio is above the modeled Coast threshold.'
          : `Your current portfolio is about ${currencyWhole.format(gap)} below the modeled Coast threshold.`;
        setPrimary('Coast threshold today', currencyWhole.format(data.requiredCoastThresholdToday));
        renderMetrics([
          { label: 'Current invested portfolio', value: currencyWhole.format(shared.currentPortfolio) },
          { label: data.coastGapSurplus >= 0 ? 'Surplus above threshold' : 'Gap to threshold', value: currencyWhole.format(gap) },
          { label: 'Projected at retirement, no future contributions', value: currencyWhole.format(data.projectedRetirementValueZeroContributions) },
          { label: 'Time to retirement', value: durationLabel(Math.floor(data.yearsToRetirement), Math.round((data.yearsToRetirement % 1) * 12)) },
        ]);
      }

      if (mode === 'B') {
        const data = result as ModeBResult;
        if (!data.feasible || data.requiredMonthlyContribution === null) {
          answer.textContent = 'That Coast age is your current age, so there are no future contribution months available. Your current portfolio is below the Coast threshold under these assumptions.';
          setPrimary('Monthly contribution to Coast by age', 'No contribution window', 'Choose a later Coast age to create contribution months.');
          renderMetrics([
            { label: 'Coast threshold at target age', value: currencyWhole.format(data.coastThresholdAtTargetAge) },
            { label: 'Current invested portfolio', value: currencyWhole.format(shared.currentPortfolio) },
            { label: 'Contribution duration', value: '0 months' },
          ]);
        } else {
          const age = data.targetCoastAge.years;
          answer.textContent = `The model estimates a monthly contribution of about ${currencyWhole.format(Math.ceil(data.requiredMonthlyContribution))} to reach the Coast threshold by age ${age}.`;
          setPrimary(`Monthly contribution to Coast by age ${age}`, contributionPrimary(data.requiredMonthlyContribution));
          renderMetrics([
            { label: 'Coast threshold at target age', value: currencyWhole.format(data.coastThresholdAtTargetAge) },
            { label: 'Contribution duration', value: durationLabel(data.contributionDuration.years, data.contributionDuration.months) },
            { label: 'Projected balance at target Coast age', value: currencyWhole.format(data.projectedBalanceAtCoastAge) },
            { label: 'Total contributed before Coast', value: currencyWhole.format(data.totalContributedUntilCoast ?? 0) },
            { label: 'Projected retirement value if contributions stop at Coast', value: currencyWhole.format(data.projectedRetirementValueIfStopAtCoast ?? 0) },
          ]);
        }
      }

      if (mode === 'C') {
        const data = result as ModeCResult;
        const contribution = value(inputs.monthlyContribution);
        if (data.reached && data.estimatedCoastAge && data.durationUntilCoast) {
          answer.textContent = `At ${currencyInput.format(contribution)} per month, the modeled portfolio reaches the Coast threshold at about age ${data.estimatedCoastAge.years}.`;
          setPrimary('Estimated Coast age', data.estimatedCoastAge.label);
          renderMetrics([
            { label: 'Time until Coast threshold', value: durationLabel(data.durationUntilCoast.years, data.durationUntilCoast.months) },
            { label: 'Projected portfolio at crossing', value: currencyWhole.format(data.projectedPortfolioAtCoast ?? 0) },
            { label: 'Coast threshold at crossing', value: currencyWhole.format(data.coastThresholdAtCoast ?? 0) },
            { label: 'Total contributed before Coast', value: currencyWhole.format(data.totalContributedUntilCoast ?? 0) },
            { label: 'Projected at retirement if contributions continue', value: currencyWhole.format(data.projectedRetirementValueIfContributeToRetirement) },
          ]);
        } else {
          answer.textContent = 'At this contribution, the modeled portfolio does not reach the Coast threshold before retirement.';
          setPrimary('Estimated Coast age', 'Not reached by retirement');
          renderMetrics([
            { label: 'Monthly contribution', value: `${currencyInput.format(contribution)} / month` },
            { label: 'Projected at retirement if contributions continue', value: currencyWhole.format(data.projectedRetirementValueIfContributeToRetirement) },
            { label: 'Retirement portfolio target', value: currencyWhole.format(data.retirementTarget) },
          ]);
        }
      }

      if (mode === 'D') {
        const data = result as ModeDResult;
        answer.textContent = `The model estimates a monthly contribution of about ${currencyWhole.format(Math.ceil(data.requiredMonthlyContribution))} to reach the full retirement target by age ${shared.retirementAge}.`;
        setPrimary('Monthly contribution to retirement target', contributionPrimary(data.requiredMonthlyContribution));
        renderMetrics([
          { label: 'Projected current portfolio at retirement', value: currencyWhole.format(data.projectedCurrentPortfolioGrowth) },
          { label: 'Future value from solved contributions', value: currencyWhole.format(data.futureValueOfContributions) },
          { label: 'Retirement portfolio target', value: currencyWhole.format(data.retirementTarget) },
          { label: 'Projected total at retirement', value: currencyWhole.format(data.projectedRetirementValue) },
        ]);
      }

      warning.hidden = !(result.warnings ?? []).includes('HIGH_REAL_RETURN');
      assumptions.textContent = 'Today’s dollars · real annual return · month-end contributions · month-level Coast search.';
    }

    function calculate(mode: Mode, shared: SharedInputs): AnyResult {
      if (mode === 'A') return whereAmINow(shared);
      if (mode === 'B') return requiredMonthlyToCoastByAge({ ...shared, targetCoastAge: value(inputs.targetCoastAge) });
      if (mode === 'C') return estimatedCoastAge({ ...shared, monthlyContribution: value(inputs.monthlyContribution) });
      return retirementTargetContribution(shared);
    }

    function chartConfiguration(mode: Mode, result: AnyResult, shared: SharedInputs): { contribution: number; stopMonth: number; markerMonth: number | null; markerLabel: string | null } {
      const totalMonths = Math.round((shared.retirementAge - shared.currentAge) * 12);
      if (mode === 'A') return { contribution: 0, stopMonth: 0, markerMonth: null, markerLabel: null };
      if (mode === 'B') {
        const data = result as ModeBResult;
        const solved = data.requiredMonthlyContribution ?? 0;
        return { contribution: solved, stopMonth: data.contributionMonths, markerMonth: data.contributionMonths, markerLabel: `Target Coast age: ${data.targetCoastAge.label}` };
      }
      if (mode === 'C') {
        const data = result as ModeCResult;
        const contribution = value(inputs.monthlyContribution);
        const stopMonth = data.reached && data.monthsUntilCoast !== null ? data.monthsUntilCoast : totalMonths;
        return { contribution, stopMonth, markerMonth: data.reached ? data.monthsUntilCoast : null, markerLabel: data.estimatedCoastAge ? `Coast crossing: ${data.estimatedCoastAge.label}` : null };
      }
      const data = result as ModeDResult;
      return { contribution: data.requiredMonthlyContribution, stopMonth: totalMonths, markerMonth: null, markerLabel: null };
    }

    function buildChartPoints(mode: Mode, result: AnyResult, shared: SharedInputs): ChartPoint[] {
      const totalMonths = Math.round((shared.retirementAge - shared.currentAge) * 12);
      const config = chartConfiguration(mode, result, shared);
      const stopBalance = portfolioFutureValue(shared.currentPortfolio, config.contribution, config.stopMonth, shared.annualRealReturn);
      const points: ChartPoint[] = [];

      for (let month = 0; month <= totalMonths; month += 1) {
        const portfolio = month <= config.stopMonth
          ? portfolioFutureValue(shared.currentPortfolio, config.contribution, month, shared.annualRealReturn)
          : portfolioFutureValue(stopBalance, 0, month - config.stopMonth, shared.annualRealReturn);
        let threshold: number | null = null;
        try {
          threshold = coastThreshold(shared.retirementTarget, shared.annualRealReturn, (totalMonths - month) / 12);
        } catch (error) {
          if (!(error instanceof CoastFiCalculationError)) throw error;
        }
        points.push({ month, age: shared.currentAge + month / 12, portfolio, threshold });
      }
      return points;
    }

    function axisCurrency(value: number): string {
      const abs = Math.abs(value);
      if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
      if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
      if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`;
      return currencyWhole.format(value);
    }

    function linePath(points: ChartPoint[], key: 'portfolio' | 'threshold', maxY: number): string {
      const left = 76, right = 730, top = 24, bottom = 308;
      const lastMonth = Math.max(1, points.at(-1)?.month ?? 1);
      let active = false;
      let path = '';
      for (const point of points) {
        const raw = point[key];
        if (raw === null || !Number.isFinite(raw)) { active = false; continue; }
        const x = left + (point.month / lastMonth) * (right - left);
        const y = bottom - (raw / maxY) * (bottom - top);
        path += `${active ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `;
        active = true;
      }
      return path.trim();
    }

    function appendMarker(month: number, label: string, points: ChartPoint[], maxY: number, emphasized = false): void {
      const left = 76, right = 730, top = 24, bottom = 308;
      const lastMonth = Math.max(1, points.at(-1)?.month ?? 1);
      const point = points[Math.max(0, Math.min(month, points.length - 1))];
      const x = left + (month / lastMonth) * (right - left);
      const y = bottom - (point.portfolio / maxY) * (bottom - top);
      const ns = 'http://www.w3.org/2000/svg';
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(x)); line.setAttribute('x2', String(x)); line.setAttribute('y1', String(top)); line.setAttribute('y2', String(bottom));
      line.setAttribute('stroke', emphasized ? '#0a817d' : '#9aa9a6'); line.setAttribute('stroke-width', emphasized ? '1.6' : '1'); line.setAttribute('stroke-dasharray', '4 5');
      markerLayer.append(line);
      if (emphasized) {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', String(x)); circle.setAttribute('cy', String(y)); circle.setAttribute('r', '5'); circle.setAttribute('fill', '#f5f7f4'); circle.setAttribute('stroke', '#0a817d'); circle.setAttribute('stroke-width', '3');
        markerLayer.append(circle);
      }
      void label;
    }

    function renderProjectionTable(points: ChartPoint[], specialMonth: number | null): void {
      projectionTable.replaceChildren();
      const selected = new Set<number>();
      for (let month = 0; month < points.length; month += 12) selected.add(month);
      selected.add(points.length - 1);
      if (specialMonth !== null) selected.add(specialMonth);

      for (const month of [...selected].sort((a, b) => a - b)) {
        const point = points[month];
        const row = document.createElement('tr');
        const ageCell = document.createElement('th');
        const portfolioCell = document.createElement('td');
        const thresholdCell = document.createElement('td');
        ageCell.scope = 'row';
        ageCell.textContent = Number.isInteger(point.age) ? `Age ${point.age}` : `Age ${Math.floor(point.age)}y ${month % 12}m`;
        portfolioCell.textContent = currencyWhole.format(point.portfolio);
        thresholdCell.textContent = point.threshold === null ? 'Beyond numeric range' : currencyWhole.format(point.threshold);
        row.append(ageCell, portfolioCell, thresholdCell);
        projectionTable.append(row);
      }
    }

    function renderChart(mode: Mode, result: AnyResult, shared: SharedInputs): void {
      const points = buildChartPoints(mode, result, shared);
      const config = chartConfiguration(mode, result, shared);
      const finiteThresholds = points.flatMap((point) => point.threshold === null ? [] : [point.threshold]);
      const maxDataValue = Math.max(shared.retirementTarget, ...points.map((point) => point.portfolio), ...finiteThresholds);
      const maxY = maxDataValue > 0 ? maxDataValue * 1.08 : 1;
      const yValues = [0, maxY / 2, maxY];
      const yPositions = [308, 166, 24];

      yValues.forEach((tick, index) => {
        const label = root.querySelector<SVGTextElement>(`[data-y-label="${index}"]`)!;
        const line = root.querySelector<SVGLineElement>(`[data-grid="${index}"]`)!;
        label.textContent = axisCurrency(tick);
        label.setAttribute('y', String(yPositions[index] + 4));
        line.setAttribute('y1', String(yPositions[index]));
        line.setAttribute('y2', String(yPositions[index]));
      });

      const start = root.querySelector<SVGTextElement>('[data-x-label="start"]')!;
      const middle = root.querySelector<SVGTextElement>('[data-x-label="middle"]')!;
      const end = root.querySelector<SVGTextElement>('[data-x-label="end"]')!;
      start.setAttribute('x', '76'); start.textContent = `Age ${shared.currentAge}`;
      middle.setAttribute('x', '403'); middle.textContent = `Age ${Math.round((shared.currentAge + shared.retirementAge) / 2)}`;
      end.setAttribute('x', '730'); end.textContent = `Age ${shared.retirementAge}`;

      portfolioPath.setAttribute('d', linePath(points, 'portfolio', maxY));
      thresholdPath.setAttribute('d', linePath(points, 'threshold', maxY));
      markerLayer.replaceChildren();
      appendMarker(0, 'Today', points, maxY);
      if (config.markerMonth !== null && config.markerLabel) appendMarker(config.markerMonth, config.markerLabel, points, maxY, true);
      appendMarker(points.length - 1, 'Retirement', points, maxY);

      const markerParts = [`Today: age ${shared.currentAge}`];
      if (config.markerLabel) markerParts.push(config.markerLabel);
      markerParts.push(`Retirement: age ${shared.retirementAge}`, `Retirement target: ${currencyWhole.format(shared.retirementTarget)}`);
      markerSummary.textContent = markerParts.join(' · ');

      const endingPortfolio = points.at(-1)?.portfolio ?? 0;
      chartSummary.textContent = `The solid line is the projected portfolio for this mode; the dashed line is the Coast threshold. At retirement, the Coast threshold equals the ${currencyWhole.format(shared.retirementTarget)} portfolio target.`;
      chartDesc.textContent = `Projection from age ${shared.currentAge} to age ${shared.retirementAge}. Projected portfolio at retirement is ${currencyWhole.format(endingPortfolio)}. The retirement target is ${currencyWhole.format(shared.retirementTarget)}. ${config.markerLabel ?? ''}`.trim();
      renderProjectionTable(points, config.markerMonth);
      chartFigure.hidden = false;
    }

    function showCalculationError(message: string): void {
      calculationError.textContent = message;
      calculationError.hidden = false;
      resultContent.hidden = true;
      chartFigure.hidden = true;
    }

    function runCalculation(): void {
      const mode = selectedMode();
      helper.textContent = modeHelpers[mode];
      if (!validate(mode)) {
        showCalculationError('Fix the highlighted field to update the calculation. Your other entries have been preserved.');
        return;
      }

      try {
        const shared = sharedInputs();
        const result = calculate(mode, shared);
        resultContent.hidden = false;
        calculationError.hidden = true;
        renderModeResult(mode, result, shared);
        renderChart(mode, result, shared);
      } catch (error) {
        if (error instanceof CoastFiCalculationError) {
          showCalculationError('These assumptions produce values beyond the calculator’s supported numeric range. Try a less extreme return assumption or smaller portfolio values.');
          return;
        }
        if (error instanceof CoastFiInputError) {
          showCalculationError('One or more inputs are outside the supported calculator range. Check the highlighted assumptions and try again.');
          return;
        }
        showCalculationError('The calculation could not be completed. Review the assumptions and try again.');
      }
    }

    function syncModeVisibility(): void {
      const mode = selectedMode();
      root.querySelector<HTMLElement>('[data-mode-b]')!.hidden = mode !== 'B';
      root.querySelector<HTMLElement>('[data-mode-c]')!.hidden = mode !== 'C';
      helper.textContent = modeHelpers[mode];
    }

    form.addEventListener('submit', (event) => { event.preventDefault(); runCalculation(); });
    form.querySelectorAll<HTMLInputElement>('input[name="coast-mode"]').forEach((radio) => {
      radio.addEventListener('change', () => { syncModeVisibility(); runCalculation(); });
    });
    form.querySelectorAll<HTMLInputElement>('input:not([name="coast-mode"])').forEach((input) => {
      input.addEventListener('input', () => {
        const field = input.name as FieldName;
        const errorElement = root.querySelector<HTMLElement>(`[data-error-for="${field}"]`);
        if (errorElement) { errorElement.hidden = true; errorElement.textContent = ''; }
        input.removeAttribute('aria-invalid');
      });
    });
    root.querySelector<HTMLButtonElement>('[data-reset]')!.addEventListener('click', () => {
      inputs.currentAge.value = examples.currentAge;
      inputs.retirementAge.value = examples.retirementAge;
      inputs.currentPortfolio.value = examples.currentPortfolio;
      inputs.retirementTarget.value = examples.retirementTarget;
      inputs.realReturn.value = examples.realReturn;
      inputs.targetCoastAge.value = examples.targetCoastAge;
      inputs.monthlyContribution.value = examples.monthlyContribution;
      form.querySelector<HTMLInputElement>('#coast-mode-a')!.checked = true;
      syncModeVisibility();
      runCalculation();
    });

    syncModeVisibility();
    runCalculation();
  }