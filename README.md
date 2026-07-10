# zhongcheng-law-firm

Cloudflare Pages site for the Zhongcheng Law Firm project.

## Admin Access

The `/admin` page and `/api/admin/logs` endpoint are protected with Cloudflare Access JWT validation.

Set these Pages environment variables:

- `CF_ACCESS_DOMAIN` - your Zero Trust team domain, for example `https://<team>.cloudflareaccess.com`
- `CF_ACCESS_AUD` - the Access application audience tag
- `CF_ACCESS_ALLOWED_EMAILS` - comma-separated admin emails, defaults to `shakechen@126.com,shake.chen@gmail.com`

Cloudflare Zero Trust dashboard setup:

1. Go to `Zero Trust -> Access -> Applications`.
2. Create a `Self-hosted` application for the site.
3. Protect the `/admin*` path.
4. Allow only the identities you want to use.

## RAG and Vectorize

The application uses two isolated Cloudflare Vectorize indexes. Both indexes use `@cf/qwen/qwen3-embedding-0.6b`, 1024-dimensional vectors, cosine similarity, and metadata indexes on `chapter`, `article`, `source`, and `corpusVersion`.

| Corpus | Vectorize index | Purpose |
| --- | --- | --- |
| Labor law | `labor-law-qwen3-index` | Labor contracts, wages, working hours, labor safety, social insurance, and labor disputes |
| Insurance law | `insurance-law-qwen3-index` | Insurance contracts, insurance liability, claims, beneficiaries, and liability insurance |

The active corpus version is included in every query filter. This prevents vectors from an older source document from entering the active retrieval result.

The retrieval flow is:

1. Classify the question as labor-law, insurance-law, or cross-law.
2. Generate a normal query vector for single-corpus questions.
3. Generate both a normal query vector and a corpus-focused query vector for cross-law questions.
4. Query each relevant Vectorize index with metadata filters and legal article anchors.
5. Rerank and deduplicate results inside each corpus.
6. For cross-law questions, keep a balanced minimum from both corpora and then fill the remaining context slots by global relevance.
7. Provide Gemini with separate labor-law and insurance-law context sections.

After changing the ingest logic, re-run the ingest endpoint once so existing vectors pick up the normalized metadata:

`/api/ingest?code=zhongcheng-ingest-2026`

When the source document is materially revised, bump `CORPUS_VERSION` in `functions/_shared/rag.ts` and run the ingest endpoint again. Queries are restricted to the active corpus version so stale vectors cannot be returned.

## Insurance Law Corpus

The insurance-law corpus is isolated from the labor-law corpus in `insurance-law-qwen3-index`. It uses the same Qwen3 Embedding model and 1024-dimensional cosine vectors, with metadata indexes on `chapter`, `article`, `source`, and `corpusVersion`.

Run the protected insurance ingestion endpoint after deploying a revised `insurance-law.md`:

`/api/ingest-insurance?code=zhongcheng-insurance-ingest-2026`

The chat route sends insurance-specific questions to the insurance index, labor-specific questions to the labor index, and cross-domain questions to both indexes. Cross-law results are source-labelled and the final prompt requires all anchored legal articles to be cited.

## RAG Evaluation

The repository contains three fixed Chinese evaluation sets. They test both the generated answer and the raw Vectorize recall exposed through the evaluation-only `X-RAG-Eval: 1` response headers.

| Evaluation set | Cases | Coverage |
| --- | ---: | --- |
| [Labor law](tests/rag-eval.json) | 30 | 26 article-retrieval cases and 4 corpus-boundary cases |
| [Insurance law](tests/insurance-rag-eval.json) | 30 | 26 article-retrieval cases and 4 corpus-boundary cases |
| [Cross-law](tests/cross-law-rag-eval.json) | 10 | Requires both indexes, balanced recall, source separation, and complete citation |

### Running the tests

Run the labor-law evaluation with the default production endpoint:

```bash
RAG_EVAL_ENDPOINT=https://zhongcheng-law-firm.pages.dev/api/chat \
node tests/run-rag-eval.mjs
```

Run the insurance-law evaluation:

```bash
RAG_EVAL_DATASET=./insurance-rag-eval.json \
RAG_EVAL_ENDPOINT=https://zhongcheng-law-firm.pages.dev/api/chat \
RAG_EVAL_INDEX=insurance-law-qwen3-index \
RAG_EVAL_REPORT=insurance-law-eval \
node tests/run-rag-eval.mjs
```

Run the cross-law evaluation:

```bash
RAG_EVAL_DATASET=./cross-law-rag-eval.json \
RAG_EVAL_ENDPOINT=https://zhongcheng-law-firm.pages.dev/api/chat \
RAG_EVAL_INDEX='labor-law-qwen3-index + insurance-law-qwen3-index' \
RAG_EVAL_REPORT=cross-law-eval \
node tests/run-rag-eval.mjs
```

Run deterministic retrieval tests:

```bash
node tests/retrieval-unit.test.mjs
```

### Latest verified results

The latest verified production run passed all three evaluation sets:

| Metric | Result |
| --- | ---: |
| Labor-law end-to-end | 30/30 |
| Labor-law raw retrieval | 26/26 |
| Insurance-law end-to-end | 30/30 |
| Insurance-law raw retrieval | 26/26 |
| Cross-law routing and retrieval | 10/10 |
| Cross-law end-to-end | 10/10 |

Detailed reports:

- [Labor-law evaluation report](tests/reports/rag-eval-2026-07-10-final-balanced.md)
- [Insurance-law evaluation report](tests/reports/insurance-rag-eval-2026-07-10-final-balanced.md)
- [Cross-law evaluation report](tests/reports/cross-law-rag-eval-2026-07-10-final.md)

The cross-law cases are especially important: a response only passes when both the labor-law and insurance-law evidence are retrieved and the final answer does not use one law to replace the other.

## RAG Architecture

The site uses Retrieval-Augmented Generation (RAG): it retrieves relevant legal articles from one or both Cloudflare Vectorize indexes, balances and reranks the evidence, then asks Gemini to generate an answer constrained to the retrieved articles.

<p align="center">
  <img src="docs/rag-architecture.svg" alt="Zhongcheng Law Firm RAG architecture" width="720">
</p>
