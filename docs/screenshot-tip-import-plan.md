# Screenshot Tip Import

Screenshot Tip Import is a Scout beta feature for manually uploaded screenshots of Facebook posts, comments, Discord messages, or other restock tips the user is allowed to view.

## Safety Rules

- Do not scrape Facebook.
- Do not automate Facebook login.
- Do not pull from private groups automatically.
- Do not publish screenshots.
- Do not require usernames.
- Treat screenshots as user-provided data.
- Keep screenshots local for beta, with an option to avoid saving the image.
- Use backend environment variables for any future OCR or AI keys.

## Beta Step 1

- Add Upload Tip Screenshot in Scout.
- Show screenshot preview.
- Let the user manually review and fill report fields.
- Save as a Restock Report with `reportType: "facebook_screenshot"`.
- Count saved screenshot reports in store history, Daily Scout Report, Scout Score, and prediction patterns.

## Beta Step 2

- Add an Extract with AI placeholder.
- Keep the app working when no AI backend is configured.

## Later OCR/AI Step

- Send uploaded image to a backend OCR/AI service.
- Extract store, city, product, date, time, stock status, quantities, limits, source name, notes, and extraction confidence.
- Always show a review screen before saving.
- Let the user edit every extracted field, choose/create a store, choose/create a catalog product, mark verified, or reject the import.

## Future Data Fields

Restock reports should support:

- `reportType`
- `sourceName`
- `sourceFormat`
- `screenshotUrl` or `screenshotLocalId`
- `extractionConfidence`
- `userVerifiedExtraction`
- `originalText`
- `extractedJson`
- `createdFromScreenshot`

Future `tip_imports` records can track uploaded, extracted, reviewed, saved, and rejected import states.
