Kawama Storefront Agent Guide
Purpose and scope
Kawama is a guest-shopping storefront for home and kitchen products in Ghana. Customers discover products, build a persistent cart, pay for products through the Paystack integration, and coordinate delivery with the business through WhatsApp.

This repository owns the customer experience. Backend APIs live in kawama-admin-backend; administration screens belong in kawamaAdmin-frontend.

Online product payments and a payment-result page are explicitly in scope. Do not reintroduce the old restriction against storefront payment integration. Keep administration, staff authentication, inventory administration, marketing automation and AI agents outside this repository unless the user requests them.

The catalog, review and backend-first Paystack checkout connections exist. The cart owns the payment form, `/checkout` redirects to it, and `/checkout/result` verifies the saved session against backend status. Confirm implementation status from source and keep these instructions current as work lands. Requirements below describe intended behavior, not a claim that every feature is implemented.
Stack and repository map
- Angular 19 standalone components, Angular Router, reactive forms and RxJS.
- Strict TypeScript and Tailwind CSS 4 through the existing PostCSS setup.
- Existing CSS design tokens, Montserrat typography, white/cream surfaces and orange/red primary accent. Preserve the current design rather than introducing a new theme.
- npm and the committed package-lock.json.
Location	Responsibility
src/app/pages	Route components and templates
src/app/shared	Reusable UI
src/app/services	HTTP repositories, cart, sharing and browser integrations
src/app/core	Domain models, endpoint helpers and storefront configuration
src/environments	API base URLs and centralized endpoint templates
src/styles	Shared layout and visual styles
src/app/data	Sample fixtures; not the live catalog or source of genuine reviews


Preserve repository structure and unrelated changes. Prefer existing Angular/browser capabilities over new dependencies.
Customer journeys
- /: categories, featured products, searchable catalog, recommendations, approved review highlights and support links.
- /shop: search, category filtering and sorting.
- /product/:slug: images, details, specifications, precise prices, availability, reviews, quantity controls and sharing.
- /cart: persistent items, editable quantities, subtotal and the primary checkout experience.
- /checkout: reuse the same checkout implementation or route to it; do not maintain independent payment forms.
- /checkout/result: add during payment integration, before the wildcard route.
- /review/:slug: validated review submission for moderation.
- /contact and a friendly not-found experience.
Use stable product/review slugs. Use Angular router fragments or explicit scrolling for in-page navigation: bare fragment links can resolve against the root base URL and leave the current route.
Backend contract
Treat current backend source, validation schemas, controllers and OpenAPI as authoritative. Inspect them before implementing integrations. Do not invent endpoints or response fields.

Use environment.apiBaseUrl and the existing endpoint-building helpers. The configured base already includes /api/v1; endpoint templates are relative:
Method	Path	Purpose
GET	/products	Paginated catalog
GET	/products/:slug	Product details
GET	/categories	Managed categories
GET	/products/:productId/reviews	Approved reviews
POST	/products/:productId/reviews	Submit a pending review
POST	/checkout/sessions	Initialize a product-payment checkout
GET	/checkout/sessions/:checkoutToken	Read server payment/fulfillment status


Catalog lists provide data and meta.page, meta.limit, meta.total. Normal responses wrap payloads in data. Errors use error.code, error.message, optional error.details and error.requestId.

The backend currently has no public product-by-ID lookup, aggregate review-highlights endpoint, payment verification-by-reference endpoint or checkout-cancellation endpoint. Request a deliberate API addition when needed; do not code against an imagined route.

Checkout POST requires an Idempotency-Key header and this shape:
{
  customer: {
    fullName: string;
    email: string;
    whatsappNumber: string;
    deliveryAddress: string;
    whatsappConsent: true;
  };
  orderNotes?: string;
  items: { productId: string; quantity: number }[];
}
Use actual MongoDB product IDs returned by the API. Send no prices, subtotal, currency, provider reference or unrelated client fields; the backend calculates the charge.

Match backend validation: trimmed name 2–120 characters; valid email up to 254; supported Ghana local or international WhatsApp number; address 5–500; optional notes up to 500; 1–20 unique product lines with integer quantities 1–20. Consent is explicit and unchecked by default.

A new checkout returns 201; an idempotent replay can return 200. data includes created, checkoutToken, orderNumber, paymentStatus, fulfillmentStatus, amountPesewas, currency and optional payment with reference, accessCode, authorizationUrl.

