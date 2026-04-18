
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;





--
-- TOC entry 5312 (class 0 OID 35669)
-- Dependencies: 258
-- Data for Name: api_usage_log; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5283 (class 0 OID 18781)
-- Dependencies: 229
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5275 (class 0 OID 18710)
-- Dependencies: 221
-- Data for Name: auth_identities; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5285 (class 0 OID 19188)
-- Dependencies: 231
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5302 (class 0 OID 20138)
-- Dependencies: 248
-- Data for Name: dim_content_type; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5297 (class 0 OID 20109)
-- Dependencies: 243
-- Data for Name: dim_date; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5305 (class 0 OID 20164)
-- Dependencies: 251
-- Data for Name: dim_model; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5300 (class 0 OID 20125)
-- Dependencies: 246
-- Data for Name: dim_platform; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5304 (class 0 OID 20151)
-- Dependencies: 250
-- Data for Name: dim_sentiment; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5298 (class 0 OID 20118)
-- Dependencies: 244
-- Data for Name: dim_time; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5307 (class 0 OID 20176)
-- Dependencies: 253
-- Data for Name: fact_sentiment_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5287 (class 0 OID 19941)
-- Dependencies: 233
-- Data for Name: global_keywords; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5309 (class 0 OID 35622)
-- Dependencies: 255
-- Data for Name: keyword_cache; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5296 (class 0 OID 20083)
-- Dependencies: 242
-- Data for Name: ml_models; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5310 (class 0 OID 35645)
-- Dependencies: 256
-- Data for Name: pipeline_runs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5294 (class 0 OID 20071)
-- Dependencies: 240
-- Data for Name: silver_errors; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5292 (class 0 OID 20057)
-- Dependencies: 238
-- Data for Name: silver_reddit_comment_sentiment_summary; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5291 (class 0 OID 20042)
-- Dependencies: 237
-- Data for Name: silver_reddit_comments; Type: TABLE DATA; Schema: public; Owner: -
--

-- TOC entry 5366 (class 0 OID 0)
-- Dependencies: 247
-- Name: dim_content_type_content_type_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5367 (class 0 OID 0)
-- Dependencies: 245
-- Name: dim_platform_platform_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5368 (class 0 OID 0)
-- Dependencies: 249
-- Name: dim_sentiment_sentiment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5369 (class 0 OID 0)
-- Dependencies: 252
-- Name: fact_sentiment_events_fact_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5370 (class 0 OID 0)
-- Dependencies: 232
-- Name: global_keywords_global_keyword_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5371 (class 0 OID 0)
-- Dependencies: 254
-- Name: keyword_cache_cache_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5372 (class 0 OID 0)
-- Dependencies: 241
-- Name: ml_models_model_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5373 (class 0 OID 0)
-- Dependencies: 239
-- Name: silver_errors_error_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5374 (class 0 OID 0)
-- Dependencies: 236
-- Name: silver_reddit_comments_silver_comment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5375 (class 0 OID 0)
-- Dependencies: 234
-- Name: silver_reddit_posts_silver_post_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5376 (class 0 OID 0)
-- Dependencies: 259
-- Name: silver_twitter_tweets_silver_tweet_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5377 (class 0 OID 0)
-- Dependencies: 222
-- Name: user_profiles_profile_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5378 (class 0 OID 0)
-- Dependencies: 224
-- Name: user_sessions_session_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- TOC entry 5379 (class 0 OID 0)
-- Dependencies: 226
-- Name: verification_tokens_token_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



-- Completed on 2026-01-13 14:12:19

--
-- PostgreSQL database dump complete
