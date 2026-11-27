-- Searching the catalog for a card number with any set total ("100" or "100/...")
-- read every row. The plain index on card_number cannot serve a "starts with"
-- search under this database's language setting (en_US.UTF-8), so the search a
-- scanned card falls back to, and every "name number" search typed by hand, took
-- 1.0 to 1.4 s for the rows plus 1.0 s for the count, and failed outright for
-- people who are not signed in (their limit is 3 s). Measured Nov 27 2026 on
-- 53,394 rows.
--
-- A second index on the same column, compared character by character
-- (text_pattern_ops), lets the same search use an index. In a trial that was
-- rolled back the rows took 10 ms and the count 7 ms. The search itself is
-- unchanged: card_number ilike '100' or card_number ilike '100/%'.
--
-- Not partial on purpose: the planner cannot prove "card_number <> ''" from an
-- ILIKE, so a partial index like master_catalog_items_card_number_idx would be
-- skipped. Numbers that begin with a letter ("SWSH174") still read every row, as
-- before: ILIKE can only use the index for the part of the pattern with no letters.

create index if not exists master_catalog_items_card_number_prefix_idx
  on public.master_catalog_items (card_number text_pattern_ops);
