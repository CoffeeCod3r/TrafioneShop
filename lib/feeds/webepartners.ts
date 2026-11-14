import { googleMerchantAdapter } from "./google-merchant.ts";

/**
 * WebePartners product feed. Assumed to be Google Merchant XML with tracked links;
 * verify against a real feed and switch to a custom parser if the format differs.
 */
export const webepartnersAdapter = googleMerchantAdapter("webepartners");
