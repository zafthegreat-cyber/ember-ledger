-- Synthetic transactional test template. Never execute against real namespaces.
-- Coordinator assembles ONE transaction by replacing the exact insertion-marker
-- line below with schema.sql after these source-text namespace substitutions:
--   code3_ebay_private -> code3_ebay_test_20261020
--   code3_sync_private -> code3_ebay_sync_test_20261020
--   public. -> code3_ebay_public_test_20261020.
-- Remove schema.sql's standalone begin;/commit; lines before insertion.
-- All tables below are synthetic; no auth.users/owner/customer record is touched.
-- Failure aborts the transaction. Success is followed by ROLLBACK and no residue.
begin;
set local statement_timeout='90s';
create schema code3_ebay_sync_test_20261020;
create schema code3_ebay_public_test_20261020;
grant usage on schema code3_ebay_public_test_20261020 to service_role,authenticated,anon;
create function code3_ebay_public_test_20261020.has_full_app_access() returns boolean language sql stable as $$ select true; $$;
create table code3_ebay_sync_test_20261020.workspaces (
  owner_id uuid primary key,revision bigint not null default 0,sources jsonb not null default '{}',updated_at timestamptz not null default now()
);
create table code3_ebay_sync_test_20261020.workspace_revisions (
  owner_id uuid not null,revision bigint not null,expected_revision bigint not null,mutation_id uuid not null,sources jsonb not null,created_at timestamptz not null default now(),
  primary key(owner_id,revision),unique(owner_id,mutation_id)
);
create table code3_ebay_public_test_20261020.code3_records (
  id uuid primary key,external_provider text,external_id text,source_url text,metadata jsonb not null,
  amount_minor bigint,quantity bigint,owner_subject text,record_version bigint not null default 1
);
create function code3_ebay_sync_test_20261020.require_workspace_account() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid; $$;
create function code3_ebay_sync_test_20261020.write_workspace(p_expected_revision bigint,p_sources jsonb,p_mutation_id uuid)
returns jsonb language plpgsql as $$ declare account_id uuid; begin
  account_id := code3_ebay_sync_test_20261020.require_workspace_account();
  return p_sources;
end; $$;

-- __ISOLATED_SCHEMA_SQL__

create temporary table ebay_sql_test_results(name text primary key,passed boolean not null);
create function pg_temp.assert_ebay(p_name text,p_ok boolean) returns void language plpgsql as $$ begin
  if p_ok is not true then raise exception 'eBay SQL assertion failed: %',p_name; end if;
  insert into ebay_sql_test_results values(p_name,true);
