/** Product as read from a feed, before validation. All fields are raw strings. */
export type RawProduct = {
  externalId?: string;
  name?: string;
  description?: string;
  /** e.g. "49.99", "49,99 PLN", "1 299,00 zł" */
  price?: string;
  currency?: string;
  category?: string;
  imageUrl?: string;
  /** Affiliate (tracked) link to the product. */
  url?: string;
  merchant?: string;
  inStock?: boolean;
};

export type FeedContext = {
  /** Used only as a merchant fallback (hostname). Never log the full URL. */
  sourceUrl: string;
};

export type FeedAdapter = {
  network: string;
  parse(body: string, context: FeedContext): RawProduct[];
};

export type FeedSource = { network: string; url: string };
