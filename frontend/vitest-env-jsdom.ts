/**
 * Custom vitest environment: jsdom + explicit localStorage/sessionStorage bridge.
 *
 * Node >=26 exposes its own `localStorage` global (undefined unless
 * --localstorage-file is passed). Because that key already exists `in global`,
 * vitest's populateGlobal() skips it when copying jsdom's window properties.
 * This wrapper runs after populateGlobal and explicitly sets the jsdom-provided
 * implementations onto the global so tests can use them.
 */
import { builtinEnvironments } from "vitest/environments";

const jsdomBuiltin = builtinEnvironments.jsdom;

export default {
  name: "jsdom-node26",
  transformMode: "web" as const,
  async setupVM(options: Record<string, unknown>) {
    return jsdomBuiltin.setupVM!(options);
  },
  async setup(global: typeof globalThis, options: Record<string, unknown>) {
    const result = await jsdomBuiltin.setup(global, options);
    // Bridge jsdom's real localStorage/sessionStorage onto the global so that
    // Node 26's stub (which returns undefined) does not shadow them.
    const win = (global as unknown as { jsdom: { window: Window } }).jsdom.window;
    Object.defineProperty(global, "localStorage", {
      value: win.localStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global, "sessionStorage", {
      value: win.sessionStorage,
      writable: true,
      configurable: true,
    });
    return result;
  },
};
