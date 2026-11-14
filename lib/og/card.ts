/** Share card size: 9:16 (stories/TikTok/Instagram). */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

export function cardUrl(resultId: string): string {
  return `/api/card/${resultId}`;
}
