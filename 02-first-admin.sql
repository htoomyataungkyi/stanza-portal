-- =====================================================================
--  STANZA CLIENT PORTAL — ပထမဆုံး Admin အကောင့် သတ်မှတ်ခြင်း
--  FIRST ADMIN SETUP
--
--  ဤဖိုင်ကို 01-database-setup.sql ပြီးမှ၊ ပြီးတော့ Supabase ထဲမှာ
--  ကိုယ့်အကောင့်ကို Sign up လုပ်ပြီးမှ RUN လုပ်ပါ။
--
--  Run this AFTER 01-database-setup.sql, and AFTER you have signed up
--  with your own email through the portal or the Supabase dashboard.
-- =====================================================================


-- ---------------------------------------------------------------------
--  အဆင့် ၁ — ကိုယ့် email ကို အောက်မှာ ပြောင်းထည့်ပါ
--  STEP 1 — Replace the email below with YOUR email address.
-- ---------------------------------------------------------------------

update profiles
set kind      = 'staff',
    role      = 'managing_director',
    full_name = 'Htoo Myat Aung',           -- <<< ကိုယ့်နာမည် ထည့်ပါ
    status    = 'active'
where id = (
  select id from auth.users
  where email = 'htoomyataungkyi@gmail.com'  -- <<< ကိုယ့် email ထည့်ပါ
);

-- စစ်ကြည့်ပါ — အောက်ပါ query က row တစ်ကြောင်း ပြရပါမယ်။
-- Check it worked — this should return exactly one row.
select p.full_name, p.kind, p.role, u.email
from profiles p join auth.users u on u.id = p.id
where p.role = 'managing_director';


-- ---------------------------------------------------------------------
--  အဆင့် ၂ — ဝန်ထမ်းတွေ ထပ်ထည့်ခြင်း
--  STEP 2 — Adding the rest of the team.
--
--  ဝန်ထမ်းတစ်ယောက်စီက အရင်ဆုံး ကိုယ်တိုင် sign up လုပ်ရပါမယ်။
--  ပြီးမှ အောက်ပါ query နဲ့ role သတ်မှတ်ပေးပါ။
--
--  Each staff member signs up themselves first, then you run this to
--  give them their role. Roles available:
--
--    managing_director   — အားလုံး မြင်ရ၊ ပြင်လို့ရ
--    project_manager     — ကိုယ်တာဝန်ယူတဲ့ project တွေ
--    designer            — design ပိုင်း
--    qs                  — ကုန်ကျစရိတ်
--    finance             — ငွေစာရင်း
--    sales               — customer service
--    system_admin        — account စီမံခန့်ခွဲမှုသာ (ငွေစာရင်း မမြင်ရ)
--    subcontractor       — ဓာတ်ပုံတင်ရုံသာ
-- ---------------------------------------------------------------------

-- ဥပမာ — Project Manager တစ်ယောက် ထည့်ခြင်း
-- Example — promote someone to Project Manager:
--
-- update profiles
-- set kind = 'staff', role = 'project_manager', full_name = 'Phyo Lwin Ko'
-- where id = (select id from auth.users where email = 'someone@stanza.com');


-- ---------------------------------------------------------------------
--  အဆင့် ၃ — Client တစ်ယောက်ကို project နဲ့ ချိတ်ခြင်း
--  STEP 3 — Giving a client access to their project.
--
--  ဒါက စနစ်တစ်ခုလုံးရဲ့ အနှစ်ချုပ်ပါ။ ဒီစာကြောင်း မရှိရင် client က
--  ဘာမှ မမြင်ရပါဘူး — project ရှိနေရင်တောင်ပါပဲ။
--
--  This is the heart of the whole system. Without a row in
--  project_members, a client sees nothing at all — not even that the
--  project exists. Adding the row is the only thing that grants access,
--  and removing it is the only thing needed to take access away.
-- ---------------------------------------------------------------------

-- insert into project_members (project_id, user_id, granted_by)
-- select
--   (select id from projects where code = 'STZ-2605-YGN-0023'),
--   (select id from auth.users where email = 'client@example.com'),
--   auth.uid();


-- ---------------------------------------------------------------------
--  Client ရဲ့ access ကို ဖြုတ်ချင်ရင် (project ပြီးသွားလို့ စသည်)
--  To take a client's access away — soft, and reversible:
-- ---------------------------------------------------------------------

-- update project_members
-- set revoked_at = now()
-- where project_id = (select id from projects where code = 'STZ-2605-YGN-0023')
--   and user_id = (select id from auth.users where email = 'client@example.com');
