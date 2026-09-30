# Kawama Storefront Agent Guide

## Project overview

Kawama is a modern, mobile-first home and kitchen e-commerce storefront for customers in Ghana. It brings product discovery, guided browsing, useful recommendations, cart management, sharing, and customer reviews into one calm shopping experience. Shoppers hand a completed order to the business through WhatsApp, where payment, delivery fees, and final confirmation happen.

This repository contains only the customer-facing storefront. The administration site will be created as a separate project. Do not add admin dashboards, product management, authentication, online payments, inventory administration, or order tracking here unless the user explicitly expands the scope.

## Product vision

Home and kitchen marketplaces often feel crowded, poorly categorized, and difficult to trust. Kawama should reduce that friction with clear product groupings, focused product information, relevant recommendations, and an uncomplicated path from discovery to ordering.

The primary audience is a mobile shopper who wants to understand an item quickly, compare a small number of sensible options, and place an order without creating an account. Every design and engineering choice should make that journey faster and clearer.

Success means that a first-time visitor can:

- Understand what Kawama sells from the first screen
- Reach a relevant category or product with minimal effort
- Judge a product from useful imagery, price, availability, details, and reviews
- Add, edit, and review an order without confusion
- Continue to WhatsApp with an accurate, readable order summary
- Return later without losing the cart

## Technology

- Angular 19 with standalone components and Angular Router
- TypeScript with strict compiler settings
- Tailwind CSS 4 through PostCSS
- Browser `localStorage` for the temporary cart and locally submitted demo reviews
- No backend is connected yet; use asynchronous repository-style services so local data can later be replaced by HTTP implementations

Preserve the existing Angular project structure, package manager, lockfile, and Tailwind setup. Avoid new dependencies unless they provide a clear requirement that cannot be met cleanly with Angular or browser APIs.

## Required customer journeys

The storefront should provide these routes and behaviors:

- `/`: storefront catalog with featured products, keyword search, category filters, and responsive product cards
- `/product/:slug`: product images, description, price, availability, rating summary, reviews, cart action, share action, and review link
- `/cart`: editable quantities, item removal, subtotal, customer details, and WhatsApp checkout
- `/review/:slug`: dedicated 1–5 star product review form with customer name, comment, validation, and success state
- A friendly not-found experience for invalid routes and unknown product slugs

The cart must survive a page reload. Treat malformed or obsolete local data as an empty/default state rather than allowing the application to crash.

The landing page should form one coherent discovery journey rather than a collection of unrelated marketing sections. Use this order as the default:

1. Compact header with Kawama identity, navigation, search, and cart status
2. Lifestyle-led hero with a direct shopping action
3. Visual category cards for common kitchen needs
4. New arrivals or featured product rail
5. Short editorial brand banner that explains Kawama's product promise
6. Main product catalog with search, category filtering, and clear product cards
7. Service reassurance focused on ordering support and delivery coordination
8. Recommendations derived from viewed categories and current cart contents
9. Genuine customer review highlights when review data is available
10. Focused promotional callout and a useful footer with configured contact/social links

Do not show fabricated audience counts, delivery promises, discounts, guarantees, testimonials, or trust claims. Benefits and promotions must come from configuration or real product data.

WhatsApp checkout must validate the customer's name, phone number, and delivery area/address. The generated message must include products, quantities, individual prices, subtotal, customer details, optional notes, and a statement that delivery charges will be confirmed in chat. Use an international-format number from centralized configuration and URL-encode the message.

Product sharing should use the native Web Share API when available and fall back to copying the canonical product URL to the clipboard. Always show useful success or failure feedback.

Recommendations in this client-only version should be deterministic and explainable. Prefer products that share a category with the current product or complement items in the cart, exclude unavailable products and the current item, and fall back to featured products. Do not claim that recommendations are AI-powered or personally profiled until a real recommendation service exists.

## Domain and data boundaries

Keep explicit TypeScript models for:

- `Product`
- `Review`
- `CartItem`
- `CheckoutDetails`
- `OrderDraft`

Product data includes an ID, stable slug, name, category, description, price in Ghanaian cedi, images, stock availability, featured state, and review information.

Support lightweight merchandising fields where the interface uses them, such as `isNew`, an optional compare-at price, compatible/complementary category IDs, and a short product-detail list. Never infer a discount that is not present in the data.

