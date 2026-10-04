# Verified sources for the BESPOKE research plan

Collected 4 October 2026 by five research passes. Every item below was checked against a publisher page, DOI, arXiv, GitHub, Hugging Face, PyPI or an official docs page. Items marked *unverified* were not confirmed and are not used as facts in the plan.

## Closest prior work (garment specification and generation)

| Work | Venue | DOI / URL | What it does | Main limitation for us |
|---|---|---|---|---|
| ChatGarment (Bian et al.) | CVPR 2025, pp. 2924–2934 | 10.1109/CVPR52734.2025.00278 | VLM writes JSON garment spec → GarmentCodeRC → sewing pattern on SMPL-X; zero-shot multi-turn edits; >40K garments, ~1M images | English only, one image, edits leak across parts, no measurements |
| Design2GarmentCode (Zhou et al.) | CVPR 2025, pp. 23712–23722 | 10.1109/CVPR52734.2025.02208 | LMM synthesises GarmentCode programs; self-correction against simulation; 30 pattern-makers rated output | one standard body; no straps/halter; no multi-image |
| AIpparel (Nakayama et al.) | CVPR 2025 (Highlight), pp. 8138–8149 | 10.1109/CVPR52734.2025.00762 | multimodal LLM over GCD-MM (>120K garments), text/image→pattern, instruction edits | one image; fixed edit types; mean SMPL body |
| TailorCoPilot (Sun et al.) | UIST 2026, to appear | arXiv 2608.25462 | version-controlled pattern state (TailorTrace), VLM reads text + references; N=20 study, OR 2.31 | pattern-maker tool, not customer intake; no Indic, no ratings |
| MAI / FashionMT (Chen et al.) | ICLR 2025 | proceedings.iclr.cc 2025 | multi-turn composed retrieval with rollback/combination across turns; 1.07M images | retrieval only; coarse attributes |
| EasyFashion (Qu et al.) | preprint, Sep 2026 | arXiv 2609.18483 | reference images + text + body photos → design, try-on, sewing pattern | preprint; no tailors in main studies |
| GarmentCode (Korosteleva, Sorkine-Hornung) | ACM TOG 42(6) 2023 | 10.1145/3618351 | DSL for parametric sewing patterns | closed Western component library |
| GarmentCodeData | ECCV 2024, LNCS | 10.1007/978-3-031-73027-6_7 | 115K made-to-measure garments, CC BY 4.0 | synthetic, Western |
| GarmageNet | ACM TOG 44(6) 2025 | 10.1145/3763271 | geometry-image pattern pieces; GarmageSet 14,801 (786 cheongsams) | one avatar |
| DressCode (He et al.) | ACM TOG 43(4) 2024 | 10.1145/3658147 | SewingGPT text→pattern | 37.0% edit accuracy (AIpparel test) |
| SewingLDM (Liu et al.) | ICCV 2025 | 10.1109/ICCV51701.2025.01639 | latent diffusion, conditions on SMPL body shape | no dialogue or editing |
| GarmentDiffusion | IJCAI 2025 | 10.24963/ijcai.2025/163 | parallel edge-token diffusion | little numeric control |
| Sewformer / SewFactory (Liu et al.) | ACM TOG 42(6) 2023 | 10.1145/3618319 | single image → pattern | 2.8% stitch accuracy on GCD-MM |
| Fashion IQ (Wu et al.) | CVPR 2021 | 10.1109/CVPR46437.2021.01115 | 77,684 images, 60,272 relative captions | one reference, 3 categories |
| CCIN (Tian et al.) | CVPR 2025 | 10.1109/CVPR52734.2025.00376 | finds attribute conflicts reference vs. request | retrieval only |
| ReCALL (Yang et al.) | CVPR 2026 | arXiv 2602.01639 | FashionIQ avg R@10 57.04 / R@50 76.42 | retrieval only |
| SIMMC 2.0 (Kottur et al.) | EMNLP 2021 | 10.18653/v1/2021.emnlp-main.401 | 11,244 dialogues, DST, coreference | catalogue choice, English |
| FashionComposer (Ji et al.) | SIGGRAPH 2025 | 10.1145/3721238.3730663 | binds several reference images to text tokens | photo output |
| Davis et al. | CHI 2024 | 10.1145/3613904.3642908 | text prompts restrict novice design exploration | ideation only |
| Generative AI in Fashion: Overview (Shi et al.) | ACM TIST 2025 | 10.1145/3718098 | survey, 470+ papers | — |
| Kouture (Suman et al.) | LNNS, Springer 2025 | 10.1007/978-981-96-2697-7_31 | ~20K kurta images; sleeve, neckline, hemline labels | no patterns |
| IndoFashion (Rajput, Aneja) | CVPR Workshops 2021 | github.com/IndoFashion/IndoFashion | 106K images, 15 Indian classes | classification only |
| Conformal Intent Classification and Clarification (den Hengst et al.) | Findings NAACL 2024 | 2024.findings-naacl.156 | conformal sets → clarification questions | intent classification, not slots |
| Calibrating Structured Output Predictors (Jagannatha, Yu) | ACL 2020 | 2020.acl-main.188 | entity-level calibration | — |
| FnCTOD | ACL 2024 | ACL Anthology | DST as function calling | — |
| Deldjoo et al., A Review of Modern Fashion Recommender Systems | ACM CSUR 56(4) | 10.1145/3624733 | survey | — |
| Ding et al., Computational Technologies for Fashion Recommendation | ACM CSUR 56(5) | 10.1145/3627100 | survey | — |
| Misra, Wan, McAuley | RecSys 2018 | cseweb.ucsd.edu/~jmcauley/pdfs/recsys18e.pdf | RTR 192,544 / ModCloth 82,790 transactions; AUC 0.719 / 0.657 | — |

