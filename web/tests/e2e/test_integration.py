"""Integration tests: the browser engine with the tagger, and with the language-model function (mocked over the network)."""
import json

from conftest import open_home, order_rows, send


def test_tagger_is_used_once_loaded(page):
    open_home(page, wait_tagger=True)
    send(page, "kurtee in georget")          # two spellings the gazetteer has never seen
    assert page.evaluate("window.__bespokeTimings.tagBy.at(-1)") == "bert"
    rows = order_rows(page)
    assert rows["Garment"].startswith("kurti") and rows["Fabric"].startswith("georgette")


def test_model_layer_adds_values_and_notes(page):
    reply = {"updates": [
        {"op": "set", "slot": "lower.silhouette", "value": {"value": "jogger", "p": 0.85, "src": "model", "evidence": "x"}},
        {"op": "note", "slot": "notes", "value": {"value": "kangaroo pocket", "p": 0.8, "src": "model", "evidence": "x"}},
    ]}
    page.route("**/api/understand", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(reply)))
    open_home(page)
    send(page, "a grey hoodie and joggers with a kangaroo pocket")
    rows = order_rows(page)
    assert rows["Silhouette"].startswith("jogger")
    assert "kangaroo pocket" in rows["Notes"]


def test_model_layer_failure_falls_back(page):
    page.route("**/api/understand", lambda r: r.fulfill(status=500, body="boom"))
    open_home(page)
    send(page, "a navy silk sherwani")
    assert order_rows(page)["Garment"].startswith("sherwani")


def test_model_layer_timeout_falls_back(page):
    page.route("**/api/understand", lambda r: None)   # never answers
    open_home(page)
    page.fill(".field input", "a black dress")
    page.click("button.send")
    page.wait_for_selector(".reply", timeout=12000)    # the client gives up after 7 s and answers from the device
    assert order_rows(page)["Garment"].startswith("dress")
