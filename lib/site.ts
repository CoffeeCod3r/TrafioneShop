/** Public facts about the site, used by the trust pages, the footer, the contact form and the legal pages. */
export const SITE_NAME = "Prezentoskop";
export const CONTACT_EMAIL = "kontakt@prezentoskop.pl";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