Baseline numbers: AIpparel stitch accuracy 77.2% vs Sewformer-FT 2.8%; Design2GarmentCode pattern-maker agreement 79.83% (text) / 88.67% (image); SIMMC 2.0 GPT-2 slot F1 81.72%.

## Datasets

- Fashionpedia (ECCV 2020): 48,825 images; 27 categories + 19 parts; 294 attributes in groups nickname 153, silhouette 25, neckline 25, finishing 21, pattern 18, length 15, opening 10, material 10, waistline 7, animal 6, leather 4. Annotations CC BY 4.0, many images CC BY-NC-ND. No saree, kurta or lehenga.
- DeepFashion-MultiModal (Text2Human, TOG 2022): 44,096 images; parsing, keypoints, 12 shape attributes, fabric and colour per region, text descriptions. Non-commercial.
- IndoFashion: 106K, 15 classes. Atlas: 183,996 images, 52 category paths, Indian retailers. Kouture: ~20K kurtas with attributes.
- Kaggle Fashion Product Images (Myntra): ~44K; styles.csv columns id, gender, masterCategory, subCategory, articleType, baseColour, season, year, usage, productDisplayName.
- H&M Personalized Fashion Recommendations (Kaggle 2022): Sep 2018–Sep 2020; 1,371,980 customers; 105,542 articles; ~31.8M transactions (exact count unverified); 25 article columns incl. detail_desc; metric MAP@12; winners used two-stage candidate generation + GBDT ranking.
- Amazon Reviews 2023 (Hou et al.): 571.54M reviews; Clothing_Shoes_and_Jewelry 66.0M ratings, 22.6M users, 7.2M items; Amazon_Fashion 2.5M ratings.
- RentTheRunway 192,544 transactions (105,508 users, 5,850 items); ModCloth 82,790 (47,958 users, 1,378 items); CC BY 4.0 Kaggle mirror.
- FashionIQ, SIMMC 2.0/2.1 (CC BY-NC-SA 4.0), MAVE (2.2M products, CC BY-NC 4.0 labels), GarmentCodeData (CC BY 4.0), GCD-MM.
- COMI-LINGUA (Findings EMNLP 2025): 125K+ code-mixed Hindi-English instances, CC BY 4.0; LID, POS, NER, normalisation, MT.
- L3Cube HingCorpus: 52.93M romanised Hinglish tweets, 1.04B tokens.
- INDIAsize (NIFT): 3D scans of 26,000+ people aged 15+, six cities, Jul 2021–Sep 2022; 14 male and 13 female size charts on indiasize.in since 2 Jan 2026 (registration); raw data not public.
- LookBench (Jan 2026, preprint): GR-Lite R@1 65.71, Marqo-FashionCLIP 63.24, Marqo-FashionSigLIP 62.77, SigLIP2-L 54.84.
- MODA (Sep 2026, preprint): trained head on FashionSigLIP 0.6245 micro-F1 vs zero-shot Qwen3-VL-8B 0.1805 on Fashionpedia crops.

