-- Deploy only with the private-attachment URL resolver. Existing object names,
-- record URLs, bytes and ownership remain unchanged. Public receipt URLs stop
-- serving directly; authenticated owners use short-lived signed URLs instead.
begin;
update storage.buckets set public=false
where id in ('receipts','receipt-images','product-submissions','feedback-screenshots') and public;

-- Restrictive policies also constrain permissive historical public-read rules.
-- Public catalogs and brand artwork are intentionally outside this boundary.
create policy code3_private_attachment_anon_read on storage.objects
as restrictive for select to anon
using (bucket_id not in ('receipts','receipt-images','product-submissions','feedback-screenshots'));

create policy code3_private_attachment_authenticated_read on storage.objects
as restrictive for select to authenticated
using (
  bucket_id not in ('receipts','receipt-images','product-submissions','feedback-screenshots')
  or (
    (select public.code3_current_session_valid())
    and (
      bucket_id <> 'receipts'
      or (
        coalesce(owner_id,owner::text)=(select auth.uid())::text
        and (owner_id is null or owner is null or owner_id=owner::text)
      )
    )
  )
);
-- Existing private-upload policies still decide user-folder/workspace/moderator
-- access for the other three private buckets. This does not grant new access.
commit;
