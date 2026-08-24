export const EMBEDDING_DIMENSIONS = 1024;

export function configuredEmbeddingDimensions(value = process.env.EMBEDDING_DIMENSIONS) {
  const dimensions = value == null || value === "" ? EMBEDDING_DIMENSIONS : Number(value);
  if (!Number.isInteger(dimensions) || dimensions !== EMBEDDING_DIMENSIONS) throw new Error(`EMBEDDING_DIMENSIONS must be ${EMBEDDING_DIMENSIONS} to match the database vector type`);
  return dimensions;
}

export function validEmbeddingVector(value, dimensions = EMBEDDING_DIMENSIONS) {
  return Array.isArray(value) && value.length === dimensions && value.every((item) => typeof item === "number" && Number.isFinite(item));
}
