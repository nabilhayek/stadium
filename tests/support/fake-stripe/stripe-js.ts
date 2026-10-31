/**
 * Minimal Stripe.js stand-in for Playwright. Served via page.route so checkout
 * never talks to js.stripe.com. confirmCardPayment hits the fake API server
 * through the app's own payment finalize path — this only fakes the browser SDK.
 */
export const FAKE_STRIPE_JS = `
window.Stripe = function Stripe(publishableKey) {
  function element() {
    return {
      mount: function () {},
      unmount: function () {},
      destroy: function () {},
      on: function () {},
      off: function () {},
      update: function () {},
    };
  }
  return {
    elements: function () {
      return {
        create: function () { return element(); },
        getElement: function () { return element(); },
      };
    },
    paymentRequest: function () {
      return {
        canMakePayment: async function () { return null; },
        on: function () {},
        off: function () {},
        show: function () {},
        update: function () {},
      };
    },
    // react-stripe-js validates the Stripe instance and rejects one missing these.
    createToken: async function () { return { error: { message: "unused" } }; },
    createPaymentMethod: async function () { return { error: { message: "unused" } }; },
    confirmCardPayment: async function (clientSecret) {
      return {
        paymentIntent: {
          id: String(clientSecret).split("_secret")[0],
          status: "succeeded",
          client_secret: clientSecret,
        },
        error: null,
      };
    },
  };
};
window.Stripe.version = "fake";
`;
