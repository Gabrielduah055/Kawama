# Kawama

The storefront reads its catalog, managed categories, and approved reviews from the Kawama API. Both local development and production use the Render service configured in `src/environments/environment.ts` and `src/environments/environment.production.ts`. Update both URLs if the Render service name changes.

## Paystack checkout

The cart initializes product payment with `POST /api/v1/checkout/sessions` and checks the result with `GET /api/v1/checkout/sessions/:checkoutToken`. The browser sends product IDs and quantities only. The backend recalculates the product total, reserves inventory, creates the Paystack transaction, and returns a hosted `authorizationUrl`.

Checkout uses Paystack's hosted page in the same tab. This frontend does not use the Paystack browser SDK, a public key, or any secret key. A versioned pending checkout and its idempotency key are kept in `sessionStorage` so uncertain retries reuse the same request instead of creating a second charge.

The result route is:

```text
http://localhost:4200/checkout/result
```

Set the backend `PAYSTACK_CALLBACK_URL` to that URL for local test-mode work, or to the corresponding deployed storefront URL in production. In the Paystack dashboard, configure the backend webhook as:

```text
https://YOUR-API-HOST/api/v1/webhooks/paystack
```

The Angular app must never call the webhook. A redirect or `reference`/`trxref` query parameter is not payment proof; only the backend's signed webhook, provider verification, and checkout status can mark an order paid. Use Paystack test mode for development and do not make live charges while testing.

Product payment excludes delivery. Delivery charges are quoted separately and coordinated after payment. WhatsApp is an optional post-payment contact action and a missing business WhatsApp number does not block checkout.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.25.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
