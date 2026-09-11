import { readFileSync } from "node:fs";
import {
  CoastFiInputError,
  estimatedCoastAge,
  requiredMonthlyToCoastByAge,
  retirementTargetContribution,
  type SharedInputs,
  whereAmINow,
} from "../src/lib/calculators/coastFi.ts";

type JsonObject = Record<string, unknown>;

type TestCase = {
  id: string;
  mode: "A" | "B" | "C" | "D" | "VALIDATION";
  inputs: JsonObject;
  expected?: JsonObject;
  expectedError?: { code: string };
};

type ModeInputs = SharedInputs & {
  targetCoastAge?: number;
  monthlyContribution?: number;
};

const DEFAULT_NUMERIC_TOLERANCE = 1e-6;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareExpected(actual: unknown, expected: unknown, path = "result"): string[] {
  const errors: string[] = [];

  if (typeof expected === "number") {
    if (typeof actual !== "number" || !Number.isFinite(actual)) {
      errors.push(`${path}: expected numeric ${expected}, received ${String(actual)}`);
      return errors;
    }
    const tolerance = Math.max(DEFAULT_NUMERIC_TOLERANCE, Math.abs(expected) * 1e-10);
    if (Math.abs(actual - expected) > tolerance) {
      errors.push(`${path}: expected ${expected}, received ${actual}, tolerance ${tolerance}`);
    }
    return errors;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      errors.push(`${path}: expected array, received ${typeof actual}`);
      return errors;
    }
    if (actual.length !== expected.length) {
      errors.push(`${path}: expected array length ${expected.length}, received ${actual.length}`);
      return errors;
    }
    expected.forEach((value, index) => errors.push(...compareExpected(actual[index], value, `${path}[${index}]`)));
    return errors;
  }

  if (isObject(expected)) {
    if (!isObject(actual)) {
      errors.push(`${path}: expected object, received ${String(actual)}`);
      return errors;
    }
    for (const [key, value] of Object.entries(expected)) {
      if (!(key in actual)) errors.push(`${path}.${key}: missing from actual result`);
      else errors.push(...compareExpected(actual[key], value, `${path}.${key}`));
    }
    return errors;
  }

  if (actual !== expected) errors.push(`${path}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  return errors;
}

function executeCase(testCase: TestCase): unknown {
  const inputs = testCase.inputs as unknown as ModeInputs;
  switch (testCase.mode) {
    case "A": return whereAmINow(inputs);
    case "B": return requiredMonthlyToCoastByAge(inputs as SharedInputs & { targetCoastAge: number });
    case "C": return estimatedCoastAge(inputs as SharedInputs & { monthlyContribution: number });
    case "D": return retirementTargetContribution(inputs);
    case "VALIDATION": {
      const validation = testCase.inputs as { function: "A" | "B" | "C" | "D"; payload: ModeInputs };
      switch (validation.function) {
        case "A": return whereAmINow(validation.payload);
        case "B": return requiredMonthlyToCoastByAge(validation.payload as SharedInputs & { targetCoastAge: number });
        case "C": return estimatedCoastAge(validation.payload as SharedInputs & { monthlyContribution: number });
        case "D": return retirementTargetContribution(validation.payload);
      }
    }
  }
}

const testFile = process.argv[2] ?? "tests/fixtures/coast-fi/coast-fi-test-cases-v2.json";
const suite = JSON.parse(readFileSync(testFile, "utf8")) as { cases: TestCase[] };
let passed = 0;
const failureLines: string[] = [];

for (const testCase of suite.cases) {
  try {
    const actual = executeCase(testCase);
    if (testCase.expectedError) {
      failureLines.push(`${testCase.id}: expected error ${testCase.expectedError.code}, but calculation succeeded.`);
      continue;
    }
    const errors = compareExpected(actual, testCase.expected ?? {});
    if (errors.length === 0) passed += 1;
    else failureLines.push(`${testCase.id}:\n  ${errors.join("\n  ")}`);
  } catch (error) {
    if (testCase.expectedError && error instanceof CoastFiInputError && error.code === testCase.expectedError.code) {
      passed += 1;
    } else {
      failureLines.push(`${testCase.id}: unexpected error ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const failed = failureLines.length;
console.log(`Coast FI V2 production regression suite: ${passed} passed, ${failed} failed, ${suite.cases.length} total.`);
if (failed > 0) {
  console.error(failureLines.join("\n"));
  process.exitCode = 1;
}
