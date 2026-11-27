-- Maps pokemontcg.io catalog cards (product_catalog.market_source = 'PokemonTCGAPI', ids like sv3pt5-6)
-- to TCGplayer product ids from TCGCSV's public files, then merges them into the TCGCSV items they duplicate.
-- Run in the Supabase SQL editor, one numbered step at a time (steps 1-3 queue pg_net requests; wait
-- until `select count(*) from tcgmap.req r left join net._http_response h on h.id = r.request_id
-- where h.id is null` is 0 before the next step). No secrets: public endpoints only.
-- Schema side (search filter, pokemontcg.io refresh guard): migration 20261125120000.
--
-- Run of Nov 25 2026: 20,237 cards -> matched 19,938 (confident 19,335, plain 379, prefix 224), +175 in the
-- Nov 26 review pass (step 5b) = 20,113 merged; 124 left. Earlier counts:
-- unclear 193, unmatched 106. All 19,938 products were already TCGCSV items in the catalog.

-- 1. Scratch schema + TCGCSV group list --------------------------------------------------------
create schema if not exists tcgmap;
revoke all on schema tcgmap from public, anon, authenticated;
create table if not exists tcgmap.req (kind text, group_id int, request_id bigint, primary key (kind, group_id));
insert into tcgmap.req values ('groups', 0, net.http_get('https://tcgcsv.com/tcgplayer/3/groups', timeout_milliseconds := 60000))
on conflict do nothing;

-- 2. Groups -> products + prices files ------------------------------------------------------------
create table if not exists tcgmap.groups as
select (g->>'groupId')::int group_id, g->>'name' name, g->>'abbreviation' abbr, (g->>'publishedOn')::date published
from tcgmap.req r join net._http_response h on h.id = r.request_id, jsonb_array_elements(h.content::jsonb->'results') g
where r.kind = 'groups';
insert into tcgmap.req
select k, group_id, net.http_get(format('https://tcgcsv.com/tcgplayer/3/%s/%s', group_id, k), timeout_milliseconds := 90000)
from tcgmap.groups, unnest(array['products', 'prices']) k
on conflict do nothing;

-- 3. Normalisers, products, prices --------------------------------------------------------------
-- Number: part before "/", leading zeros dropped, letter prefix/suffix kept (TG01 -> TG1, SWSH001 -> SWSH1).
create or replace function tcgmap.normnum(t text) returns text language sql immutable as $$
  select case when t is null or btrim(t) = '' then null else
    (select upper(coalesce(m[1], '')) || coalesce(nullif(ltrim(m[2], '0'), ''), case when m[2] is not null then '0' end, '')
            || upper(coalesce(m[3], ''))
     from regexp_match(btrim(split_part(t, '/', 1)), '^([A-Za-z-]*?)0*([0-9]*)([A-Za-z]*)$') m) end $$;
-- Name: lowercase, accents/δ dropped, "(...)", "[...]" and " - 025/165" suffixes removed, letters+digits only.
create or replace function tcgmap.normname(t text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(
    regexp_replace(regexp_replace(t, '\s+-\s+[A-Za-z]*[0-9]+[A-Za-z]*(/[A-Za-z]*[0-9]+)?\s*$', ''), '\([^)]*\)|\[[^]]*\]', '', 'g')),
    'éèáíóúàâêôüñ’‘´`δ★', 'eeaiouaaeoun'''''''), '[^a-z0-9]', '', 'g') $$;

create table tcgmap.products as
select r.group_id, p->>'productId' product_id, p->>'name' name,
  (select e->>'value' from jsonb_array_elements(p->'extendedData') e where e->>'name' = 'Number' limit 1) number
from tcgmap.req r join net._http_response h on h.id = r.request_id, jsonb_array_elements(h.content::jsonb->'results') p
where r.kind = 'products';
alter table tcgmap.products add column nnum text, add column nname text;
update tcgmap.products set nnum = tcgmap.normnum(number), nname = tcgmap.normname(name);
create index on tcgmap.products (group_id, nnum);

