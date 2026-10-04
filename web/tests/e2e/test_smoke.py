"""Smoke tests: the build serves, every page opens, the shipped files exist, nothing errors on load."""
import urllib.request

from conftest import open_home


def test_home_page_loads_without_errors(page):
    page.goto(page.site + "/")
    page.wait_for_selector(".home-hero h1")
    assert page.title() == "Bespoke"
    assert "from your words" in page.inner_text(".home-hero h1")
    assert page.locator(".seg button").all_inner_texts() == ["Home", "Talk", "Board", "Sheet", "Shop"]
    assert page.locator(".step").count() == 3
    page.click(".home-cta >> text=Start a design")
    page.wait_for_selector(".hero h1")
    assert page.errors == []


def test_shipped_files_are_served(site):
    for path in ["/models/bespoke-tagger/config.json", "/models/bespoke-tagger/tokenizer.json",
                 "/models/bespoke-tagger/onnx/model_quantized.onnx", "/licenses.txt"]:
        with urllib.request.urlopen(site + path) as r:
            assert r.status == 200, path


def test_every_section_opens(page):
    open_home(page)
    for name, probe in [("Board", ".excalidraw"), ("Sheet", ".sheet"), ("Shop", ".searchline"), ("Home", ".home-hero h1"), ("Talk", ".hero h1")]:
        page.click(f'.seg >> text="{name}"')
        page.wait_for_selector(probe, timeout=15000)
    assert page.errors == []


def test_tagger_loads(page):
    open_home(page, wait_tagger=True)
    assert page.evaluate("window.__bespokeTimings.taggerLoadMs") > 0
