/** Minimal RFC 4180 CSV parser with delimiter detection. */

const CANDIDATE_DELIMITERS = [",", ";", "\t", "|"] as const;

export function detectDelimiter(text: string): string {
  const lineEnd = text.search(/\r?\n/);
  const headerLine = lineEnd === -1 ? text : text.slice(0, lineEnd);
  let best: string = ",";
  let bestCount = 0;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const count = headerLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

/** Rows as objects keyed by lowercased, trimmed header names. */
export function parseCsvRecords(input: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(input);
  if (!header) return [];
  const keys = header.map((key) => key.trim().toLowerCase());
  return rows.map((values) => {
    const record: Record<string, string> = {};
    keys.forEach((key, index) => {
      record[key] = (values[index] ?? "").trim();
    });
    return record;
  });
}