create table tcgmap.prices as
select r.group_id, x->>'productId' product_id, x->>'subTypeName' sub, (x->>'marketPrice')::numeric market
from tcgmap.req r join net._http_response h on h.id = r.request_id, jsonb_array_elements(h.content::jsonb->'results') x
where r.kind = 'prices' and h.status_code = 200;
create index on tcgmap.prices (product_id);

-- 4. pokemontcg.io set -> TCGCSV group (num_prefix: card numbers with that prefix go to that group) --
create table tcgmap.setmap (set_code text, group_id int, num_prefix text);
insert into tcgmap.setmap (set_code, group_id) values
('base1',604),('base2',635),('base3',630),('base4',605),('base5',1373),('base6',1374),('basep',1418),('bp',1455),
('bw1',1400),('bw2',1424),('bw3',1385),('bw4',1412),('bw5',1386),('bw6',1394),('bw7',1408),('bw8',1413),('bw9',1382),('bw10',1370),('bw11',1409),('bwp',1407),
('cel25',2867),('cel25c',2931),('col1',1415),('dc1',1525),('det1',2409),
('dp1',1430),('dp2',1368),('dp3',1380),('dp4',1405),('dp5',1390),('dp6',1417),('dp7',1369),('dpp',1421),('dv1',1426),
('ecard1',1375),('ecard2',1397),('ecard3',1372),
('ex1',1393),('ex2',1392),('ex3',1376),('ex4',1377),('ex5',1416),('ex6',1419),('ex7',1428),('ex8',1404),('ex9',1410),('ex10',1398),('ex11',1429),('ex12',1378),('ex13',1379),('ex14',1395),('ex15',1411),('ex16',1383),
('fut20',2374),('g1',1728),('gym1',1441),('gym2',1440),
('hgss1',1402),('hgss2',1399),('hgss3',1403),('hgss4',1381),('hsp',1453),
('mcd11',1401),('mcd12',1427),('mcd14',1692),('mcd15',1694),('mcd16',3087),('mcd17',2148),('mcd18',2364),('mcd19',2555),('mcd21',2782),('mcd22',3150),
('me1',24380),('me2',24448),('me2pt5',24541),('me3',24587),
('neo1',1396),('neo2',1434),('neo3',1389),('neo4',1444),('np',1423),('pgo',3064),
('pl1',1406),('pl2',1367),('pl3',1384),('pl4',1391),
('pop1',1422),('pop2',1447),('pop3',1442),('pop4',1452),('pop5',1439),('pop6',1432),('pop7',1414),('pop8',1450),('pop9',1446),
('rsv10pt5',24326),('zsv10pt5',24325),('ru1',1433),('si1',648),
('sm1',1863),('sm2',1919),('sm3',1957),('sm35',2054),('sm4',2071),('sm5',2178),('sm6',2209),('sm7',2278),('sm75',2295),('sm8',2328),('sm9',2377),('sm10',2420),('sm11',2464),('sm115',2480),('sma',2594),('sm12',2534),('smp',1861),
('sv1',22873),('sv2',23120),('sv3',23228),('sv3pt5',23237),('sv4',23286),('sv4pt5',23353),('sv5',23381),('sv6',23473),('sv6pt5',23529),('sv7',23537),('sv8',23651),('sv8pt5',23821),('sv9',24073),('sv10',24269),('sve',24382),('svp',22872),
('swsh1',2585),('swsh2',2626),('swsh3',2675),('swsh35',2685),('swsh4',2701),('swsh45',2754),('swsh45sv',2781),('swsh5',2765),('swsh6',2807),('swsh7',2848),('swsh8',2906),('swsh9',2948),('swsh9tg',3020),('swsh10',3040),('swsh10tg',3068),('swsh11',3118),('swsh11tg',3172),('swsh12',3170),('swsh12tg',17674),('swsh12pt5',17688),('swsh12pt5gg',17689),('swshp',2545),
('tk1a',1543),('tk1b',1543),('tk2a',1542),('tk2b',1542),
('xy0',1522),('xy1',1387),('xy2',1464),('xy3',1481),('xy4',1494),('xy5',1509),('xy6',1534),('xy7',1576),('xy8',1661),('xy9',1701),('xy10',1780),('xy11',1815),('xy12',1842),('xyp',1451);
insert into tcgmap.setmap values ('bw11',1465,'RC'),('g1',1729,'RC');

