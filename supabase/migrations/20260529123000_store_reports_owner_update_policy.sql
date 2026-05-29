begin;

-- Keep Scout report edits owner-only for normal users. Workspace editors can
-- still read workspace reports, but changing report details requires the
-- original reporter or an admin/moderator.
do $$
begin
  if to_regclass('public.store_reports') is not null
     and to_regprocedure('public.is_admin_or_moderator()') is not null
  then
    execute 'drop policy if exists "store_reports_update_details_workspace_strict" on public.store_reports';
    execute $policy$
      create policy "store_reports_update_details_owner_or_admin"
      on public.store_reports for update
      to authenticated
      using (
        public.is_admin_or_moderator()
        or user_id = (select auth.uid())
      )
      with check (
        public.is_admin_or_moderator()
        or user_id = (select auth.uid())
      )
    $policy$;
  end if;
end $$;

comment on policy "store_reports_update_details_owner_or_admin" on public.store_reports is
  'Normal users may update only their own Scout reports; admin/moderator roles handle moderation and cross-user edits.';

notify pgrst, 'reload schema';

commit;