Status data includes orderNumber, paymentStatus, fulfillmentStatus, deliveryFeeStatus, amountPesewas, currency and optional receipt.number/receipt.url. It does not contain customer details, product lines or a payment URL. Keep payment, fulfillment and delivery status types separate.
Payment and delivery rules
- Product payment uses Paystack. Delivery is quoted separately and paid on delivery. Label the payable product amount clearly; an unquoted fee is not zero.
- Prefer the returned authorizationUrl for hosted, same-tab checkout. This path needs no Paystack browser SDK or public key. Secrets stay on the backend.
- The backend's signed webhook and provider verification determine payment success. Redirects, callback query parameters, local flags and browser callbacks are not payment proof.
- Generate a cryptographically random idempotency key, bind it to the submitted snapshot, and safely persist pending state before leaving the site. The current backend uses this key as checkoutToken.
- Retries after uncertain network outcomes reuse the same key and exact payload. Do not silently create a replacement charge or reuse an old key for changed details.
- `CHECKOUT_INITIALIZATION_UNCERTAIN` explicitly means the backend retained the original order/reference: keep the checkout active and retry with the same key. Never archive it or create a replacement key for that error.
- A recovered checkout may return `paymentStatus: needs_attention`; route customers to the status/manual-review experience and do not start another payment.
- Recover pending state on return/reload. Reference/trxref callback parameters are not checkout tokens. Missing context needs an honest recovery state.
- Recheck the status endpoint. Use bounded polling with teardown and a manual recheck option. A polling timeout means confirmation is pending.
- Handle pending, paid, failed, refunded, needs_attention, expired checkout and network errors explicitly. Returning from Paystack without paying does not cancel a server reservation.
- Only backend-confirmed paid status triggers confirmation and cart reconciliation. Remove purchased snapshot quantities once, preserving unrelated or subsequently added items.
- Resume an existing checkout instead of treating its own reserved stock as an unavailable new purchase.
- A blank business WhatsApp number must not block Paystack payment. Hide/disable only optional contact actions.
- After payment, WhatsApp coordinates delivery using the public order number. It must not submit a second purchase request or expose checkout tokens.
- Show receipt links only when supplied by the API. Do not promise automatic receipts, messages or delivery dates without implemented services.
Document PAYSTACK_CALLBACK_URL for the storefront result route and /api/v1/webhooks/paystack as the backend webhook path. Do not call the webhook from Angular or place the Paystack secret key in browser configuration.
Catalog, cart and money
Page components depend on repository services rather than importing sample records as live data.

Do not treat the first catalog page as the complete inventory. Load required pages using metadata, bounded concurrency and deduplication, or implement deliberate browsing pagination with separate cart resolution. Do not publish partial failures as a complete empty catalog.

Retain unavailable/unresolved saved items with an explanation and explicit removal action. Never silently remove a valid cart item because it was absent from one API page. Block a new payment until invalid lines are resolved, and let server validation make the final price/stock decision.

Guard localStorage, sessionStorage, window, navigator and clipboard access. Handle corrupt storage without crashing. Keep business calculations in services or pure utilities.

Product.price is expressed in cedis; payment amounts ending in Pesewas are integer pesewas. Use integer arithmetic for client totals and convert exactly once for display. Show consistent two-decimal GHS prices across cards, details, cart, checkout and WhatsApp. Never replace the server-calculated payable amount with a client calculation.
Reviews, recommendations and sharing
Reviews come from the API, submissions await moderation, and ratings derive from approved records. Do not publish submitted reviews locally as if already approved.

Homepage highlights must not conclude there are no reviews after inspecting only six products. Use existing review endpoints with bounded/cached background work until enough highlights are found or the relevant catalog is exhausted. Handle failures and cancel abandoned work. Do not claim global recency from a partial sample.

Recommendations are deterministic: prioritize matching/complementary categories, exclude unavailable products, the selected product and products already in the cart, then fall back to featured products. Do not label them AI-powered.

Use native Web Share when available, clipboard fallback on unsupported/failed sharing, and useful feedback. Respect a cancelled share without forcing a copy.

Do not fabricate reviews, discounts, audience counts, guarantees or delivery promises.
UI and implementation quality
Preserve the current homepage hierarchy and product presentation. Keep mobile and desktop layouts intentional, including touch/keyboard-scrollable product rails.

Use semantic buttons/links, labels, visible focus, meaningful alternative text, stable image dimensions and loading/empty/error/success states. Aim for 44px touch targets, readable text, reduced-motion support and no horizontal page overflow at narrow widths or enlarged text.

Prefer small standalone components, shared checkout logic, reactive forms and typed models. Clean up subscriptions, pending requests and polling. Keep contact/social links centralized in storefront configuration and hide missing optional links.
Verification and handoff
For implementation changes, run the relevant checks:
npm run build
npx tsc -p tsconfig.spec.json --noEmit
npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
The custom headless launcher is defined in karma.conf.cjs and needs an available Chrome binary; use CHROME_BIN when appropriate. Report environment blocks separately from test failures. A successful build or type check does not mean browser tests or payment verification passed.

Test meaningful affected behavior: pagination beyond 100 products; cart persistence and unavailable items; decimal money; fragment navigation; review moderation/highlights; recommendation exclusions; sharing fallback; exact checkout payloads; duplicate submits; idempotent retries; return/reload recovery; forged callback parameters; delayed payment confirmation; polling cleanup; and paid-cart reconciliation.

Use mocked HTTP for deterministic tests and Paystack test mode for configured end-to-end checks. Do not make live charges during development verification. Check mobile/desktop and keyboard behavior when UI changes.

For documentation-only changes, check accuracy, links and the diff rather than rerunning unrelated application tests.

Summarize what changed, what was actually verified and any remaining configuration or backend blockers. Backend price validation, concurrent inventory edits, late-payment reservations and scheduled cleanup cannot be fixed by pretending the frontend is authoritative; keep server work explicit.
