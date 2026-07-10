export const EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b';
export const CORPUS_SOURCE = '中华人民共和国劳动法';
export const INSURANCE_CORPUS_SOURCE = '中华人民共和国保险法';

// Bump this when the source document is replaced or materially revised.
export const CORPUS_VERSION = 'labor-law-2018-12-29-v1';
export const INSURANCE_CORPUS_VERSION = 'insurance-law-2015-v1';

export const QUERY_INSTRUCTION = 'Given a Chinese legal question, retrieve the relevant passages from the applicable Chinese law.';

export type LawChunk = {
  id: string;
  text: string;
  chapterKey: string;
  articleKey: string;
};

type ParseOptions = {
  source: string;
  idPrefix: string;
};

const CHINESE_NUMERAL_PATTERN = '[一二三四五六七八九十百零〇]+|\\d+';

export function parseLawMarkdown(mdText: string, options: ParseOptions): LawChunk[] {
  const lines = mdText.split('\n');
  let currentChapter = '总则';
  let currentChapterKey = '总则';
  const chunks: LawChunk[] = [];
  let currentArticleNum = '';
  let currentArticleContent = '';
  let articleIndex = 0;

  const flushArticle = () => {
    if (!currentArticleNum || !currentArticleContent) return;
    const segments = splitArticleContent(currentArticleContent.trim());
    segments.forEach((segment, segmentIndex) => {
      chunks.push({
        id: `${options.idPrefix}-${articleIndex}-${segmentIndex + 1}`,
        chapterKey: currentChapterKey,
        articleKey: currentArticleNum,
        text: `《${options.source}》 ${currentChapter} ${currentArticleNum} ${segment}`
      });
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (currentArticleNum) currentArticleContent += '\n';
      continue;
    }

    const chapterMatch = line.match(new RegExp(`^(?:##\\s+)?(?:\\*\\*)?(第(?:${CHINESE_NUMERAL_PATTERN})章)(?:\\*\\*)?\\s*(.*)$`));
    if (chapterMatch) {
      flushArticle();
      currentArticleNum = '';
      currentArticleContent = '';
      currentChapter = chapterMatch[2] ? `${chapterMatch[1]} ${chapterMatch[2]}`.trim() : chapterMatch[1];
      currentChapterKey = chapterMatch[1];
      continue;
    }

    // Section titles are useful for display but should not pollute article text.
    if (new RegExp(`^第(?:${CHINESE_NUMERAL_PATTERN})节`).test(line)) continue;

    const articleMatch = line.match(new RegExp(`^(?:\\*\\*)?\\s*(第(?:${CHINESE_NUMERAL_PATTERN})条)(?:\\*\\*)?\\s*(.*)$`));
    if (articleMatch) {
      flushArticle();
      articleIndex += 1;
      currentArticleNum = articleMatch[1];
      currentArticleContent = articleMatch[2];
      continue;
    }

    if (currentArticleNum) currentArticleContent += `${currentArticleContent ? '\n' : ''}${rawLine}`;
  }

  flushArticle();
  return chunks;
}

function splitArticleContent(articleContent: string) {
  const blocks = articleContent
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const segments: string[] = [];

  for (const block of blocks) {
    if (/^[-•]/.test(block) || /^（[一二三四五六七八九十\\d]+）/.test(block)) {
      segments.push(block.replace(/\n+/g, ' '));
      continue;
    }

    const sentences = block.match(/[^。！？；]+[。！？；]?/g) || [block];
    let current = '';
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      if (current && current.length + trimmed.length > 180) {
        segments.push(current.trim());
        current = trimmed;
      } else {
        current += trimmed;
      }
    }
    if (current.trim()) segments.push(current.trim());
  }

  return segments.length > 0 ? segments : [articleContent];
}
