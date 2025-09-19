-- Create profiles table for user management
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Profiles policies
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_delete_own"
  on public.profiles for delete
  using (auth.uid() = id);

-- Create appointments table
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  trigger_distance integer default 100,
  priority text default 'medium' check (priority in ('low', 'medium', 'high')),
  completed boolean default false,
  image_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on appointments
alter table public.appointments enable row level security;

-- Appointments policies
create policy "appointments_select_own"
  on public.appointments for select
  using (auth.uid() = user_id);

create policy "appointments_insert_own"
  on public.appointments for insert
  with check (auth.uid() = user_id);

create policy "appointments_update_own"
  on public.appointments for update
  using (auth.uid() = user_id);

create policy "appointments_delete_own"
  on public.appointments for delete
  using (auth.uid() = user_id);

-- Create vip_contacts table
create table if not exists public.vip_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text,
  phone text,
  email text,
  notes text,
  priority text default 'medium' check (priority in ('low', 'medium', 'high')),
  contact_frequency_days integer default 7,
  last_contacted timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on vip_contacts
alter table public.vip_contacts enable row level security;

-- VIP contacts policies
create policy "vip_contacts_select_own"
  on public.vip_contacts for select
  using (auth.uid() = user_id);

create policy "vip_contacts_insert_own"
  on public.vip_contacts for insert
  with check (auth.uid() = user_id);

create policy "vip_contacts_update_own"
  on public.vip_contacts for update
  using (auth.uid() = user_id);

create policy "vip_contacts_delete_own"
  on public.vip_contacts for delete
  using (auth.uid() = user_id);