## Models

- Marqo-FashionSigLIP (Aug 2024, Apache 2.0, ~0.2B): text-to-image AvgRecall 0.231 vs FashionCLIP 2.0 0.163.
- FashionCLIP (Chia et al., Scientific Reports 2022, MIT).
- SigLIP 2 (Feb 2025, Apache 2.0). DINOv3 (Aug 2025). SAM 2.1 (Apache 2.0). SAM 3 (Nov 2025, 848M, SAM License, gated). Sapiens (ECCV 2024, CC BY-NC). Sapiens2 (ICLR 2026).
- Qwen3-VL (Sep–Oct 2025, Apache 2.0). Qwen3.5 (small models 2 Mar 2026: 0.8B, 2B, 4B, 9B; Apache 2.0; 201 languages; 262K context). Gemma 4 (Apr 2026, Apache 2.0, E2B/E4B/26B-A4B/31B/12B).
- FLUX.2 [klein] 4B (Jan 2026, Apache 2.0). CatVTON (ICLR 2025, CC BY-NC-SA).
- ModernBERT (Dec 2024, Apache 2.0, 149M/395M, English, ACL 2025). mmBERT (Sep 2025, MIT, 140M/307M, 1,833 languages, ICML 2026). MuRIL (17 Indian languages + transliterated, Apache 2.0). IndicBERT v2 (ACL 2023, MIT). HingBERT/HingMBERT/HingRoBERTa (L3Cube, CC BY 4.0). mDeBERTa-v3 (MIT). IndicBERT-v3 (Dec 2025–Jan 2026, gated).
- GLiNER (NAACL 2024). GLiNER2 (EMNLP 2025 demos; base ~205M, multi ~307M). GLiNER2.5 (Aug 2026). NuExtract3 (Apr 2026, 4B on Qwen3.5-4B, Apache 2.0).
- Qwen3-Embedding 0.6B/4B/8B (Jun 2025, Apache 2.0). EmbeddingGemma-300m (Sep 2025). BGE-M3 (MIT).
- XGrammar (MLSys 2025, v0.2.8). llguidance (v1.9.1, MIT). Outlines (v1.3.3). vLLM 0.30.0. llama.cpp JSON-schema → GBNF. Ollama format = JSON schema.
- IndicTrans2 (TMLR 2023, MIT). IndicXlit (MIT). Aksharantar (Findings EMNLP 2023).
- BERTopic 0.17.4; FASTopic (NeurIPS 2024); TopicGPT (NAACL 2024).
- Unsloth QLoRA VRAM: 3B 3.5 GB, 7B 5 GB, 8B 6 GB, 9B 6.5 GB.
- Libraries: spaCy 3.8.16, Stanza 1.15.0, sklearn-crfsuite 0.5.0, hmmlearn 0.3.3, NLTK 3.10.3, seqeval 1.2.2, transformers 5.18.0, PEFT 0.21.2.

## Big data

