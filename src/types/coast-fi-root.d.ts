// Preserve the runtime null guard in the calculator client while letting TypeScript
// retain the known route-local calculator-root selector inside nested helper functions.
interface Document {
  querySelector<E extends Element = Element>(selectors: '[data-coast-calculator]'): E;
  querySelector<E extends Element = Element>(selectors: string): E | null;
}
