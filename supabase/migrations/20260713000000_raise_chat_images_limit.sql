-- Generated images are commonly larger than the original 1 MB upload limit.
-- Keep the bucket private; only raise the object size ceiling.
UPDATE storage.buckets
SET file_size_limit = 20971520
WHERE id = 'chat-images';
