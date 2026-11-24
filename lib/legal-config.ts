/**
 * Operator data and decisions that the Regulamin and the Polityka prywatności need. FILL THIS IN (the only place):
 * every field that is still `null` shows as a yellow placeholder in the documents, and while any is missing the
 * "SZKIC DO WERYFIKACJI" banner stays. When everything is filled and `lawyerReviewed` is true, both disappear.
 */
export const LEGAL: {
  ownerName: string | null;
  address: string | null;
  taxId: string | null;
  minAge: number | null;
  refundDays: number | null;
  retentionResults: string | null;
  retentionContact: string | null;
  retentionClicks: string | null;
  retentionPayments: string | null;
  transferBasis: string | null;
  lawyerReviewed: boolean;
  /** Hides the yellow "SZKIC" banner and the yellow "do weryfikacji" markers without claiming a lawyer checked the text. */
  hideDraftMarkers: boolean;
} = {
  ownerName: "Michał Stępczyński",
  // Adres do korespondencji (wirtualne biuro)
  address: "al. Solidarności 68/121, 00-240 Warszawa",
  // Działalność nierejestrowana: pusty tekst, linia z NIP/REGON nie wyświetla się
  taxId: "",
  minAge: 16,
  refundDays: 10,
  retentionResults: "12 miesięcy",
  retentionContact: "12 miesięcy",
  retentionClicks: "12 miesięcy",
  retentionPayments: "5 lat od końca roku podatkowego, w którym nastąpiła płatność",
  transferBasis:
    "decyzji Komisji Europejskiej (EU-US Data Privacy Framework) oraz standardowych klauzul umownych zatwierdzonych przez Komisję Europejską",
  // Nie zmieniaj na true bez sprawdzenia dokumentów przez prawnika
  lawyerReviewed: false,
  // Właściciel zdecydował o publikacji bez banera szkicu (23-24 listopada 2026). Ustaw false, by pokazać baner i żółte znaczniki.
  hideDraftMarkers: true,
};

/** True when nothing is left to fill in, so the draft banner can go. */
export function isLegalComplete(): boolean {
  const { lawyerReviewed, hideDraftMarkers, ...fields } = LEGAL;
  if (hideDraftMarkers) return true;
  return lawyerReviewed && Object.values(fields).every((value) => value !== null);
}