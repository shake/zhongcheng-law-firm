# RAG Evaluation Set

`rag-eval.json` is the fixed Chinese evaluation set for the labor-law RAG pipeline.

- `retrieval`: the response should cite at least one expected article.
- `coverage_guardrail`: the response should disclose when the current corpus does not contain the requested legal basis.
- The evaluation request sends `X-RAG-Eval: 1`; the response then includes URL-encoded `X-RAG-Route` and `X-RAG-Recall` headers so the report can measure raw Vectorize recall separately from the final model answer.
- `tests/retrieval-unit.test.mjs` covers ambiguous-domain routing, corpus isolation, deduplication, and global reranking with deterministic fixtures.

The dataset is intentionally limited to the current `labor-law-2018-12-29-v1` corpus. When the corpus expands, add a new dataset version instead of silently changing the expected answers.
