-- Use BoldTrail's own vocabulary for what a contact is.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- WHY
-- The original list — buyer / seller / investor / both / unknown — was invented
-- before there was anything to match it against. BoldTrail's `deal_type` uses
-- buyer / seller / renter / vendor / agent, and importing into the old list
-- meant "vendor" and "agent" collapsed to "unknown" and everything with more
-- than one role collapsed to "both". Adopting their words removes a translation
-- step that was only ever losing detail.
--
-- WHY BOTH A SINGLE VALUE AND AN ARRAY
-- Their deal_type is multi-valued: "buyer,seller,renter" is the second most
-- common value in this account, 184 contacts. `lead_type` stays single so the
-- pipeline board, filters and badges keep working, and `deal_types` holds the
-- complete set so nothing is thrown away. lead_type is simply the first of
-- deal_types in the precedence buyer > seller > renter > vendor > agent.

alter table public.contacts
  add column if not exists deal_types text[] not null default '{}'::text[];

-- Existing values must satisfy the new constraint before it is added.
--
-- 'both' meant buyer-and-seller, so it becomes 'buyer' with 'seller' retained
-- in deal_types. 'investor' has no counterpart in their vocabulary and is
-- treated as a buyer, which is what an investor is on the buying side; the
-- original word is kept in deal_types so the distinction is not lost.
update public.contacts
   set deal_types = case
         when lead_type = 'both'     then array['buyer','seller']
         when lead_type = 'investor' then array['buyer','investor']
         when lead_type = 'unknown'  then '{}'::text[]
         else array[lead_type]
       end
 where deal_types = '{}'::text[];

update public.contacts set lead_type = 'buyer'
 where lead_type in ('both', 'investor');

alter table public.contacts drop constraint if exists contacts_lead_type_check;

do $$ begin
  alter table public.contacts add constraint contacts_lead_type_check
    check (lead_type in ('buyer', 'seller', 'renter', 'vendor', 'agent', 'unknown'));
exception when duplicate_object then null;
end $$;

-- "Everyone who is a seller in any capacity", which the single column cannot
-- answer once a contact holds several roles.
create index if not exists contacts_deal_types_idx
  on public.contacts using gin (deal_types);

-- ─── Verify ──────────────────────────────────────────────────────────────────
--   select lead_type, count(*) from public.contacts group by 1 order by 2 desc;
--   select unnest(deal_types) as role, count(*) from public.contacts group by 1 order by 2 desc;
