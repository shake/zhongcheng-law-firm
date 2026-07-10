import { CORPUS_SOURCE, CORPUS_VERSION, EMBEDDING_MODEL } from '../_shared/rag';

interface Env {
  VECTORIZE: any;
  AI: any;
}

const CHINESE_NUMERAL_PATTERN = '[一二三四五六七八九十百零〇]+|\\d+';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Security code check to prevent unauthorized database updates
  const code = url.searchParams.get('code');
  if (code !== 'zhongcheng-ingest-2026') {
    return new Response('Unauthorized: Invalid passcode', { status: 401 });
  }

  try {
    // 1. Fetch labor-law.md from the static assets
    const fileUrl = `${url.origin}/labor-law.md`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return new Response(`Failed to fetch labor-law.md at ${fileUrl}. Make sure the website is deployed with the file.`, { status: 500 });
    }
    const mdText = await response.text();

    // 2. Parse Markdown into structured chunks (Articles)
    const chunks = parseMarkdown(mdText);
    if (chunks.length === 0) {
      return new Response('No articles found in labor-law.md. Check markdown format.', { status: 400 });
    }

    // 3. Batch processing: Cloudflare Workers AI has limits on payload size.
    // We process in batches of 20 items.
    const batchSize = 20;
    let ingestedCount = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map(c => c.text);

      // Generate document embeddings with Qwen3 Embedding (1024 dimensions).
      const aiResponse = await env.AI.run(EMBEDDING_MODEL, {
        text: texts
      });

      if (!aiResponse || !aiResponse.data) {
        throw new Error(`Workers AI returned an invalid response for batch starting at index ${i}`);
      }

      // Prepare vectors for Vectorize
      const vectors = aiResponse.data.map((values: number[], index: number) => {
        const item = batch[index];
        return {
          id: item.id,
          values,
          metadata: {
            text: item.text,
            chapter: item.chapterKey,
            article: item.articleKey,
            source: CORPUS_SOURCE,
            corpusVersion: CORPUS_VERSION
          }
        };
      });

      // Upsert to Vectorize index
      await env.VECTORIZE.upsert(vectors);
      ingestedCount += batch.length;
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully parsed and ingested ${ingestedCount} articles of the Labor Law into Vectorize.`,
      totalChunks: chunks.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message || error
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * Parses the Chinese Labor Law Markdown and splits it cleanly by articles.
 */
function parseMarkdown(mdText: string) {
  const lines = mdText.split('\n');
  let currentChapter = '总则';
  let currentChapterKey = '总则';
  const chunks: { id: string; text: string; chapterKey: string; articleKey: string }[] = [];
  
  let currentArticleNum = '';
  let currentArticleKey = '';
  let currentArticleContent = '';
  let currentArticleIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Check for chapter headers (e.g. ## 第一章　总则)
    if (line.startsWith('## ')) {
      // Flush current article before switching chapters
      if (currentArticleNum && currentArticleContent) {
        pushArticleChunks(chunks, currentChapter, currentChapterKey, currentArticleNum, currentArticleKey, currentArticleContent, currentArticleIndex);
        currentArticleNum = '';
        currentArticleKey = '';
        currentArticleContent = '';
      }
      currentChapter = line.replace('## ', '').trim();
      const chapterMatch = currentChapter.match(new RegExp(`^(第(?:${CHINESE_NUMERAL_PATTERN})章)`));
      currentChapterKey = chapterMatch ? chapterMatch[1] : currentChapter;
      continue;
    }

    // Check for article bold headers (e.g. **第一条**)
    const articleMatch = line.match(new RegExp(`^\\*\\*(第(?:${CHINESE_NUMERAL_PATTERN})条)\\*\\*(.*)`));
    if (articleMatch) {
      // Flush previous article
      if (currentArticleNum && currentArticleContent) {
        pushArticleChunks(chunks, currentChapter, currentChapterKey, currentArticleNum, currentArticleKey, currentArticleContent, currentArticleIndex);
      }
      currentArticleIndex += 1;
      currentArticleNum = articleMatch[1];
      currentArticleKey = articleMatch[1];
      currentArticleContent = articleMatch[2];
    } else {
      // If it's additional text under the current article, append it
      if (currentArticleNum) {
        currentArticleContent += '\n' + rawLine;
      }
    }
  }

  // Flush the last remaining article
  if (currentArticleNum && currentArticleContent) {
    pushArticleChunks(chunks, currentChapter, currentChapterKey, currentArticleNum, currentArticleKey, currentArticleContent, currentArticleIndex);
  }

  return chunks;
}

function pushArticleChunks(
  chunks: { id: string; text: string; chapterKey: string; articleKey: string }[],
  chapter: string,
  chapterKey: string,
  articleNum: string,
  articleKey: string,
  articleContent: string,
  articleIndex: number
) {
  const segments = splitArticleContent(articleContent.trim());
  segments.forEach((segment, segmentIndex) => {
    chunks.push({
      id: `labor-law-${articleIndex}-${segmentIndex + 1}`,
      chapterKey,
      articleKey,
      text: `《中华人民共和国劳动法》 ${chapter} ${articleNum} ${segment}`
    });
  });
}

function splitArticleContent(articleContent: string) {
  const blocks = articleContent
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const segments: string[] = [];

  for (const block of blocks) {
    if (/^[-•]/.test(block) || /^（[一二三四五六七八九十\d]+）/.test(block)) {
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

    if (current.trim()) {
      segments.push(current.trim());
    }
  }

  return segments.length > 0 ? segments : [articleContent];
}
