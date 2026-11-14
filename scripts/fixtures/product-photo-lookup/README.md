# Local photo lookup regression fixture

This fixture exercises the actual product-photo component with public catalog
samples and a synthetic printed-card label. It contains no account, inventory,
private photo, screenshot, or credential data.

Start the app's Vite development server from the repository root. The local
preview path is `/scripts/fixtures/product-photo-lookup/preview.html`.
`scripts/test-product-photo-lookup-browser.mjs` uses port 5313 by default;
`APP_URL` can specify a different localhost server.

The existing public packaging sample is
`public/assets/inspection/destined-rivals-bundle-20261114f/bundle-398110175529-5.webp`.
The OCR worker and language model are served from the existing `public/ocr`
assets. Images are read locally, and reviewed lookup uses the bundled catalog.

The regression blocks external requests and non-GET/HEAD requests. It checks
real local OCR, explicit review, image-replacement invalidation, manual fallback,
phone/desktop overflow, and preservation of a synthetic saved record.
Generated screenshots and results remain under the ignored
`artifacts/product-photo-lookup-20261114` output directory.
