# Recognizing cards by their picture: plan (Nov 19, 2026)

Status: groundwork only. `src/utils/cardImageHash.mjs` (fingerprint, distance,
nearest search) is in the repo with tests (`scripts/test-card-image-hash.mjs`).
Nothing is wired to a screen and no image data has been downloaded.

## Why

Today the card reader reads text: the name, number and set code. That fails on
worn or glare-covered text, Japanese and other languages, and cards where the
name is hard to read. A picture match helps there.

## How it would work

1. **Offline index.** A GitHub Action fingerprints each card's artwork box
   (`ART_BOX`) into a 64-bit difference hash. The output is
   `{ id, hash }` per card, about 30 bytes each: roughly 1.5 MB for 50,000
   cards before compression. It is published on the `market-history` branch
   (or a new `card-fingerprints` branch) and loaded only when someone scans.
2. **On the phone.** The card frame camera already gives an upright, cropped
   card. Fingerprint it the same way and run `nearestCards`.
3. **Combine with text.** Picture matches add to, and never replace, the text
   reader's suggestions. The person still picks the card. A picture match never
   decides the printing (holo, reverse, etc.).

Difference hashes are simple and fast, but they are weaker than a learned image
model. If accuracy isn't good enough, the next step is a small on-device
embedding model (about 5 to 15 MB). That is a bigger download and needs its own
approval.

## Decision needed from the owner

**Which images may be fingerprinted?** The index stores only fingerprints, never
the pictures. But making it means downloading each card image once in CI.
Options:

- **A. Official card images from a source whose terms allow it.** Best coverage,
  but someone has to read and accept the terms first.
- **B. Only images people upload themselves** (their own scans, with consent).
  No rights question, but coverage starts empty and grows slowly.
- **C. Skip picture matching** and keep improving the text reader.

Until this is decided, nothing is downloaded and the feature stays off.

## Next steps once decided

1. Write `scripts/build-card-fingerprints.mjs` (CI only) and its workflow.
2. Add a lazy loader for the index plus a "Looks like…" row in the card reader
   results.
3. Measure on 100 real phone photos and set `maxDistance` from the results.
