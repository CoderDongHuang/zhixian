create extension if not exists vector with schema extensions;
create index if not exists "Embedding_vector_hnsw_idx" on "Embedding" using hnsw (vector vector_cosine_ops);
