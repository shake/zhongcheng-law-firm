interface Env {
  VECTORIZE: any;
  AI: any;
}

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

      // Generate embeddings using the Chinese BGE-large-zh model
      const aiResponse = await env.AI.run('@cf/baai/bge-large-zh-v1.5', {
        text: texts
      });

      if (!aiResponse || !aiResponse.data) {
        throw new Error(`Workers AI returned an invalid response for batch starting at index ${i}`);
      }

      // Prepare vectors for Vectorize
      const vectors = aiResponse.data.map((values: number[], index: number) => {
        const item = batch[index];
        return {
          id: `labor-law-art-${i + index + 1}`,
          values,
          metadata: {
            text: item.text,
            chapter: item.chapter,
            article: item.article,
            source: '中华人民共和国劳动法'
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
  const chunks: { text: string; chapter: string; article: string }[] = [];
  
  let currentArticleNum = '';
  let currentArticleContent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for chapter headers (e.g. ## 第一章　总则)
    if (line.startsWith('## ')) {
      // Flush current article before switching chapters
      if (currentArticleNum && currentArticleContent) {
        chunks.push({
          chapter: currentChapter,
          article: currentArticleNum,
          text: `《中华人民共和国劳动法》 ${currentChapter} ${currentArticleNum} ${currentArticleContent.trim()}`
        });
        currentArticleNum = '';
        currentArticleContent = '';
      }
      currentChapter = line.replace('## ', '').trim();
      continue;
    }

    // Check for article bold headers (e.g. **第一条**)
    const articleMatch = line.match(/^\*\*(第[一二三四五六七八九十百]+条)\*\*(.*)/);
    if (articleMatch) {
      // Flush previous article
      if (currentArticleNum && currentArticleContent) {
        chunks.push({
          chapter: currentChapter,
          article: currentArticleNum,
          text: `《中华人民共和国劳动法》 ${currentChapter} ${currentArticleNum} ${currentArticleContent.trim()}`
        });
      }
      currentArticleNum = articleMatch[1];
      currentArticleContent = articleMatch[2];
    } else {
      // If it's additional text under the current article, append it
      if (currentArticleNum) {
        currentArticleContent += '\n' + line;
      }
    }
  }

  // Flush the last remaining article
  if (currentArticleNum && currentArticleContent) {
    chunks.push({
      chapter: currentChapter,
      article: currentArticleNum,
      text: `《中华人民共和国劳动法》 ${currentChapter} ${currentArticleNum} ${currentArticleContent.trim()}`
    });
  }

  return chunks;
}
