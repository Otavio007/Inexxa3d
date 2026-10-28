-- Exclusão lógica: mantém arquivos e referências das encomendas anteriores.
create or replace function public.delete_product(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'Acesso restrito'; end if;
  perform 1 from settings where id=1 for update;
  update products set published=false where id=p_id;
  update product_variants set active=false where product_id=p_id;
end $$;
revoke all on function public.delete_product(uuid) from public, anon, authenticated;
grant execute on function public.delete_product(uuid) to authenticated;
notify pgrst, 'reload schema';
