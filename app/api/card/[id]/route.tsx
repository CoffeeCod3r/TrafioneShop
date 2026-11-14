import { ImageResponse } from "next/og";

import { describeError, logEvent } from "@/lib/log";
import { CARD_HEIGHT, CARD_WIDTH } from "@/lib/og/card";
import { loadImageDataUri } from "@/lib/og/load-image";
import { RECIPIENT_OPTIONS } from "@/lib/quiz/schema";
import { getResultView } from "@/lib/results";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOWN_PRODUCTS = 3;

const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * GET /api/card/[id] – 1080×1920 PNG share card (stories format).
 * Contains only the result's text and catalog product images, never a photo of a person.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  try {
    const view = await getResultView(id);
    if (!view) return new Response("Not found", { status: 404 });

    const { result } = view;
    const recipient =
      RECIPIENT_OPTIONS.find((option) => option.value === result.recipient)?.label ?? "bliskiej osoby";
    const siteHost = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? request.url).host;
    const products = await Promise.all(
      view.products
        .filter((product) => product.in_stock)
        .slice(0, SHOWN_PRODUCTS)
        .map(async (product) => ({ ...product, image: await loadImageDataUri(product.image_url, request.url) })),
    );

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            padding: "96px 80px 80px",
            background: "linear-gradient(160deg, #FFF7ED 0%, #FDE68A 55%, #FCA5A5 100%)",
            color: "#1F2937",
            fontFamily: "Geist",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700 }}>
            <div
              style={{
                display: "flex",
                width: 64,
                height: 64,
                borderRadius: 18,
                background: "#1F2937",
                color: "#FDE68A",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 40,
              }}
            >
              P
            </div>
            Prezentownik AI
          </div>

          <div style={{ display: "flex", marginTop: 72, fontSize: 88, lineHeight: 1.08, letterSpacing: -2 }}>
            {`AI dobrało prezent dla: ${recipient}`}
          </div>

          {result.style_profile && (
            <div
              style={{
                display: "flex",
                marginTop: 48,
                padding: "36px 40px",
                borderRadius: 32,
                background: "rgba(255,255,255,0.75)",
                fontSize: 38,
                lineHeight: 1.35,
              }}
            >
              {truncate(result.style_profile, 220)}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 56 }}>
            {products.map((product) => (
              <div
                key={product.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 36,
                  padding: 28,
                  borderRadius: 32,
                  background: "#FFFFFF",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                }}
              >
                {product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> only
                  <img
                    src={product.image}
                    alt=""
                    width={220}
                    height={220}
                    style={{ borderRadius: 24, objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ display: "flex", width: 220, height: 220, borderRadius: 24, background: "#F3F4F6" }} />
                )}
                <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 16 }}>
                  <div style={{ display: "flex", fontSize: 40, lineHeight: 1.2 }}>{truncate(product.name, 60)}</div>
                  <div style={{ display: "flex", fontSize: 52, fontWeight: 700 }}>{pln.format(product.price_pln)}</div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "auto",
              justifyContent: "space-between",
              alignItems: "flex-end",
              fontSize: 36,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", fontSize: 28, color: "#4B5563" }}>Znajdź prezent w 60 sekund</div>
              <div style={{ display: "flex", fontWeight: 700 }}>{siteHost}</div>
            </div>
            {result.ref_code && (
              <div
                style={{
                  display: "flex",
                  padding: "14px 28px",
                  borderRadius: 999,
                  background: "#1F2937",
                  color: "#FFFFFF",
                  fontSize: 32,
                  letterSpacing: 4,
                }}
              >
                {result.ref_code}
              </div>
            )}
          </div>
        </div>
      ),
      {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
      },
    );
  } catch (error) {
    logEvent("card.failed", describeError(error));
    return new Response("Card unavailable", { status: 500 });
  }
}
