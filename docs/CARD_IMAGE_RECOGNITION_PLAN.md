# Recognizing cards by their picture: plan (Nov 19, 2026)

Status: option B is live (Nov 19, 2026). Fingerprints come only from the user's own
card scans, on their device. Nothing is downloaded and no photo is stored.

- `src/utils/cardPictureMemory.mjs`: remember/match/storage (key
  `code3.scanner.pictures.v1`, up to 600 entries, 3 photos per card), plus
  `fingerprintCardGray`, which finds the card edge before hashing the art box.
- `src/utils/cardPictureFingerprint.js`: decodes a photo on the device.
- Card scan (Add → Scan → Card): each photo is fingerprinted; earlier confirmed
  scans that look alike are offered as "Looks like a card you scanned before".
  Picking one searches for that card and puts it first.
- A fingerprint is saved only when the user adds the card to Collection,
  Business or Wants from the scan review (not for graded slabs).
- "Forget them" clears the memory.
- Tests: `scripts/test-card-picture-memory.mjs`.

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

## Decision (owner chose B on Nov 19, 2026)

**Which images may be fingerprinted?** The index stores only fingerprints, never
the pictures. But making it means downloading each card image once in CI.
Options:

- **A. Official card images from a source whose terms allow it.** Best coverage,
  but someone has to read and accept the terms first.
- **B. Only images people upload themselves** (their own scans, with consent).
  No rights question, but coverage starts empty and grows slowly.
- **C. Skip picture matching** and keep improving the text reader.

Option A can be added later as a CI step that writes fingerprints into the same
format, once the owner approves a source and its terms.

## Next steps

1. Measure on real phone photos (same card, different light and angle; different
   cards with similar art) and tune `maxDistance` (now 10 bits) from the results.
2. Only if option A is approved: `scripts/build-card-fingerprints.mjs` (CI only).
