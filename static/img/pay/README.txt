PAYMENT LOGOS
Put the OFFICIAL logo files of each payment method in this folder. Use these exact file names:

  gcash.svg        maya.svg        paypal.svg
  visa.svg         mastercard.svg  jcb.svg

.png also works (example: gcash.png) if you don't have an SVG. A wide logo with a transparent background looks best.
Get them from each brand's own press / brand-kit page (GCash, Maya, PayPal, Visa, Mastercard, JCB) so the logos are the real ones and you are allowed to use them.

Until a file is added, the app shows the method's name in a neat badge, so nothing looks broken.
To add another wallet: add its name to PAYKEY in static/js/common.js, to WALLETS in static/js/checkout.js and in app.py (WALLETS; check_payment asks for a mobile number unless it is PayPal), then drop its logo here.
