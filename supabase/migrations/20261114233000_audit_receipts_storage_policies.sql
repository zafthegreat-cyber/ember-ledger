-- Audit 2026-11-14: storage hygiene for private attachment buckets.
--
-- The `receipts` bucket still had its original broad policies, including
-- "Public can view receipts" (role public) and unscoped update/delete for any
-- signed-in user. The restrictive code3_* policies narrowed them to the owner,
-- so nothing leaked, but one loosened restrictive policy would have exposed
-- every receipt. Replace them with owner-only permissive policies so both
-- layers agree. Also give the private buckets size and file-type limits.

drop policy if exists "Public can view receipts" on storage.objects;
drop policy if exists "Users can view receipts" on storage.objects;
drop policy if exists "Users can update receipts" on storage.objects;
drop policy if exists "Users can delete receipts" on storage.objects;
drop policy if exists "Users can upload receipts" on storage.objects;
drop policy if exists "Authenticated users can upload receipts" on storage.objects;

create policy receipts_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and coalesce(owner_id, owner::text) = (select auth.uid())::text);

create policy receipts_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and coalesce(owner_id, owner::text) = (select auth.uid())::text);

create policy receipts_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and coalesce(owner_id, owner::text) = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and coalesce(owner_id, owner::text) = (select auth.uid())::text);

create policy receipts_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and coalesce(owner_id, owner::text) = (select auth.uid())::text);

-- Size and type limits (the largest stored receipt today is ~7 MB).
update storage.buckets
  set file_size_limit = 20 * 1024 * 1024,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif','application/pdf']
  where id in ('receipts', 'receipt-images');

update storage.buckets
  set file_size_limit = 15 * 1024 * 1024,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif']
  where id in ('feedback-screenshots', 'product-submissions');
