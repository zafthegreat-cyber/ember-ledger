-- Community post types match the app's ten categories (stored as slugs), so
-- nothing is lost between the post form and the server. Older short values stay valid.
alter table public.community_posts drop constraint if exists community_posts_post_type_check;
alter table public.community_posts add constraint community_posts_post_type_check check (post_type in (
  'community_update', 'restock_discussion', 'kid_friendly_win', 'question', 'local_event', 'family_friendly_shop',
  'trade_night', 'marketplace_tip', 'app_help', 'other', 'event', 'win', 'tip'));
alter table public.community_posts alter column post_type set default 'community_update';
