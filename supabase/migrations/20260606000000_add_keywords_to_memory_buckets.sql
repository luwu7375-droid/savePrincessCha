alter table memory_buckets
  add column if not exists keywords text[] not null default '{}';
