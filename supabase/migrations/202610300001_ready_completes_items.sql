-- Pronto e Entregue significam que todas as unidades foram produzidas.
create or replace function public.order_action(p_id uuid,p_action text,p_stage text default null) returns void
language plpgsql security definer set search_path=public as $$
declare o orders;
begin
 if not is_admin() then raise exception 'Acesso restrito'; end if;
 select * into o from orders where id=p_id for update;
 if not found then raise exception 'Encomenda não encontrada'; end if;
 if p_action='cancel' then update orders set canceled_at=coalesce(canceled_at,now()) where id=p_id;
 elsif p_action='reopen' then update orders set canceled_at=null,stage='todo' where id=p_id;
 elsif p_action='stage' then
   if o.canceled_at is not null then raise exception 'Reabra a encomenda primeiro'; end if;
   if p_stage is null or p_stage not in ('todo','printing','ready','delivered') then raise exception 'Etapa inválida'; end if;
   if p_stage in ('ready','delivered') then
     update order_items set produced_quantity=quantity where order_id=p_id and produced_quantity<>quantity;
   end if;
   update orders set stage=p_stage where id=p_id;
 else raise exception 'Ação inválida'; end if;
end $$;
revoke all on function public.order_action(uuid,text,text) from public,anon,authenticated;
grant execute on function public.order_action(uuid,text,text) to authenticated;

-- Corrige também pedidos que já tinham sido marcados como prontos ou entregues.
update public.order_items oi set produced_quantity=oi.quantity
from public.orders o where o.id=oi.order_id and o.canceled_at is null
and o.stage in ('ready','delivered') and oi.produced_quantity<>oi.quantity;
notify pgrst, 'reload schema';
