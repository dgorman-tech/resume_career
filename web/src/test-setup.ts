import "@testing-library/jest-dom/vitest";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom ships no layout engine, so this real browser API is simply absent
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
