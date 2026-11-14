/**
 * Minimal, dependency-free XML parser for product feeds.
 * Handles elements, attributes, CDATA, comments, processing instructions and entities.
 * Not a validating parser: mismatched tags are recovered from on a best-effort basis.
 */

export type XmlNode = {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
};

const TOKEN =
  /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([^\s=>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    if (lower === "nbsp") return " ";
    const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];

  for (const match of source.matchAll(TOKEN)) {
    const [, cdata, closing, tagName, rawAttrs, selfClosing, text] = match;
    const current = stack[stack.length - 1];

    if (cdata !== undefined) {
      current.text += cdata;
    } else if (text !== undefined) {
      current.text += decodeEntities(text);
    } else if (tagName !== undefined) {
      if (closing) {
        const index = findLastIndex(stack, (node) => node.name === tagName);
        if (index > 0) stack.length = index;
        continue;
      }
      const node: XmlNode = { name: tagName, attrs: parseAttrs(rawAttrs ?? ""), children: [], text: "" };
      current.children.push(node);
      if (!selfClosing) stack.push(node);
    }
  }
  return root;
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [, key, doubleQuoted, singleQuoted] of raw.matchAll(ATTR)) {
    attrs[key] = decodeEntities(doubleQuoted ?? singleQuoted ?? "");
  }
  return attrs;
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (predicate(items[i])) return i;
  return -1;
}

/** All descendants with one of the given names (depth-first, document order). */
export function findAll(node: XmlNode, names: string[]): XmlNode[] {
  const wanted = new Set(names);
  const found: XmlNode[] = [];
  const queue: XmlNode[] = [...node.children].reverse();
  while (queue.length > 0) {
    const next = queue.pop()!;
    if (wanted.has(next.name)) {
      found.push(next);
      continue;
    }
    for (let i = next.children.length - 1; i >= 0; i--) queue.push(next.children[i]);
  }
  return found;
}

/** Direct child by the first matching name in priority order. */
export function child(node: XmlNode, names: string[]): XmlNode | undefined {
  for (const name of names) {
    const found = node.children.find((item) => item.name === name);
    if (found) return found;
  }
  return undefined;
}

/** Trimmed text of the first non-empty direct child among `names`. */
export function childText(node: XmlNode, names: string[]): string | undefined {
  for (const name of names) {
    for (const item of node.children) {
      if (item.name !== name) continue;
      const value = item.text.trim();
      if (value) return value;
    }
  }
  return undefined;
}