- Spark 4.0.0 (23 May 2025), 4.1.0 (16 Dec 2025), 4.2.0 (14 Jul 2026, latest). Spark 4.2: Java 17/21/25, Scala 2.13, Python 3.10+. Scala 3 not supported.
- 4.0: ANSI on by default, VARIANT, Python Data Source API, transformWithState. 4.1: Declarative Pipelines, Real-Time Mode, Spark ML on Connect GA (Python). Spark Connect has no RDD API.
- MLlib (spark.ml): ALS (implicit, coldStartStrategy), FPGrowth, PrefixSpan, LDA, Word2Vec, CountVectorizer, HashingTF/IDF, NGram, LSH.
- Hadoop 3.5.0 (2 Apr 2026). Delta Lake 4.4.0 (Spark 4.2). Spark NLP 7.0.0 (23 Sep 2026) supports Spark 4 and BertForTokenClassification.
- Databricks Free Edition: serverless only, no Scala/R, no RDD, no cache, non-commercial. So Scala/RDD/MapReduce parts run on local Spark.

## Market, law

- India: about 12 million custom tailors in 2024 (PLFS 2023-24, NIC 14105; Data For India), 72% women; 5M of 14M manufacturing jobs added 2018–2024.
- TailorSmart (2017, 25 cities, 800+ tailors), Bombay Shirt Company, Tailorman, eShakti: option menus and measurement forms; none turns free text or moodboards into a spec.
- No credible published remake rate for Indian custom tailoring.
- DPDP Act 2023; DPDP Rules notified Nov 2025; consent-manager provisions from 13 Nov 2026; main obligations from 13 May 2027.

## Developer platforms

- Pinterest API v5: authorize https://www.pinterest.com/oauth/, token POST https://api.pinterest.com/v5/oauth/token (Basic auth). Scopes boards:read, boards:read_secret, pins:read, pins:read_secret, user_accounts:read. Endpoints GET /v5/boards, /v5/boards/{id}/pins, /v5/boards/{id}/sections, /v5/pins/{id}. Images 150x150, 400x300, 600x, 1200x. page_size ≤ 250, bookmark pagination. Trial 1,000 requests/day. Access token 30 days; continuous refresh token 60 days.
- Apps registered on/after 14 Sep 2026 may get 403 PINNER_DATA_ACCESS_DENIED for non-business users without Pinterest approval.
- Guidelines: no storing information from the API (call each time); delete Pinterest Data and derivatives within 30 days on revocation; link back and attribute; no new content from Pins; no AI/ML training without express written consent.
- Instagram Basic Display API ended 4 Dec 2024; current APIs serve professional accounts' own media only; no saved-posts edge; oEmbed for front-end display only (tokenless since 15 Jun 2026). Import = user uploads or PWA Web Share Target (Chrome/Edge, not Safari/Firefox).
- Excalidraw: MIT; @excalidraw/excalidraw 0.18.1 (20 Apr 2026). Scene {type, version, source, elements, appState, files}. Image element: fileId, status, scale, crop. Arrow: points, startBinding/endBinding {elementId, focus, gap}. Text: containerId. frameId, groupIds, customData. files[fileId] = {mimeType, id, dataURL, created}. fileId = SHA-1 of bytes. UI resizes images to ≤1440 px and rejects >4 MiB. API: getSceneElements, getAppState, getFiles, updateScene, addFiles, onChange; exportToBlob/Svg/Canvas; serializeAsJSON(elements, appState, files, "local"). Next.js: client component + dynamic(..., {ssr:false}) + index.css. Excalidraw's diagram-to-code exports a frame as one JPEG plus its texts.
- tldraw: production use needs a licence; Excalidraw (MIT) has no such restriction.
- Hosted multimodal LLM APIs accept several labelled image blocks per message; large batches need images resized to about 2000 px or less.

## Core literature review set (IEEE, Springer, Elsevier, Taylor & Francis; 2022-2026)

