alter table memory_buckets
  add column if not exists source_msg_ids bigint[] default null;
