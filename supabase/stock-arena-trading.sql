-- Stock Arena paper-trading schema. Run once in Supabase SQL Editor.
-- All balances and trade writes are performed atomically by RPC functions.

create table if not exists public.stock_arena_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cash numeric(20, 2) not null default 10000000 check (cash >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_arena_holdings (
  user_id uuid not null references auth.users(id) on delete cascade,
  stock_code text not null,
  stock_name text not null,
  quantity integer not null check (quantity > 0),
  average_price numeric(20, 2) not null check (average_price >= 0),
  current_price numeric(20, 2) not null check (current_price >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, stock_code)
);

create table if not exists public.stock_arena_trades (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('buy', 'sell')),
  stock_code text not null,
  stock_name text not null,
  quantity integer not null check (quantity > 0),
  price numeric(20, 2) not null check (price > 0),
  total numeric(20, 2) not null check (total > 0),
  realized_profit numeric(20, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists stock_arena_trades_user_created_idx
  on public.stock_arena_trades (user_id, created_at desc);

alter table public.stock_arena_wallets enable row level security;
alter table public.stock_arena_holdings enable row level security;
alter table public.stock_arena_trades enable row level security;

drop policy if exists "wallets_select_own" on public.stock_arena_wallets;
create policy "wallets_select_own" on public.stock_arena_wallets
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "holdings_select_own" on public.stock_arena_holdings;
create policy "holdings_select_own" on public.stock_arena_holdings
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "trades_select_own" on public.stock_arena_trades;
create policy "trades_select_own" on public.stock_arena_trades
  for select to authenticated using (auth.uid() = user_id);

grant select on public.stock_arena_wallets, public.stock_arena_holdings, public.stock_arena_trades to authenticated;

create or replace function public.stock_arena_get_portfolio()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_cash numeric(20, 2);
  v_holdings jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.stock_arena_wallets (user_id) values (v_user_id)
  on conflict (user_id) do nothing;

  select cash into v_cash from public.stock_arena_wallets where user_id = v_user_id;
  select coalesce(jsonb_object_agg(stock_code, jsonb_build_object(
    'code', stock_code, 'name', stock_name, 'qty', quantity,
    'price', current_price, 'averagePrice', average_price
  )), '{}'::jsonb)
  into v_holdings from public.stock_arena_holdings where user_id = v_user_id;

  return jsonb_build_object('cash', v_cash, 'holdings', v_holdings);
end;
$$;

create or replace function public.stock_arena_execute_trade(
  p_mode text,
  p_stock_code text,
  p_stock_name text,
  p_quantity integer,
  p_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_cash numeric(20, 2);
  v_total numeric(20, 2);
  v_holding public.stock_arena_holdings%rowtype;
  v_realized numeric(20, 2) := 0;
  v_holdings jsonb;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_mode not in ('buy', 'sell') then raise exception 'INVALID_TRADE_MODE'; end if;
  if p_stock_code is null or length(trim(p_stock_code)) = 0 or length(p_stock_code) > 16 then raise exception 'INVALID_STOCK_CODE'; end if;
  if p_stock_name is null or length(trim(p_stock_name)) = 0 or length(p_stock_name) > 100 then raise exception 'INVALID_STOCK_NAME'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000000 then raise exception 'INVALID_QUANTITY'; end if;
  if p_price is null or p_price <= 0 or p_price > 100000000000 then raise exception 'INVALID_PRICE'; end if;

  v_total := round(p_quantity * p_price, 2);
  insert into public.stock_arena_wallets (user_id) values (v_user_id) on conflict (user_id) do nothing;
  select cash into v_cash from public.stock_arena_wallets where user_id = v_user_id for update;

  if p_mode = 'buy' then
    if v_cash < v_total then raise exception 'INSUFFICIENT_CASH'; end if;
    update public.stock_arena_wallets set cash = cash - v_total, updated_at = now() where user_id = v_user_id;
    select * into v_holding from public.stock_arena_holdings
      where user_id = v_user_id and stock_code = trim(p_stock_code) for update;
    if found then
      update public.stock_arena_holdings
      set quantity = quantity + p_quantity,
          average_price = round(((average_price * quantity) + (p_price * p_quantity)) / (quantity + p_quantity), 2),
          current_price = p_price, stock_name = trim(p_stock_name), updated_at = now()
      where user_id = v_user_id and stock_code = trim(p_stock_code);
    else
      insert into public.stock_arena_holdings (user_id, stock_code, stock_name, quantity, average_price, current_price)
      values (v_user_id, trim(p_stock_code), trim(p_stock_name), p_quantity, p_price, p_price);
    end if;
  else
    select * into v_holding from public.stock_arena_holdings
      where user_id = v_user_id and stock_code = trim(p_stock_code) for update;
    if not found or v_holding.quantity < p_quantity then raise exception 'INSUFFICIENT_SHARES'; end if;
    v_realized := round((p_price - v_holding.average_price) * p_quantity, 2);
    update public.stock_arena_wallets set cash = cash + v_total, updated_at = now() where user_id = v_user_id;
    if v_holding.quantity = p_quantity then
      delete from public.stock_arena_holdings where user_id = v_user_id and stock_code = trim(p_stock_code);
    else
      update public.stock_arena_holdings
      set quantity = quantity - p_quantity, current_price = p_price, stock_name = trim(p_stock_name), updated_at = now()
      where user_id = v_user_id and stock_code = trim(p_stock_code);
    end if;
  end if;

  insert into public.stock_arena_trades (user_id, mode, stock_code, stock_name, quantity, price, total, realized_profit)
  values (v_user_id, p_mode, trim(p_stock_code), trim(p_stock_name), p_quantity, p_price, v_total, v_realized);

  select cash into v_cash from public.stock_arena_wallets where user_id = v_user_id;
  select coalesce(jsonb_object_agg(stock_code, jsonb_build_object(
    'code', stock_code, 'name', stock_name, 'qty', quantity,
    'price', current_price, 'averagePrice', average_price
  )), '{}'::jsonb)
  into v_holdings from public.stock_arena_holdings where user_id = v_user_id;

  return jsonb_build_object('cash', v_cash, 'holdings', v_holdings);
end;
$$;

revoke all on function public.stock_arena_get_portfolio() from public, anon;
revoke all on function public.stock_arena_execute_trade(text, text, text, integer, numeric) from public, anon;
grant execute on function public.stock_arena_get_portfolio() to authenticated;
grant execute on function public.stock_arena_execute_trade(text, text, text, integer, numeric) to authenticated;
grant usage on schema public to authenticated;

notify pgrst, 'reload schema';