-- 5. Match --------------------------------------------------------------------------------------
create table tcgmap.cards as
select pc.id pc_id, mci.id mci_id, pc.external_product_id ext, pc.set_code, pc.name, pc.card_number, pc.price_subtype,
  tcgmap.normnum(pc.card_number) nnum, tcgmap.normname(pc.name) nname,
  case pc.price_subtype when 'normal' then 'Normal' when 'holofoil' then 'Holofoil' when 'reverseHolofoil' then 'Reverse Holofoil'
    when '1stEdition' then '1st Edition' when '1stEditionHolofoil' then '1st Edition Holofoil'
    when 'unlimitedHolofoil' then 'Unlimited Holofoil' end tsub,
  (select sm.group_id from tcgmap.setmap sm where sm.set_code = pc.set_code
   order by (sm.num_prefix is not null and tcgmap.normnum(pc.card_number) like sm.num_prefix || '%') desc,
            sm.num_prefix is null desc limit 1) group_id
from public.product_catalog pc left join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
where pc.market_source = 'PokemonTCGAPI' and coalesce(pc.tcgplayer_product_id, '') = '';

create table tcgmap.cand as
select c.pc_id, p.product_id, p.name pname, p.number pnumber, (p.nname = c.nname) name_eq,
  (p.nname like c.nname || '%' or c.nname like p.nname || '%') name_prefix
from tcgmap.cards c join tcgmap.products p on p.group_id = c.group_id and p.nnum = c.nnum;

-- confident: one same-number product with the same name; prefix: the only same-number product, names
-- prefix-match; plain: several same-name products (ball/energy patterns) and exactly one without "(...)".
create table tcgmap.result as
with s as (
  select c.pc_id, count(k.*) n, count(*) filter (where k.name_eq) neq, count(*) filter (where k.name_prefix) npre,
    (array_agg(k.product_id) filter (where k.name_eq))[1] eq_pid,
    (array_agg(k.product_id) filter (where k.name_prefix))[1] pre_pid,
    count(*) filter (where k.name_eq and k.pname !~ '[(\[]') nplain,
    (array_agg(k.product_id) filter (where k.name_eq and k.pname !~ '[(\[]'))[1] plain_pid
  from tcgmap.cards c left join tcgmap.cand k on k.pc_id = c.pc_id group by c.pc_id)
select c.*,
  case when s.neq = 1 then s.eq_pid when s.neq = 0 and s.npre = 1 and s.n = 1 then s.pre_pid
       when s.neq > 1 and s.nplain = 1 then s.plain_pid end pick,
  case when s.n = 0 then 'unmatched' when s.neq = 1 then 'confident' when s.neq = 0 and s.npre = 1 and s.n = 1 then 'prefix'
       when s.neq > 1 and s.nplain = 1 then 'plain' else 'unclear' end status
from tcgmap.cards c join s using (pc_id);
alter table tcgmap.result add column sub_ok boolean;
update tcgmap.result r set sub_ok = exists (select 1 from tcgmap.prices p where p.product_id = r.pick and p.sub = r.tsub)
where pick is not null;
update tcgmap.result r set status = 'unclear_dup_claim'
where pick is not null and exists (select 1 from tcgmap.result o where o.pick = r.pick and o.pc_id <> r.pc_id);
update tcgmap.result set status = 'unclear_printing'
where status in ('confident', 'plain', 'prefix') and tsub like '1st%' and not sub_ok;

-- Review list:
-- select status, ext, name, card_number, price_subtype, group_id from tcgmap.result
-- where status not in ('confident', 'plain', 'prefix') order by status, ext;

