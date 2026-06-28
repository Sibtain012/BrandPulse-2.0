"""
Token analyzer for keyword co-occurrence.

Deterministic, dependency-free tokenizer:
  - lowercase
  - keep only alphabetic tokens (drops numbers, punctuation, urls)
  - drop English stopwords (inline set, no NLTK download required)
  - keep tokens with 3+ letters

extract_tokens(text) -> list[str]   (unique-per-document is the caller's job)
"""

import re

# Inline English stopword set. Avoids the NLTK dependency + nltk.download step,
# keeping the pipeline deterministic and offline. ~180 common words.
STOPWORDS = frozenset("""
a able about above after again against all am an and any are aren't as at be
because been before being below between both but by can can't cannot could
couldn't did didn't do does doesn't doing don't down during each few for from
further had hadn't has hasn't have haven't having he he'd he'll he's her here
here's hers herself him himself his how how's i i'd i'll i'm i've if in into is
isn't it it's its itself let's me more most mustn't my myself no nor not of off
on once only or other ought our ours ourselves out over own same shan't she
she'd she'll she's should shouldn't so some such than that that's the their
theirs them themselves then there there's these they they'd they'll they're
they've this those through to too under until up very was wasn't we we'd we'll
we're we've were weren't what what's when when's where where's which while who
who's whom why why's with won't would wouldn't you you'd you'll you're you've
your yours yourself yourselves
just really very also get got like one two get also would could really
amp http https www com org net via rt
will now even don dont doesnt didnt cant wont isnt arent wasnt werent
much many lot still back way thing things going know think see make made
""".split())

# Alphabetic tokens only (letters + apostrophes for contractions, stripped later).
_TOKEN_RE = re.compile(r"[a-z]+")


def extract_tokens(text):
    """Return a list of cleaned tokens from raw text."""
    if not text:
        return []
    lowered = text.lower()
    tokens = _TOKEN_RE.findall(lowered)
    return [t for t in tokens if len(t) >= 3 and t not in STOPWORDS]


if __name__ == "__main__":
    # Manual smoke test
    sample = "Tesla's new BATTERY tech is amazing! Visit https://tesla.com #EV 2024"
    print(extract_tokens(sample))