end; $$;
create function pg_temp.ebay_payload(p_id text,p_user text,p_name text default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('metadata',jsonb_build_object('topic','MARKETPLACE_ACCOUNT_DELETION','schemaVersion','1.0','deprecated',false),
    'notification',jsonb_build_object('notificationId',p_id,'eventDate','2026-10-20T00:00:00Z','publishAttemptCount',1,
      'data',jsonb_strip_nulls(jsonb_build_object('userId',p_user,'username',p_name))));
$$;

-- eBay APIs are never called. These are invented seller/product names and URLs.
insert into code3_ebay_sync_test_20261020.workspaces(owner_id,revision,sources) values
('00000000-0000-4000-8000-000000000001',1,jsonb_build_object(
 'deal-finder',jsonb_build_object('schemaVersion',8,'data',jsonb_build_object(
  'providerListings',jsonb_build_array(
    jsonb_build_object('id','listing-row-a','providerId','ebay','externalListingId','synthetic-listing-a','sellerName','SyntheticSellerA','sellerRating','99.0','sellerFeedbackScore',10,'listingUrl','https://www.ebay.com/itm/synthetic-a','description','Provider description A','location','Synthetic city A','imageReferences',jsonb_build_array('https://i.ebayimg.com/synthetic-a.jpg'),'title','Synthetic booster box','askingPrice',123.45,'priceCurrency','USD'),
    jsonb_build_object('id','listing-row-b','providerId','ebay','externalListingId','synthetic-listing-b','sellerName','SyntheticSellerB','listingUrl','https://www.ebay.com/itm/synthetic-b','title','Different seller item','askingPrice',222.22)),
  'deals',jsonb_build_array(jsonb_build_object('id','deal-a','providerId','ebay','externalListingId','synthetic-listing-a','sellerName','SyntheticSellerA','notes','Owner entered note','purchasePrice',111.11,'expectedResaleMidpoint',160.25,'title','Owner product title')),
  'appraisals',jsonb_build_array(jsonb_build_object('id','analysis-a','recordType','CODE3_INTELLIGENCE_ANALYSIS','inputHash','historic-input-hash','sourceInput',jsonb_build_object(
    'identity',jsonb_build_object('productName','Owner-entered card title','source','OWNER_ENTERED'),
    'sourceReference','https://www.ebay.com/itm/synthetic-a',
    'sourceEvidence',jsonb_build_array(jsonb_build_object('providerId','ebay','sourceId','ebay:synthetic-listing-a','externalIdentity',jsonb_build_object('externalListingId','synthetic-listing-a','listingUrl','https://www.ebay.com/itm/synthetic-a'),
      'observations',jsonb_build_array(jsonb_build_object('observationType','SELLER_NAME','value','SyntheticSellerA'),jsonb_build_object('observationType','LOCATION','value','Synthetic city A')))),
    'images',jsonb_build_array(jsonb_build_object('imageId','owner-front','reference','owner-photo','provenance','OWNER_ENTERED'),jsonb_build_object('imageId','provider-image','reference','provider-photo','provenance',jsonb_build_object('providerId','ebay','sourceId','ebay:synthetic-listing-a')))))),
  'inventory',jsonb_build_array(jsonb_build_object('id','owned-a','title','Owned item','quantity',5,'unitCostMinor',1001,'currentMarketPrice',77.77)),
  'sales',jsonb_build_array(jsonb_build_object('id','sale-a','inventoryId','owned-a','quantity',1,'netMinor',2002))
 )),
 'manual-market-price-cache',jsonb_build_object('schemaVersion',0,'data',jsonb_build_object('independent-price',99.99))
));
insert into code3_ebay_sync_test_20261020.workspace_revisions(owner_id,revision,expected_revision,mutation_id,sources)
select owner_id,1,0,'00000000-0000-4000-8000-000000000101',sources from code3_ebay_sync_test_20261020.workspaces;
insert into code3_ebay_public_test_20261020.code3_records(id,external_provider,external_id,source_url,metadata,amount_minor,quantity,owner_subject)
values('00000000-0000-4000-8000-000000000201','ebay','synthetic-listing-a','https://www.ebay.com/itm/synthetic-a',
  '{"sellerName":"SyntheticSellerA","title":"Owned product identity","purchaseCostMinor":1001,"currentMarketPrice":77.77}',1001,5,'synthetic:owner-a');
create temporary table ebay_before as select sources from code3_ebay_sync_test_20261020.workspaces;
create temporary table ebay_canonical_before as select * from code3_ebay_public_test_20261020.code3_records;

select pg_temp.assert_ebay('service accept permitted',has_function_privilege('service_role','code3_ebay_public_test_20261020.code3_ebay_accept_notification(text,jsonb,text)','EXECUTE'));
select pg_temp.assert_ebay('anonymous accept denied',not has_function_privilege('anon','code3_ebay_public_test_20261020.code3_ebay_accept_notification(text,jsonb,text)','EXECUTE'));
select pg_temp.assert_ebay('authenticated accept denied',not has_function_privilege('authenticated','code3_ebay_public_test_20261020.code3_ebay_accept_notification(text,jsonb,text)','EXECUTE'));
select pg_temp.assert_ebay('authenticated tombstone RPC permitted',has_function_privilege('authenticated','code3_ebay_public_test_20261020.code3_ebay_privacy_tombstones(bigint,integer)','EXECUTE'));
select pg_temp.assert_ebay('anonymous tombstone RPC denied',not has_function_privilege('anon','code3_ebay_public_test_20261020.code3_ebay_privacy_tombstones(bigint,integer)','EXECUTE'));
select pg_temp.assert_ebay('no direct authenticated tombstone access',not has_table_privilege('authenticated','code3_ebay_test_20261020.identity_tombstones','SELECT'));
select pg_temp.assert_ebay('private tombstone RLS', (select relrowsecurity from pg_class where oid='code3_ebay_test_20261020.identity_tombstones'::regclass));
select pg_temp.assert_ebay('cloud lock precedes owner lock',position('perform code3_ebay_test_20261020.privacy_lock(); account_id :=' in pg_get_functiondef('code3_ebay_sync_test_20261020.write_workspace(bigint,jsonb,uuid)'::regprocedure))>0);

do $$ declare response jsonb; blocked boolean:=false; begin
  response:=code3_ebay_public_test_20261020.code3_ebay_accept_notification('synthetic-event-a',pg_temp.ebay_payload('synthetic-event-a','synthetic-user-a','SyntheticSellerA'),repeat('a',64));
  perform pg_temp.assert_ebay('durable acceptance',response->>'status'='accepted' and response->'durableReceipt'='true'::jsonb);
  response:=code3_ebay_public_test_20261020.code3_ebay_accept_notification('synthetic-event-a',pg_temp.ebay_payload('synthetic-event-a','synthetic-user-a','SyntheticSellerA') || '{"retry":true}'::jsonb,repeat('b',64));
  perform pg_temp.assert_ebay('duplicate delivery accepts retry-byte change',response->>'status'='duplicate' and (select receive_count=2 from code3_ebay_test_20261020.notification_inbox where event_id='synthetic-event-a'));
  begin perform code3_ebay_public_test_20261020.code3_ebay_accept_notification('synthetic-event-a',pg_temp.ebay_payload('synthetic-event-a','different-user','DifferentSeller'),repeat('c',64));
  exception when sqlstate '22023' then blocked:=true; end;
  perform pg_temp.assert_ebay('event ID cannot be reused for another identity',blocked);
  perform pg_temp.assert_ebay('raw seller identity not retained',position('SyntheticSellerA' in (select row_to_json(n)::text from code3_ebay_test_20261020.notification_inbox n where event_id='synthetic-event-a'))=0);
  perform pg_temp.assert_ebay('identity hash exact and case-sensitive',code3_ebay_test_20261020.identity_hash('username','SyntheticSellerA')<>code3_ebay_test_20261020.identity_hash('username','syntheticsellera'));
  response:=code3_ebay_public_test_20261020.code3_ebay_process_notification('synthetic-event-a');
  perform pg_temp.assert_ebay('matched job processed',response->>'status'='processed');
  perform pg_temp.assert_ebay('one current workspace scrubbed',(response->>'workspace_rows')::int=1);
  perform pg_temp.assert_ebay('one prior history scrubbed',(response->>'history_rows')::int=1);
  perform pg_temp.assert_ebay('one canonical source scrubbed',(response->>'canonical_rows')::int=1);
end $$;

select pg_temp.assert_ebay('owner inventory unchanged', (select sources#>'{deal-finder,data,inventory}' from ebay_before)=(select sources#>'{deal-finder,data,inventory}' from code3_ebay_sync_test_20261020.workspaces));
select pg_temp.assert_ebay('financial sales unchanged', (select sources#>'{deal-finder,data,sales}' from ebay_before)=(select sources#>'{deal-finder,data,sales}' from code3_ebay_sync_test_20261020.workspaces));
select pg_temp.assert_ebay('independent prices unchanged',(select sources->'manual-market-price-cache' from ebay_before)=(select sources->'manual-market-price-cache' from code3_ebay_sync_test_20261020.workspaces));
select pg_temp.assert_ebay('asking price unchanged',(select sources#>>'{deal-finder,data,providerListings,0,askingPrice}' from code3_ebay_sync_test_20261020.workspaces)='123.45');
select pg_temp.assert_ebay('record ID unchanged',(select sources#>>'{deal-finder,data,providerListings,0,id}' from code3_ebay_sync_test_20261020.workspaces)='listing-row-a');
select pg_temp.assert_ebay('other seller unchanged',(select sources#>'{deal-finder,data,providerListings,1}' from ebay_before)=(select sources#>'{deal-finder,data,providerListings,1}' from code3_ebay_sync_test_20261020.workspaces));
select pg_temp.assert_ebay('target seller absent in current',(select position('SyntheticSellerA' in sources::text)=0 from code3_ebay_sync_test_20261020.workspaces));
select pg_temp.assert_ebay('target listing URL removed from current',(select position('https://www.ebay.com/itm/synthetic-a' in sources::text)=0 from code3_ebay_sync_test_20261020.workspaces));
select pg_temp.assert_ebay('target seller absent in every history',not exists(select 1 from code3_ebay_sync_test_20261020.workspace_revisions where position('SyntheticSellerA' in sources::text)>0));
select pg_temp.assert_ebay('new revision published', (select revision=2 from code3_ebay_sync_test_20261020.workspaces) and (select count(*)=2 from code3_ebay_sync_test_20261020.workspace_revisions));
select pg_temp.assert_ebay('new current matches revision bytes',(select w.sources=r.sources from code3_ebay_sync_test_20261020.workspaces w join code3_ebay_sync_test_20261020.workspace_revisions r using(owner_id,revision)));
select pg_temp.assert_ebay('owner analysis image retained',(select sources#>>'{deal-finder,data,appraisals,0,sourceInput,images,0,reference}' from code3_ebay_sync_test_20261020.workspaces)='owner-photo');
select pg_temp.assert_ebay('provider analysis image removed',(select jsonb_array_length(sources#>'{deal-finder,data,appraisals,0,sourceInput,images}') from code3_ebay_sync_test_20261020.workspaces)=1);
select pg_temp.assert_ebay('analysis marked without forged hash',(select sources#>>'{deal-finder,data,appraisals,0,inputHash}'='historic-input-hash' and sources#>'{deal-finder,data,appraisals,0,ebayPrivacyRedacted}'='true'::jsonb from code3_ebay_sync_test_20261020.workspaces));
select pg_temp.assert_ebay('canonical ledger values preserved',(select r.id=b.id and r.quantity=b.quantity and r.amount_minor=b.amount_minor and r.owner_subject=b.owner_subject and r.metadata->'purchaseCostMinor'=b.metadata->'purchaseCostMinor' and r.metadata->'currentMarketPrice'=b.metadata->'currentMarketPrice' from code3_ebay_public_test_20261020.code3_records r cross join ebay_canonical_before b));
select pg_temp.assert_ebay('canonical source identities cleared',(select external_id is null and source_url is null and not metadata ? 'sellerName' from code3_ebay_public_test_20261020.code3_records));
select pg_temp.assert_ebay('listing tombstone derived',exists(select 1 from code3_ebay_test_20261020.identity_tombstones where kind='listingId' and identity_hash=code3_ebay_test_20261020.identity_hash('listingId','synthetic-listing-a')));
select pg_temp.assert_ebay('different seller listing not tombstoned',not exists(select 1 from code3_ebay_test_20261020.identity_tombstones where kind='listingId' and identity_hash=code3_ebay_test_20261020.identity_hash('listingId','synthetic-listing-b')));
select pg_temp.assert_ebay('processor allowance removed',not exists(select 1 from code3_ebay_test_20261020.processing_transactions));

do $$ declare mixed jsonb; rewritten jsonb; unrelated jsonb; image_b jsonb; valuation_b jsonb; fallback_a jsonb; fallback_b jsonb; begin
  unrelated:='{"providerId":"ebay","sourceId":"ebay:synthetic-listing-b","externalIdentity":{"externalListingId":"synthetic-listing-b","listingUrl":"https://www.ebay.com/itm/synthetic-b"},"observations":[{"observationType":"SELLER_NAME","value":"SyntheticSellerB"}]}'::jsonb;
  image_b:='{"imageId":"provider-B","reference":"https://i.ebayimg.com/synthetic-B.jpg","provenance":{"providerId":"ebay","sourceId":"ebay:synthetic-listing-b","independenceKey":"ebay:synthetic-listing-b"}}'::jsonb;
  valuation_b:='{"evidenceId":"ebay:synthetic-listing-b:asking_price","type":"ACTIVE_LISTING","sourceId":"ebay:synthetic-listing-b","underlyingSourceId":"ebay:synthetic-listing-b","amount":{"minorUnits":22222,"currency":"USD"},"provenance":{"providerId":"ebay","sourceId":"ebay:synthetic-listing-b","independenceKey":"ebay:synthetic-listing-b"}}'::jsonb;
  mixed:=jsonb_build_object('id','analysis-two-sellers','sourceInput',jsonb_build_object('sourceReference','https://www.ebay.com/itm/synthetic-b','images',jsonb_build_array(image_b),'valuationEvidence',jsonb_build_array(valuation_b),'sourceEvidence',jsonb_build_array(
    '{"providerId":"ebay","sourceId":"ebay:synthetic-listing-a","externalIdentity":{"externalListingId":"synthetic-listing-a"},"observations":[{"observationType":"SELLER_NAME","value":"SyntheticSellerA"}]}'::jsonb,unrelated)));
  rewritten:=code3_ebay_test_20261020.redact(mixed);
  perform pg_temp.assert_ebay('another seller evidence in same analysis unchanged',rewritten#>'{sourceInput,sourceEvidence,1}'=unrelated);
  perform pg_temp.assert_ebay('selected unrelated seller sourceReference unchanged',rewritten#>>'{sourceInput,sourceReference}'='https://www.ebay.com/itm/synthetic-b');
  perform pg_temp.assert_ebay('unrelated seller image/provenance unchanged',rewritten#>'{sourceInput,images,0}'=image_b);
  perform pg_temp.assert_ebay('unrelated seller full valuation evidence unchanged',rewritten#>'{sourceInput,valuationEvidence,0}'=valuation_b);
  perform pg_temp.assert_ebay('canonical mixed selected B pointer and ID unchanged',
    code3_ebay_test_20261020.redact(jsonb_build_object('id','canonical-mixed','external_provider','ebay','externalListingId','synthetic-listing-b','sourceReference','https://www.ebay.com/itm/synthetic-b','metadata',mixed))->>'sourceReference'='https://www.ebay.com/itm/synthetic-b'
    and code3_ebay_test_20261020.redact(jsonb_build_object('id','canonical-mixed','external_provider','ebay','externalListingId','synthetic-listing-b','sourceReference','https://www.ebay.com/itm/synthetic-b','metadata',mixed))->>'externalListingId'='synthetic-listing-b');
  perform pg_temp.assert_ebay('another seller listing not collected from container',not exists(select 1 from code3_ebay_test_20261020.linked_listings(mixed) i where i.identity_hash=code3_ebay_test_20261020.identity_hash('listingId','synthetic-listing-b')));
  perform pg_temp.assert_ebay('plain owner userId cannot match seller',code3_ebay_test_20261020.redact('{"id":"owner-record","userId":"synthetic-user-a","title":"Owned product"}')='{"id":"owner-record","userId":"synthetic-user-a","title":"Owned product"}'::jsonb);
  perform pg_temp.assert_ebay('forged redaction marker does not bypass',not code3_ebay_test_20261020.redact('{"id":"forged","providerId":"ebay","sellerName":"SyntheticSellerA","ebayPrivacyRedacted":true}') ? 'sellerName');
  perform pg_temp.assert_ebay('event scope excludes a different identity',code3_ebay_test_20261020.redact('{"id":"b","providerId":"ebay","sellerName":"SyntheticSellerB"}',false,false,0,'synthetic-event-a')='{"id":"b","providerId":"ebay","sellerName":"SyntheticSellerB"}'::jsonb);
  fallback_a:='{"providerId":"ebay","sourceId":"ebay:unidentified:listing","observations":[{"observationType":"SELLER_NAME","value":"SyntheticSellerA"}]}'::jsonb;
  fallback_b:='{"providerId":"ebay","sourceId":"ebay:unidentified:listing","observations":[{"observationType":"SELLER_NAME","value":"SyntheticSellerB"}]}'::jsonb;
  perform pg_temp.assert_ebay('unidentified fallback is not a listing identity',not exists(select 1 from code3_ebay_test_20261020.identities(fallback_a) i where i.kind='listingId'));
  perform pg_temp.assert_ebay('unidentified fallback cannot create shared listing tombstone',not exists(select 1 from code3_ebay_test_20261020.linked_listings(fallback_a)));
  rewritten:=code3_ebay_test_20261020.redact(jsonb_build_object('id','fallback-analysis','sourceInput',jsonb_build_object('sourceEvidence',jsonb_build_array(fallback_a,fallback_b))));
  perform pg_temp.assert_ebay('unidentified other seller remains exact',rewritten#>'{sourceInput,sourceEvidence,1}'=fallback_b);
end $$;

do $$ declare blocked boolean; response jsonb; previous_revision bigint; begin
  blocked:=false;
  begin update code3_ebay_sync_test_20261020.workspaces set sources=(select sources from ebay_before);
  exception when sqlstate '22023' then blocked:=sqlerrm='ebay_privacy_refresh_required'; end;
  perform pg_temp.assert_ebay('stale workspace upload rejected',blocked);
  blocked:=false;
  begin update code3_ebay_sync_test_20261020.workspace_revisions set sources=(select sources from ebay_before) where revision=1;
  exception when sqlstate '22023' then blocked:=sqlerrm='ebay_privacy_refresh_required'; end;
  perform pg_temp.assert_ebay('stale history upload rejected',blocked);
  blocked:=false;
  begin update code3_ebay_public_test_20261020.code3_records set metadata=(select metadata from ebay_canonical_before);
  exception when sqlstate '22023' then blocked:=sqlerrm='ebay_privacy_refresh_required'; end;
  perform pg_temp.assert_ebay('stale canonical restore rejected',blocked);
  select revision into previous_revision from code3_ebay_sync_test_20261020.workspaces;
  response:=code3_ebay_public_test_20261020.code3_ebay_process_notification('synthetic-event-a');
  perform pg_temp.assert_ebay('repeat processing idempotent',response->>'status'='already_processed' and previous_revision=(select revision from code3_ebay_sync_test_20261020.workspaces));
  perform code3_ebay_public_test_20261020.code3_ebay_accept_notification('synthetic-unmapped',pg_temp.ebay_payload('synthetic-unmapped','unmapped-synthetic-user'),repeat('d',64));
  response:=code3_ebay_public_test_20261020.code3_ebay_process_notification('synthetic-unmapped');
  perform pg_temp.assert_ebay('unmapped identity requires review',response->>'status'='needs_review' and (select processed_at is null and last_error_code='identity_unmapped' from code3_ebay_test_20261020.notification_inbox where event_id='synthetic-unmapped'));
  perform pg_temp.assert_ebay('unknown identity still tombstoned',exists(select 1 from code3_ebay_test_20261020.identity_tombstones where kind='userId' and identity_hash=code3_ebay_test_20261020.identity_hash('userId','unmapped-synthetic-user')));
  perform pg_temp.assert_ebay('no re-erasure on unmapped event',previous_revision=(select revision from code3_ebay_sync_test_20261020.workspaces));
end $$;

do $$ declare blocked boolean; response jsonb; malformed jsonb; begin
  blocked:=false;
  begin perform code3_ebay_public_test_20261020.code3_ebay_accept_notification(null,pg_temp.ebay_payload('invalid','u'),repeat('a',64));
  exception when sqlstate '22023' then blocked:=true; end;
  perform pg_temp.assert_ebay('null event rejected',blocked);
  blocked:=false;
  begin perform code3_ebay_public_test_20261020.code3_ebay_accept_notification('bad-topic',jsonb_set(pg_temp.ebay_payload('bad-topic','u'),'{metadata,topic}','"UNEXPECTED_TOPIC"'),repeat('a',64));
  exception when sqlstate '22023' then blocked:=true; end;
  perform pg_temp.assert_ebay('wrong topic rejected',blocked);
  blocked:=false;
  begin perform code3_ebay_public_test_20261020.code3_ebay_accept_notification('missing-user',jsonb_set(pg_temp.ebay_payload('missing-user','u'),'{notification,data}','{}'),repeat('a',64));
  exception when sqlstate '22023' then blocked:=true; end;
  perform pg_temp.assert_ebay('missing identity rejected',blocked);
  blocked:=false;
  begin perform code3_ebay_public_test_20261020.code3_ebay_accept_notification('extra-raw',jsonb_set(pg_temp.ebay_payload('extra-raw','u'),'{notification,data,email}','"not-retained@example.test"'),repeat('a',64));
  exception when sqlstate '22023' then blocked:=true; end;
  perform pg_temp.assert_ebay('unapproved raw identity fields rejected',blocked);
  blocked:=false;
  begin perform code3_ebay_public_test_20261020.code3_ebay_retry_notifications(null);
  exception when sqlstate '22023' then blocked:=true; end;
  perform pg_temp.assert_ebay('retry limit bounded',blocked);
  perform pg_temp.assert_ebay('failed inputs created no inbox job',not exists(select 1 from code3_ebay_test_20261020.notification_inbox where event_id=any(array['bad-topic','missing-user','extra-raw'])));
end $$;

-- Failure injection is restricted to one invented canonical record and rolls
-- back the entire scrub; successful retry then proves the durable job recovers.
update code3_ebay_sync_test_20261020.workspaces set revision=3,sources=jsonb_set(sources,'{deal-finder,data,providerListings}',
  (sources#>'{deal-finder,data,providerListings}') || jsonb_build_array(jsonb_build_object('id','listing-row-c','providerId','ebay','sellerName','SyntheticSellerC','externalListingId','synthetic-listing-c','title','C product','askingPrice',33.33)));
insert into code3_ebay_sync_test_20261020.workspace_revisions(owner_id,revision,expected_revision,mutation_id,sources)
select owner_id,3,2,'00000000-0000-4000-8000-000000000103',sources from code3_ebay_sync_test_20261020.workspaces;
insert into code3_ebay_public_test_20261020.code3_records(id,external_provider,external_id,metadata,amount_minor,quantity,owner_subject)
values('00000000-0000-4000-8000-000000000203','ebay','synthetic-listing-c','{"sellerName":"SyntheticSellerC","title":"C owned product"}',3333,1,'synthetic:owner-a');
create function pg_temp.ebay_fail_canonical() returns trigger language plpgsql as $$ begin
  if new.id='00000000-0000-4000-8000-000000000203' then raise exception 'synthetic processor failure'; end if; return new;
end; $$;
create trigger synthetic_ebay_failure before update on code3_ebay_public_test_20261020.code3_records for each row execute function pg_temp.ebay_fail_canonical();
do $$ declare response jsonb; begin
  perform code3_ebay_public_test_20261020.code3_ebay_accept_notification('synthetic-event-c',pg_temp.ebay_payload('synthetic-event-c','synthetic-user-c','SyntheticSellerC'),repeat('e',64));
  response:=code3_ebay_public_test_20261020.code3_ebay_process_notification('synthetic-event-c');
  perform pg_temp.assert_ebay('processor failure recorded',response->>'status'='failed' and (select state='failed' and attempt_count=1 and last_error_code='processing_failed' from code3_ebay_test_20261020.notification_inbox where event_id='synthetic-event-c'));
  perform pg_temp.assert_ebay('failed scrub current transaction rolled back',(select revision=3 and sources#>>'{deal-finder,data,providerListings,2,sellerName}'='SyntheticSellerC' from code3_ebay_sync_test_20261020.workspaces));
  perform pg_temp.assert_ebay('failed scrub history transaction rolled back',(select count(*)=3 from code3_ebay_sync_test_20261020.workspace_revisions));
  perform pg_temp.assert_ebay('failed scrub cannot leave bypass',not exists(select 1 from code3_ebay_test_20261020.processing_transactions));
  perform pg_temp.assert_ebay('failed scrub retains initial durable identity tombstone',exists(select 1 from code3_ebay_test_20261020.identity_tombstones where kind='username' and identity_hash=code3_ebay_test_20261020.identity_hash('username','SyntheticSellerC')));
end $$;
drop trigger synthetic_ebay_failure on code3_ebay_public_test_20261020.code3_records;
select code3_ebay_public_test_20261020.code3_ebay_retry_notifications(25);
select pg_temp.assert_ebay('durable failed job retries successfully',(select state='processed' and attempt_count=2 from code3_ebay_test_20261020.notification_inbox where event_id='synthetic-event-c'));
select pg_temp.assert_ebay('retry publishes one sanitized revision',(select revision=4 from code3_ebay_sync_test_20261020.workspaces) and (select count(*)=4 from code3_ebay_sync_test_20261020.workspace_revisions));
select pg_temp.assert_ebay('retry leaves no seller C in history',not exists(select 1 from code3_ebay_sync_test_20261020.workspace_revisions where position('SyntheticSellerC' in sources::text)>0));

-- Two durable jobs can be queued before either worker runs. An unrelated job
-- must not claim that another pending seller's erasure completed its own work.
do $$ declare response jsonb; begin
  perform code3_ebay_public_test_20261020.code3_ebay_accept_notification('synthetic-event-b',pg_temp.ebay_payload('synthetic-event-b','synthetic-user-b','SyntheticSellerB'),repeat('1',64));
  perform code3_ebay_public_test_20261020.code3_ebay_accept_notification('synthetic-event-d',pg_temp.ebay_payload('synthetic-event-d','unmapped-user-d'),repeat('2',64));
  response:=code3_ebay_public_test_20261020.code3_ebay_process_notification('synthetic-event-d');
  perform pg_temp.assert_ebay('unmapped event does not claim other pending seller',response->>'status'='needs_review');
  perform pg_temp.assert_ebay('different pending identity remains for its own worker',(select sources#>>'{deal-finder,data,providerListings,1,sellerName}'='SyntheticSellerB' from code3_ebay_sync_test_20261020.workspaces));
  perform pg_temp.assert_ebay('different pending event not silently completed',(select state='pending' from code3_ebay_test_20261020.notification_inbox where event_id='synthetic-event-b'));
  response:=code3_ebay_public_test_20261020.code3_ebay_process_notification('synthetic-event-b');
  perform pg_temp.assert_ebay('own pending seller processed',response->>'status'='processed');
  perform pg_temp.assert_ebay('seller B absent from current/history',not exists(select 1 from code3_ebay_sync_test_20261020.workspace_revisions where position('SyntheticSellerB' in sources::text)>0)
    and (select position('SyntheticSellerB' in sources::text)=0 from code3_ebay_sync_test_20261020.workspaces));
  perform pg_temp.assert_ebay('multiple events preserve all owner quantities/costs',(select sources#>'{deal-finder,data,inventory}' from ebay_before)=(select sources#>'{deal-finder,data,inventory}' from code3_ebay_sync_test_20261020.workspaces));
end $$;

-- Local harness auth.uid reads only a test-only GUC. This checks role grants and
-- the account/session gate wiring; it is NOT a live Supabase-session test.
do $$ declare response jsonb; blocked boolean:=false; begin
  set local role service_role;
  response:=code3_ebay_public_test_20261020.code3_ebay_accept_notification('synthetic-role-event',pg_temp.ebay_payload('synthetic-role-event','synthetic-role-user'),repeat('f',64));
  reset role;
  perform pg_temp.assert_ebay('actual service role RPC executes',response->>'status'='accepted');
  begin
    set local role anon;
    perform code3_ebay_public_test_20261020.code3_ebay_notification_status(null);
  exception when insufficient_privilege then blocked:=true;
  end;
  reset role;
  perform pg_temp.assert_ebay('actual anonymous administrative call rejected',blocked);
  blocked:=false;
  begin
    set local role authenticated;
    perform code3_ebay_public_test_20261020.code3_ebay_privacy_tombstones(0,1);
  exception when insufficient_privilege then blocked:=true;
  end;
  reset role;
  perform pg_temp.assert_ebay('missing active account blocks tombstone read',blocked);
  perform set_config('code3.test_uid','00000000-0000-4000-8000-000000000001',true);
  set local role authenticated;
  response:=code3_ebay_public_test_20261020.code3_ebay_privacy_tombstones(0,1);
  reset role;
  perform pg_temp.assert_ebay('verified synthetic account can read bounded hash page',jsonb_array_length(response->'tombstones')=1 and response->'hasMore'='true'::jsonb);
  perform pg_temp.assert_ebay('tombstone page exposes no raw user or event ID',position('synthetic-' in response::text)=0 and position('SyntheticSeller' in response::text)=0);
  perform pg_temp.assert_ebay('tombstone page returns cursor',(response->>'nextAfter')::bigint>0);
  perform set_config('code3.test_uid','',true);
end $$;

select jsonb_build_object('suite','ebay-deletion-sql-isolated','passed',count(*),'failed',0,'production_records_touched',false,'transaction','rollback') as result from ebay_sql_test_results;
rollback;
