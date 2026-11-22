/**
 * Minimal robots.txt reader (RFC 9309 subset): groups by User-agent, Allow/Disallow with * and $ wildcards,
 * the longest matching rule wins and Allow wins a tie. Portable (no imports).
 */

type Rule = { allow: boolean; pattern: RegExp; length: number };

export type RobotsRules = { isAllowed(pathAndQuery: string): boolean };

const ALLOW_ALL: RobotsRules = { isAllowed: () => true };

function compile(path: string): RegExp {
  const escaped = path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped.endsWith("\\$") ? `${escaped.slice(0, -2)}$` : escaped}`);
}

/** @param agent the product token of our User-Agent, e.g. "Prezentoskop-LinkChecker". */
export function parseRobots(text: string, agent: string): RobotsRules {
  const token = agent.toLowerCase();
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current || (field !== "allow" && field !== "disallow")) continue;
    // An empty Disallow means "nothing is disallowed"; an empty Allow changes nothing.
    if (value === "") continue;
    current.rules.push({ allow: field === "allow", pattern: compile(value), length: value.length });
  }

  const specific = groups.filter((group) => group.agents.some((name) => name !== "*" && token.includes(name)));
  const chosen = specific.length > 0 ? specific : groups.filter((group) => group.agents.includes("*"));
  const rules = chosen.flatMap((group) => group.rules);
  if (rules.length === 0) return ALLOW_ALL;

  return {
    isAllowed(pathAndQuery) {
      let best: Rule | null = null;
      for (const rule of rules) {
        if (!rule.pattern.test(pathAndQuery)) continue;
        if (!best || rule.length > best.length || (rule.length === best.length && rule.allow)) best = rule;
      }
      return best ? best.allow : true;
    },
  };
}
