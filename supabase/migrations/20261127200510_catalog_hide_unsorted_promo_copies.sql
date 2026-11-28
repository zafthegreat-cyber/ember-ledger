-- Hide 16 pokemontcg.io promo cards that do not say which version they are. TCGplayer lists
-- each version as its own catalog card with its own price (Cosmos vs Cracked Ice Holo,
-- EX Deck Tin vs Target Promo, Detective Pikachu stamp vs In-Store Event, the four Battle Road
-- seasons of each Victory Cup, Vivillon High Plains vs Meadow), so these extra copies only
-- add confusion. Nothing user-owned points at them (checked 2026-11-27). Ids are unchanged;
-- they are only archived, so catalog_search_lightweight no longer shows them.
-- Kept visible: zsv10pt5-80 Antique Cover Fossil and neo2-11 Smeargle 1st Edition (no twin).

update public.master_catalog_items mci set
  archived_at = now(),
  updated_at = now()
from public.product_catalog pc
where pc.id = mci.legacy_product_catalog_id
  and mci.archived_at is null
  and pc.external_product_id in (
    'bwp-BW13', 'bwp-BW25', 'bwp-BW34', 'hsp-HGSS10', 'hsp-HGSS11',
    'bwp-BW29', 'bwp-BW30', 'bwp-BW31',
    'np-16', 'np-17', 'np-18', 'np-19',
    'smp-SM198', 'smp-SM199', 'smp-SM200',
    'xy1-17');
