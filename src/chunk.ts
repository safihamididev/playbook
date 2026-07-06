import type { Chunk, Section } from './types.js';

const MIN_CHUNK_CHARS = 250;

function slugify(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

export function chunkMarkdown(filename: string, raw: string): Chunk[] {
  // Read File
  const lines = raw.split("\n");
  let docTitle = filename;
  let current: Section = { heading: "intro", bodyLines: [] };
  const sections: Section[] = [current];

  const h1 = lines.find((line) => line.startsWith("# "));
  if (h1) docTitle = h1.slice(2).trim();

  for (const line of lines) {
    if (line.startsWith("# ") && !line.startsWith("## ")) continue; // H1 only
    if (line.startsWith("## ")) {
      current = { heading: line.slice(3).trim(), bodyLines: [] };
      sections.push(current);
    } else {
      current.bodyLines.push(line);
    }
  }

  const chunks: Chunk[] = [];

  for (const section of sections) {
    const body = section.bodyLines.join("\n").trim();
    
    if (!body) continue;
    
    let text = `${docTitle} > ${section.heading}\n\n${body}`;

    const prev = chunks[chunks.length - 1];
    if (body.length < MIN_CHUNK_CHARS && prev && prev.doc === filename) {
      prev.text += `\n\n## ${section.heading}\n\n${body}`;
      continue;
    }

    chunks.push({
      id: `${filename.replace(/\.md$/, "")}#${slugify(section.heading)}`,
      doc: filename,
      docTitle: docTitle,
      section: section.heading,
      text: text,
    });
  }

  return chunks;
}
