export const EMBEDDING_DIMENSIONS: 1024;
export function configuredEmbeddingDimensions(value?: string): number;
export function validEmbeddingVector(value: unknown, dimensions?: number): value is number[];
