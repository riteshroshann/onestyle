# POS gold guidelines

`pos.jsonl` holds the 60 requests `gold-01` to `gold-60` of `binding.jsonl` (525 tokens), tokenised by `bespoke.lexicon.tokenize` and tagged by one annotator with Universal POS tags. Romanised Hinglish has no treebank, so the choices below are this project's, modelled on the Hindi UD treebanks where they exist.

- Garments, parts, fabrics, embellishments, occasions and necklines are NOUN, also when they modify another noun ("cotton kurti", "boat neck": both NOUN). Festival and event names (diwali, navratri) are PROPN; "mehndi", "haldi", "sangeet" are NOUN.
- Colours, fits, lengths and styles are ADJ ("blue kurti", "kurti loose", "knee length": knee NOUN, length NOUN). A colour used alone as a noun ("mustard nahi chahiye", "lavender maybe") is NOUN.
- Hindi postpositions are ADP: ke, ka, ki, se, pe, par, mein, tak, liye, jaisi, jaisa. English prepositions and "like", "than" are ADP.
- chahiye, hai, hona and English auxiliaries (dont) are AUX. Content verbs (rakhna, karna, banana, rakho, chalega, want, make) are VERB.
- nahi, mat, not are PART. English "no" before a noun is DET. "please" is INTJ.
- thoda and bahut are ADV before an adjective and DET before a noun ("thoda shimmer"). neeche, aage, peeche, zyada, too, only, maybe are ADV.
- aur, but, and, or are CCONJ. Numbers and reference marks ("7", "#2") are NUM; units (inch, inches) are NOUN.
- Punctuation tokens are PUNCT. Possessive "cousin's" is one NOUN token, as the tokeniser makes it.
