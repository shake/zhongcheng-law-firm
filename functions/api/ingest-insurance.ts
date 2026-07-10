import {
  EMBEDDING_MODEL,
  INSURANCE_CORPUS_SOURCE,
  INSURANCE_CORPUS_VERSION,
  parseLawMarkdown
} from '../_shared/rag';

interface Env {
  INSURANCE_VECTORIZE: any;
  AI: any;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.searchParams.get('code') !== 'zhongcheng-insurance-ingest-2026') {
    return new Response('Unauthorized: Invalid passcode', { status: 401 });
  }

  try {
    const response = await fetch(`${url.origin}/insurance-law.md`);
    if (!response.ok) {
      return new Response('Failed to fetch insurance-law.md from the deployed site.', { status: 500 });
    }

    const chunks = parseLawMarkdown(await response.text(), {
      source: INSURANCE_CORPUS_SOURCE,
      idPrefix: 'insurance-law'
    });
    if (chunks.length === 0) {
      return new Response('No insurance law articles found in insurance-law.md.', { status: 400 });
    }

    let ingestedCount = 0;
    for (let i = 0; i < chunks.length; i += 20) {
      const batch = chunks.slice(i, i + 20);
      const embeddingResponse = await env.AI.run(EMBEDDING_MODEL, {
        text: batch.map((chunk) => chunk.text)
      });
      if (!embeddingResponse?.data) {
        throw new Error(`Workers AI returned an invalid response for batch starting at index ${i}`);
      }

      await env.INSURANCE_VECTORIZE.upsert(embeddingResponse.data.map((values: number[], index: number) => {
        const item = batch[index];
        return {
          id: item.id,
          values,
          metadata: {
            text: item.text,
            chapter: item.chapterKey,
            article: item.articleKey,
            source: INSURANCE_CORPUS_SOURCE,
            corpusVersion: INSURANCE_CORPUS_VERSION
          }
        };
      }));
      ingestedCount += batch.length;
    }

    return Response.json({
      success: true,
      message: `Successfully parsed and ingested ${ingestedCount} insurance law chunks into Vectorize.`,
      totalChunks: chunks.length,
      articleCount: new Set(chunks.map((chunk) => chunk.articleKey)).size,
      corpusVersion: INSURANCE_CORPUS_VERSION
    });
  } catch (error: any) {
    return Response.json({ success: false, error: error.message || error }, { status: 500 });
  }
};
