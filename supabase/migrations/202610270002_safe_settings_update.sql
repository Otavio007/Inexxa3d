-- Compatibilidade com a proteção safeupdate do Supabase.
create or replace function public.save_settings(p_settings jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() then raise exception 'Acesso restrito'; end if;
 update settings set pla_kg_cents=(p_settings->>'pla_kg_cents')::integer,energy_hour_cents=(p_settings->>'energy_hour_cents')::integer,
 box_cents=(p_settings->>'box_cents')::integer,label_cents=(p_settings->>'label_cents')::integer,bag_cents=(p_settings->>'bag_cents')::integer,
 wear_cents=(p_settings->>'wear_cents')::integer,markup_percent=(p_settings->>'markup_percent')::numeric where id=1;
 update product_variants set cost_cents=variant_cost(grams,minutes,extras_cents) where id is not null;
 update product_variants set price_cents=suggested_price(cost_cents) where automatic;
end $$;
revoke all on function public.save_settings(jsonb) from public, anon, authenticated;
grant execute on function public.save_settings(jsonb) to authenticated;
notify pgrst, 'reload schema';
