/**
 * Customer-facing copy for a Stripe decline. Shared by the server and the checkout page.
 * Codes we don't know still tell the person they were not charged.
 */
export function paymentFailureMessage(code?: string | null, declineCode?: string | null): string {
  const key = declineCode || code || "";
  switch (key) {
    case "insufficient_funds":
      return "The bank declined this card. There aren’t enough funds.";
    case "expired_card":
      return "This card is expired. Try another one.";
    case "incorrect_cvc":
    case "invalid_cvc":
      return "The security code doesn’t match. Check it and try again.";
    case "incorrect_number":
    case "invalid_number":
    case "invalid_expiry_month":
    case "invalid_expiry_year":
      return "Those card details don’t match. Check them and try again.";
    case "processing_error":
    case "issuer_not_available":
    case "try_again_later":
    case "reenter_transaction":
      return "The bank didn’t answer. You haven’t been charged — try again.";
    case "authentication_required":
    case "authentication_failure":
    case "payment_intent_authentication_failure":
      return "The bank check didn’t finish. You haven’t been charged — try again.";
    case "payment_intent_canceled":
    case "canceled":
      return "Payment cancelled. You haven’t been charged.";
    case "card_declined":
    case "generic_decline":
    case "do_not_honor":
    case "call_issuer":
    case "lost_card":
    case "stolen_card":
    case "pickup_card":
    case "restricted_card":
    case "card_velocity_exceeded":
      return "The bank declined this card. Try another one.";
    default:
      return "The payment didn’t go through. You haven’t been charged — try again.";
  }
}
