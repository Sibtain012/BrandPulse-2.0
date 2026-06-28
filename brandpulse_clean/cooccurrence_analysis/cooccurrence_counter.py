"""
Co-occurrence counter with PMI (Pointwise Mutual Information).

Document model: each post/comment/tweet = one "document". A token is counted
ONCE per document (presence, not frequency) so PMI reflects co-occurrence
across documents, not raw term frequency.

PMI(primary, token) = log2( P(both) / (P(primary) * P(token)) )
  P(both)    = docs_with_both    / total_documents
  P(primary) = docs_with_primary / total_documents
  P(token)   = docs_with_token   / total_documents

Positive PMI -> token appears with the keyword more than chance (relevant).
"""

import math
from collections import Counter

from token_analyzer import extract_tokens


def analyze(documents, primary_keyword):
    """
    documents       : list[str]  raw text, one per document
    primary_keyword : str        the searched keyword

    Returns dict: { token: {count, pmi_score,
                            docs_with_primary, docs_with_token, docs_with_both,
                            total_documents} }
    Only tokens that co-occur with the primary keyword are returned.
    """
    primary = primary_keyword.lower().strip()
    total_documents = len(documents)
    if total_documents == 0:
        return {}

    # token -> number of documents that contain it (presence per doc)
    doc_freq = Counter()
    # token -> number of documents containing BOTH token and primary keyword
    cooccur = Counter()
    docs_with_primary = 0

    # Primary keyword may be multi-word ("New Balance Shoes"). Treat the analysis
    # as keyword-present if ANY of its alphabetic tokens appear in the doc.
    primary_tokens = set(extract_tokens(primary)) or {primary}

    for text in documents:
        tokens = set(extract_tokens(text))  # dedupe within document
        if not tokens:
            continue

        has_primary = bool(tokens & primary_tokens)
        if has_primary:
            docs_with_primary += 1

        for tok in tokens:
            if tok in primary_tokens:
                continue  # don't co-occur the keyword with itself
            doc_freq[tok] += 1
            if has_primary:
                cooccur[tok] += 1

    if docs_with_primary == 0:
        return {}

    p_primary = docs_with_primary / total_documents
    results = {}

    for tok, both in cooccur.items():
        if both == 0:
            continue
        token_docs = doc_freq[tok]
        p_token = token_docs / total_documents
        p_both = both / total_documents
        denom = p_primary * p_token
        pmi = math.log2(p_both / denom) if denom > 0 and p_both > 0 else 0.0

        results[tok] = {
            "count": both,
            "pmi_score": round(pmi, 4),
            "docs_with_primary": docs_with_primary,
            "docs_with_token": token_docs,
            "docs_with_both": both,
            "total_documents": total_documents,
        }

    return results


if __name__ == "__main__":
    docs = [
        "tesla battery is great",
        "tesla battery range improved",
        "tesla service was slow",
        "my phone battery died",          # battery without tesla
        "random unrelated post here now",
    ]
    out = analyze(docs, "tesla")
    for tok, d in sorted(out.items(), key=lambda x: -x[1]["pmi_score"]):
        print(tok, d)
