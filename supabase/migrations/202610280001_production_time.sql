-- Congela o tempo por unidade ao criar o item, assim como o custo/preço.
alter table public.order_items add column if not exists production_minutes integer check (production_minutes >= 0);
update public.order_items oi set production_minutes=pv.minutes
from public.product_variants pv where oi.variant_id=pv.id and oi.production_minutes is null;
alter table public.order_items alter column production_minutes set not null;

create or replace function public.snapshot_production_time() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  select minutes into new.production_minutes from product_variants where id=new.variant_id;
  if new.production_minutes is null then raise exception 'Tempo de produção não encontrado'; end if;
  return new;
end $$;
revoke all on function public.snapshot_production_time() from public,anon,authenticated;
drop trigger if exists snapshot_production_time on public.order_items;
create trigger snapshot_production_time before insert on public.order_items
for each row execute function public.snapshot_production_time();
notify pgrst, 'reload schema';
