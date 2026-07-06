export interface Chunk {
    id: string;
    doc: string;
    docTitle: string;
    section: string;
    text: string;
}

export interface Section {
    heading: string;
    bodyLines: string[];
}

export interface EmbeddedChunk extends Chunk {
    vector: number[];
}

export interface EmbeddingIndex {
    model: string;
    createdAt: string;
    chunks: EmbeddedChunk[];
}

export interface SearchResult {
    chunk: EmbeddedChunk;
    score: number;
  }