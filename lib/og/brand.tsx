import { ImageResponse } from "next/og";

/** Brand colors (same values as app/globals.css and public/logo.svg). */
export const BRAND = { paper: "#fff6f9", ink: "#1c1b3a", ribbon: "#e8336d", mint: "#bdefd9" } as const;

/** The logo mark (gift tag with a heart) as SVG markup; kept in sync with components/brand/logo.tsx. */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M6 5c5-2 9 1 10 6" fill="none" stroke="${BRAND.ribbon}" stroke-width="3" stroke-linecap="round"/><path d="M15.5 9.5 33 11.6a2.6 2.6 0 0 1 2.3 2.8l-1.4 18.2a2.6 2.6 0 0 1-2.9 2.4L13.9 33a2.6 2.6 0 0 1-2.3-2.8l1-13.3a2.6 2.6 0 0 1 .8-1.7l2.2-2.3" fill="${BRAND.mint}" stroke="${BRAND.ink}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="16.6" cy="14.6" r="1.9" fill="${BRAND.paper}" stroke="${BRAND.ink}" stroke-width="2"/><path d="M24 27.6s-5.2-3-5-6.4c.1-1.6 1.4-2.6 2.8-2.4 1 .1 1.8.8 2.2 1.6.5-.8 1.4-1.4 2.4-1.4 1.4 0 2.6 1.2 2.4 2.8-.3 3.3-4.8 5.8-4.8 5.8Z" fill="${BRAND.ribbon}" stroke="${BRAND.ink}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

export const markDataUri = `data:image/svg+xml;base64,${Buffer.from(MARK).toString("base64")}`;

/**
 * Noto Sans with Polish letters. next/og's built-in font has no Latin Extended (ą, ę, ł, ś, ż ...), so the
 * Latin-Extended subset is fetched when an image is generated. On any failure the images still render with the
 * built-in font (letters outside it show as boxes), never an error.
 */
async function loadFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "force-cache" });
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function ogFonts() {
  const base = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5.1.0/files/noto-sans";
  const [latin, latinExt] = await Promise.all([
    loadFont(`${base}-latin-700-normal.woff`),
    loadFont(`${base}-latin-ext-700-normal.woff`),
  ]);
  return [latin, latinExt].flatMap((data) =>
    data ? [{ name: "Noto Sans", data, weight: 700 as const, style: "normal" as const }] : [],
  );
}

/** A square icon: the logo mark on blush paper, with padding for maskable icons. */
export function iconImage(size: number, padding = 0.12): ImageResponse {
  const inner = Math.round(size * (1 - padding * 2));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND.paper }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri} width={inner} height={inner} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Share image (1200x630): logo, name and one line of text, in the brand colors. */
export async function ogImage(headline: string, subline: string): Promise<ImageResponse> {
  const fonts = await ogFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: BRAND.paper,
          color: BRAND.ink,
          fontFamily: "Noto Sans",
          border: `14px solid ${BRAND.ink}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markDataUri} width={96} height={96} alt="" />
          <div style={{ display: "flex", fontSize: 52, fontWeight: 700 }}>Prezentoskop</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: headline.length > 48 ? 60 : 76, fontWeight: 700, lineHeight: 1.1 }}>{headline}</div>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: BRAND.ribbon }}>{subline}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