Page components should depend on catalog and review repository contracts rather than importing sample records directly. Local adapters may return realistic sample products and reviews now, but their public methods should be asynchronous and easy to replace with API calls later.

Centralize the business name, currency, WhatsApp number, Facebook URL, and Instagram URL in one environment-aware storefront configuration. Do not scatter contact details through templates. Hide missing social links, and do not treat a placeholder WhatsApp number as production-ready.

## Experience and design direction

Design for mobile shoppers first, while keeping desktop layouts intentional. The supplied screens are visual references only: translate their useful principles into Kawama rather than duplicating their copy, exact composition, or unsupported claims.

Use a refined lifestyle-commerce system built around:

- Deep forest green and dark teal as anchoring brand colors
- Warm cream and clean white backgrounds to keep the catalog calm
- Charcoal typography with restrained terracotta or warm metallic accents
- Large editorial kitchen photography paired with clean product cutouts
- Spacious grids, generous whitespace, rounded category imagery, subtle borders, and pill-shaped filters
- Bold, modern sans-serif display type balanced by compact, highly readable product metadata
- Mostly neutral controls with the Kawama green reserved for primary actions and active states
- Restrained hover, focus, cart, and section-transition motion that also respects reduced-motion preferences

The reference layout suggests a confident lifestyle hero, visual categories, product rails, an editorial brand banner, a dense catalog, reassurance cards, gallery content, reviews, a promotional panel, and a dark footer. Use those as a hierarchy and pacing reference. Keep the final Kawama interface original and ensure the actual commerce journey remains more important than decorative gallery content.

Keep the storefront practical:

- Make the lifestyle hero visually strong but keep its height controlled so products or category entry points remain discoverable without excessive scrolling
- Use touch targets of at least 44px where practical
- Keep body text at least 16px and regular interface labels at least 14px
- Preserve visible keyboard focus and semantic labels
- Provide meaningful image alternative text and stable image dimensions
- Support narrow phones, desktop widths, and 200% text enlargement without horizontal overflow
- Use clear loading, empty, unavailable, error, and success states
- Use Ghanaian cedi formatting consistently
- Keep product-card photography consistent in crop, background treatment, and aspect ratio
- Make filters horizontally scrollable on narrow screens and visibly identify the active state
- Avoid desktop-only carousel controls; all horizontal product/category rails must support touch scrolling and keyboard operation

Do not add dead links, fake testimonials, unsupported claims, or decorative controls that do not work.

The attached laptop mockup is presentation inspiration, not a page section or an instruction to render the website inside a device frame.

## Implementation conventions

- Prefer small standalone components organized by feature or shared UI responsibility
- Put business calculations and browser integrations in services or pure utilities, not templates
- Derive cart totals and review aggregates from source records rather than storing duplicate computed state
- Cap cart quantities at sensible positive integers and prevent ordering unavailable products
- Guard all browser-only APIs, including storage, sharing, and clipboard access
- Use reactive forms for checkout and review validation
- Keep product and review URLs stable by using slugs
- Preserve unrelated user changes in the working tree
- Implement recommendations as a pure, testable selector or service so a future backend recommender can replace it
- Use real buttons and links for interactive controls; do not use non-semantic containers with click handlers
- Prefer CSS scroll snapping for short visual rails, but use the normal responsive grid for the full catalog

## Verification

Before considering storefront work complete:

- Test search, category filtering, valid/invalid product navigation, and unavailable products
- Test recommendation relevance, exclusions, and featured-product fallback
- Test adding, incrementing, decrementing, removing, emptying, and restoring the cart
- Test checkout validation and the exact decoded WhatsApp message for single-item and multi-item carts
- Test native sharing, clipboard fallback, and failure feedback
- Test review validation, persistence, rating aggregation, and deep links
- Check keyboard navigation, focus visibility, form labels, contrast, alternative text, mobile overflow, and text enlargement
- Check horizontal rails with touch, keyboard, reduced motion, and narrow mobile viewports
- Run focused tests for cart calculations, filtering, review aggregation, and WhatsApp message generation
- Run `npm run build` and resolve production build failures

The real WhatsApp number, social profiles, logo, and production catalog are launch prerequisites and should be supplied through the centralized configuration/data boundaries rather than hard-coded into individual components.