1. Brinkmann et al., Using LLMs for the Extraction and Normalization of Product Attribute Values. ADBIS 2024, LNCS 14918, 217-230. 10.1007/978-3-031-70626-4_15. GPT-4 F1 91% on WDC-PAVE (59 sites, 5 categories).
2. Brinkmann et al., ExtractGPT. iiWAS 2024, LNCS 15342, 38-52. 10.1007/978-3-031-78090-5_4. GPT-4 avg F1 85%; fine-tuned GPT-3.5 loses unseen values.
3. Zhao et al., Fashion-Related Attribute Value Extraction with Visual Prompting. NLPCC 2025, LNCS, 107-118. 10.1007/978-981-95-3343-5_9.
4. Jia et al., MuJo-SF. IEEE TMM 26, 10354-10366, 2024. 10.1109/TMM.2024.3407667. MAVP 79k pairs.
5. Cheng et al., ChatPreference. Journal of Engineering Design 37(9), 3560-3589, 2026 (T&F). 10.1080/09544828.2026.2655935.
6. Park et al., FEA consumer needs model ... conversational recommendation. Fashion and Textiles 12, art. 24, 2025. 10.1186/s40691-025-00435-w.
7. Quan et al., Knowledge graph in clothing commodity field, BERT-Lattice-Att-CRF. IEEE ITNEC 2024, 188-194. 10.1109/ITNEC60942.2024.10732986.
8. Chia et al., FashionCLIP. Scientific Reports 12, 18958, 2022. 10.1038/s41598-022-23052-9.
9. Song et al., FashionGPT. ICANN 2024, LNCS, 308-323. 10.1007/978-3-031-72344-5_21.
10. Kishore Kumar et al., Indian ethnic wear fine-grain classification. Springer 2024, 37-66. 10.1007/978-981-99-8398-8_4. Category acc 92%, attribute AP50 83%.
11. Suman et al., Kouture. LNNS 2025, 421-435. 10.1007/978-981-96-2697-7_31.
12. Bian et al., ChatGarment. CVPR 2025. 10.1109/CVPR52734.2025.00278.
13. Zhou et al., Design2GarmentCode. CVPR 2025. 10.1109/CVPR52734.2025.02208.
14. Gui et al., GenPattern. Journal of Manufacturing Systems 83, 822-838, 2025 (Elsevier). 10.1016/j.jmsy.2025.11.005. Stitch acc 86.7%, vertex error 2.9 cm.
15. Khleborodova, Kim, taxonomy-driven fashion image generation. Fashion and Textiles 13, art. 27, 2026. 10.1186/s40691-026-00477-8.
16. Ngai et al., GenAI system for fashion design: a case study. IEEE TEM 72, 1320-1333, 2025. 10.1109/TEM.2025.3554248. 30 practitioners, two HK firms.
17. Santiago et al., From Prompt-to-Mood Board. Springer Series in Design and Innovation, 2026, 202-218. 10.1007/978-3-032-13836-1_15.
18. Goyal et al., Scalable hybrid recommendation framework ... distributed big data. Discover Computing 29, art. 597, 2026. 10.1007/s10791-026-10544-9. ALS + TF-IDF on Spark/Hadoop, 4.6M-40M+ records.
19. Ding et al., REAR fashion trend forecasting. IEEE TMM 24, 2287-2299, 2022. 10.1109/TMM.2021.3078907.
20. Shirke et al., Robust NER in Hinglish code-mixed text, ensemble of HingBERT models. IEEE ICCUBEA 2025. 10.1109/ICCUBEA65967.2025.11283863.

Reserve: AIpparel (10.1109/CVPR52734.2025.00762); SewingLDM (10.1109/ICCV51701.2025.01639); IndoFashion CVPRW 2021 (10.1109/CVPRW53098.2021.00440); Zhu et al. IEEE TMM 2024 (10.1109/TMM.2023.3284593); Karanth et al. IEEE Access 2024 saree components (10.1109/ACCESS.2024.3352649); Selwon & Szymanski fashion ontology LNNS 2024 (10.1007/978-3-031-61857-4_26); Sun et al. Computational Intelligence (Wiley) 2024 NER in product titles (10.1111/coin.12654); Huang et al. J. Textile Institute 2024 anthropometric prediction (10.1080/00405000.2024.2352183); Mathew et al. Cogent Business & Management 2026 apparel mass customization in India (10.1080/23311975.2026.2731811); Wu & Li, Int. J. Design Creativity and Innovation 2025 (10.1080/21650349.2025.2529167); Roy et al. ESWA 243, 2024 (10.1016/j.eswa.2023.122850, abstract not read).
