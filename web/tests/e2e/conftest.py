"""Shared fixtures for the browser tests: a static server over the production build, and a fresh page per test.

Run from the repository root:  engine/.venv/Scripts/python -m pytest web/tests/e2e -q   (build the site first)
"""
import functools
import http.server
import json
import socket
import threading
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WEB = Path(__file__).resolve().parents[2]
OUT = WEB / "out"
RESULTS = WEB.parent / "results"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):   # behaves like a deployment without LLM_API_KEY
        self.send_response(501)
        self.end_headers()


@pytest.fixture(scope="session")
def site():
    assert (OUT / "index.html").exists(), "build the site first: node node_modules/next/dist/bin/next build"
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Quiet, directory=str(OUT)))
    srv.handle_error = lambda *a: None   # the browser cancelling a download is not a failure
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{port}"
    srv.shutdown()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture()
def page(browser, site, request):
    marker = request.node.get_closest_marker("viewport")
    vp = marker.args[0] if marker else {"width": 1440, "height": 900}
    ctx = browser.new_context(viewport=vp)
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" and "501" not in m.text and "favicons" not in m.text else None)
    pg.site = site
    yield pg
    ctx.close()


def open_home(page, wait_tagger=False):
    """Open the site and go to Talk, where the brief is."""
    page.goto(page.site + "/studio/")
    page.wait_for_selector(".hero h1")
    if page.locator(".home-hero").count():
        page.click('.seg >> text="Talk"')
    page.wait_for_selector(".hero h1")
    if wait_tagger:
        page.wait_for_function("window.__bespokeTimings && window.__bespokeTimings.taggerLoadMs > 0", timeout=30000)


def send(page, text):
    page.fill(".field input", text)
    page.click("button.send")
    page.wait_for_selector(".reply")


def order_rows(page):
    return {r.locator("dt").inner_text(): r.locator("dd").inner_text() for r in page.locator(".order .item").all()}


def record(name, data):
    RESULTS.mkdir(exist_ok=True)
    path = RESULTS / "latency-browser.json"
    allr = json.loads(path.read_text()) if path.exists() else {}
    allr[name] = data
    path.write_text(json.dumps(allr, indent=1))


def pytest_configure(config):
    config.addinivalue_line("markers", "viewport(size): run the test at a given viewport")
