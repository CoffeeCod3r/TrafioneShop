/**
 * Politeness shared by every page check (the catalog check and the nightly top-up): at most one request per second
 * to one domain, also with several requests at once, and robots.txt read once per domain. Portable.
 */
import { fetchRobotsText, ROBOTS_TOKEN, type CheckDeps } from "./check.ts";
import { parseRobots, type RobotsRules } from "./robots.ts";

export type Polite = {
  /** Waits for this URL's turn on its domain; pass it as CheckDeps.beforeRequest. */
  waitForTurn(url: string): Promise<void>;
  /** Whether robots.txt of the URL's domain lets our User-Agent read this page. */
  allows(url: string, deps: CheckDeps): Promise<boolean>;
};

export function createPolite(options: {
  intervalMs: number;
  /** A domain's own minimum interval (e.g. Ceneo 15 s); falls back to intervalMs. */
  intervalFor?: (host: string) => number | undefined;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}): Polite {
  const { intervalMs, now, sleep } = options;
  // The requests of one domain wait in a queue; each starts at least intervalMs after the previous one actually started.
  const lanes = new Map<string, Promise<void>>();
  const lastStart = new Map<string, number>();
  const robots = new Map<string, Promise<RobotsRules>>();
  const hostOf = (url: string) => new URL(url).hostname.toLowerCase();

  return {
    waitForTurn(url) {
      const host = hostOf(url);
      const turn = (lanes.get(host) ?? Promise.resolve()).then(async () => {
        const wait = (lastStart.get(host) ?? Number.NEGATIVE_INFINITY) + (options.intervalFor?.(host) ?? intervalMs) - now();
        if (wait > 0) await sleep(wait);
        lastStart.set(host, now());
      });
      lanes.set(host, turn);
      return turn;
    },
    async allows(url, deps) {
      const host = hostOf(url);
      let rules = robots.get(host);
      if (!rules) {
        rules = fetchRobotsText(new URL(url).origin, deps).then((text) => (text ? parseRobots(text, ROBOTS_TOKEN) : { isAllowed: () => true }));
        robots.set(host, rules);
      }
      const target = new URL(url);
      return (await rules).isAllowed(`${target.pathname}${target.search}`);
    },
  };
}
