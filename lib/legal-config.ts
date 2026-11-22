/**
 * Operator data and decisions that the Regulamin and the Polityka prywatności need. FILL THIS IN (the only place):
 * every field that is still `null` shows as a yellow placeholder in the documents, and while any is missing the
 * "SZKIC DO WERYFIKACJI" banner stays. When everything is filled and `lawyerReviewed` is true, both disappear.
 */
export const LEGAL: {
  /** Full name or company name, e.g. "Michał Kowalski" (required: networks and the law want to see who runs the site). */
  ownerName: string | null;
  /** Street, number, postal code and city, e.g. "ul. Przykładowa 1, 45-000 Opole". */
  address: string | null;
  /** "NIP 1234567890, REGON 123456789"; use "" when the activity is not registered (the line is then left out). */
  taxId: string | null;
  /** Minimum age to use the site (digital consent age in Poland is 16). */
  minAge: number | null;
  /** Working days a bank may need to book a refund, e.g. 10. */
  refundDays: number | null;
  /** Retention periods, as text: e.g. "12 miesięcy". */
  retentionResults: string | null;
  retentionContact: string | null;
  retentionClicks: string | null;
  retentionPayments: string | null;
  /** Legal basis of transfers outside the EEA, e.g. "decyzji Komisji Europejskiej (EU-US Data Privacy Framework) oraz standardowych klauzul umownych". */
  transferBasis: string | null;
  /** Set to true only after a lawyer has checked both documents (refund from the pack, right of withdrawal). */
  lawyerReviewed: boolean;
} = {
  ownerName: null,
  address: null,
  taxId: null,
  minAge: null,
  refundDays: null,
  retentionResults: null,
  retentionContact: null,
  retentionClicks: null,
  retentionPayments: null,
  transferBasis: null,
  lawyerReviewed: false,
};

/** True when nothing is left to fill in, so the draft banner can go. */
export function isLegalComplete(): boolean {
  const { lawyerReviewed, ...fields } = LEGAL;
  return lawyerReviewed && Object.values(fields).every((value) => value !== null);
}