-- 5b. Review pass (Nov 26 2026: 175 of the 193 unclear resolved; write them with step 6 using
--     `r.status like 'review_%'`). Rules, in order:
-- only product with that number in the set (special-energy abbreviations, spelling differences):
update tcgmap.result r set status = 'review_single', pick = (select k.product_id from tcgmap.cand k where k.pc_id = r.pc_id)
where status = 'unclear' and (select count(*) from tcgmap.cand k where k.pc_id = r.pc_id) = 1;
-- one same/prefix-named version that is not Staff or a [placing] (Prerelease vs Staff, base Worlds card):
with p as (
  select k.pc_id, count(*) filter (where k.pname !~ '\[' and k.pname !~* 'staff') n1,
    (array_agg(k.product_id) filter (where k.pname !~ '\[' and k.pname !~* 'staff'))[1] pid
  from tcgmap.cand k join tcgmap.result r using (pc_id)
  where r.status = 'unclear' and (k.name_eq or k.name_prefix) group by 1)
update tcgmap.result r set status = 'review_nonstaff', pick = p.pid from p where p.pc_id = r.pc_id and p.n1 = 1;
-- POP Holo / Non-Holo by the card's own printing:
with p as (
  select k.pc_id, k.product_id from tcgmap.cand k join tcgmap.result r using (pc_id)
  where r.status = 'unclear' and k.name_eq
    and ((r.price_subtype = 'holofoil' and k.pname ~ '\(Holo\)') or (r.price_subtype = 'normal' and k.pname ~ '\(Non-Holo\)')))
update tcgmap.result r set status = 'review_printing', pick = p.product_id from p where p.pc_id = r.pc_id;
-- hand-picked (Unown !/?, plain Professor's Research, basep-1 not the misprint, Worlds base/Participation,
-- trainer kits tk1a = Latias, tk1b = Latios):
update tcgmap.result r set status = 'review_manual', pick = v.pid
from (values ('ex10-!','90166'),('ex10-?','90167'),('sv8pt5-122','610477'),('sv8pt5-123','610478'),('sv8pt5-124','610479'),
  ('sv8pt5-125','610480'),('zsv10pt5-85','642533'),('basep-1','121772'),('xyp-XY27','96390'),('xyp-XY91','199311'),
  ('xyp-XY176','199330'),('hsp-HGSS18','90052'),('np-27','90050'),('np-36','90051'),('tk1a-8','88335'),('tk1a-9','85239'),
  ('tk1b-8','88336'),('tk1b-9','85240')) v(ext, pid)
where r.ext = v.ext and r.status = 'unclear';
update tcgmap.result r set sub_ok = exists (select 1 from tcgmap.prices p where p.product_id = r.pick and p.sub = r.tsub)
where status like 'review_%';
-- Left after review (124, still priced by pokemontcg.io): Cosmos vs Cracked Ice holo promos, Victory Cup seasons,
-- EX Deck Tin vs Target promos, stamped SM198-200, Vivillon xy1-17, zsv10pt5-80 (bad card number), neo2-11 1st Ed,
-- and 106 cards with no TCGCSV product of that number.

-- 6. Write (owner-approved Nov 25 2026): link ids, mark the API master item a duplicate of its TCGCSV twin --
begin;
create temp table _link on commit drop as
select r.pc_id, r.mci_id, r.pick pid, r.group_id, g.name group_name, r.tsub, r.sub_ok, tm.id twin_mci
from tcgmap.result r
join tcgmap.groups g on g.group_id = r.group_id
join public.product_catalog t on t.tcgplayer_product_id = r.pick and t.market_source = 'TCGCSV'
join public.master_catalog_items tm on tm.legacy_product_catalog_id = t.id
where r.status in ('confident', 'plain', 'prefix');

update public.product_catalog pc set
  tcgplayer_product_id = l.pid,
  source_group_id = l.group_id,
  source_group_name = l.group_name,
  price_subtype = case when l.sub_ok then l.tsub else pc.price_subtype end,
  updated_at = now()
from _link l
where pc.id = l.pc_id and coalesce(pc.tcgplayer_product_id, '') = '';

update public.master_catalog_items m set
  tcgplayer_product_id = l.pid,
  duplicate_of = l.twin_mci,
  archived_at = now()
from _link l
where m.id = l.mci_id and coalesce(m.tcgplayer_product_id, '') = '' and m.duplicate_of is null;
commit;

-- 7. Clean up once the review list is no longer needed:
-- drop schema tcgmap cascade;
