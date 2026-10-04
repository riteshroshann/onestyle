"""Latency in a real browser: first paint, tagger load, and the time from Send to an answer."""
import statistics
import time

from conftest import open_home, record

REQUESTS = ["a navy silk kurti with puff sleeves", "i want a sweatshirt and pants dark blue cord set for the cold",
            "lehenga chahiye shaadi ke liye, maroon, gota patti", "an ivory sherwani for my brother's wedding",
            "black oversized hoodie with a graphic print", "a linen shirt for summer office, light blue",
            "maxi dress with flutter sleeves in floral georgette", "a long wool coat in camel for winter"]


def test_first_paint(page):
    t0 = time.perf_counter()
    open_home(page)
    fcp = page.evaluate("performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1")
    record("first_contentful_paint_ms", round(fcp))
    record("hero_visible_ms", round((time.perf_counter() - t0) * 1000))
    assert 0 < fcp < 2000


def test_tagger_load_time(page):
    open_home(page, wait_tagger=True)
    ms = page.evaluate("window.__bespokeTimings.taggerLoadMs")
    record("tagger_load_ms_cold", ms)
    assert ms < 15000


def test_send_to_answer(page):
    open_home(page, wait_tagger=True)
    to_message, to_reply = [], []
    for i, text in enumerate(REQUESTS * 2):
        if i:
            page.click("text=New design")
            page.wait_for_selector(".hero h1")
        page.fill(".field input", text)
        t0 = time.perf_counter()
        page.click("button.send")
        page.wait_for_selector(".said")
        to_message.append((time.perf_counter() - t0) * 1000)
        page.wait_for_selector(".reply")
        to_reply.append((time.perf_counter() - t0) * 1000)
    tags = page.evaluate("window.__bespokeTimings.tagMs")
    q = lambda xs, p: round(sorted(xs)[min(len(xs) - 1, int(p * len(xs)))], 1)
    report = {"requests": len(to_reply), "send_to_message_p50_ms": q(to_message, .5), "send_to_message_p95_ms": q(to_message, .95),
              "send_to_answer_p50_ms": q(to_reply, .5), "send_to_answer_p95_ms": q(to_reply, .95),
              "tagger_p50_ms": round(statistics.median(tags), 1), "tagger_p95_ms": q(tags, .95)}
    record("send_to_answer", report)
    assert report["send_to_answer_p95_ms"] < 1000, report
    assert report["tagger_p95_ms"] < 150, report
