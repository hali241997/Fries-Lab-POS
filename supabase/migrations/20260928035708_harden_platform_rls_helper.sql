-- Supabase creates this helper in new projects to enable RLS automatically.
-- It is not part of the application API and must not be callable by clients.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
