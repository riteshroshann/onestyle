"""Usability: accessibility audit (axe-core), keyboard use, touch-target sizes, scale, reduced motion."""
import pytest

from conftest import open_home, send

AXE = "https://cdn.jsdelivr.net/npm/axe-core@4/axe.min.js"


def audit(page):
    # let fade-ins and tab transitions settle, or axe measures half-faded text
    page.wait_for_function("document.getAnimations().every(a => a.playState !== 'running' || a.effect.getTiming().iterations === Infinity)")
    page.wait_for_timeout(400)
    page.add_script_tag(url=AXE)
    res = page.evaluate("axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })")
    return [(v["id"], v["impact"], len(v["nodes"])) for v in res["violations"] if v["impact"] in ("serious", "critical")]


def test_accessibility_home(page):
    page.goto(page.site + "/")
    page.wait_for_selector(".home-hero h1")
    assert audit(page) == []
    open_home(page)
    assert audit(page) == []


def test_accessibility_conversation_sheet_shop(page):
    open_home(page)
    send(page, "a black kurti with a v neck")
    assert audit(page) == []
    page.click(".seg >> text=Sheet"); page.wait_for_selector(".sheet")
    assert audit(page) == []
    page.click(".seg >> text=Shop"); page.wait_for_selector(".searchline")
    assert audit(page) == []


def test_keyboard_only(page):
    open_home(page)
    assert page.evaluate("document.activeElement.id") == "brief"       # the brief has focus on arrival
    page.keyboard.type("a red kurti")
    page.keyboard.press("Enter")
    page.wait_for_selector(".reply")
    btn = page.locator(".order .item").first.locator("button")
    btn.focus(); page.keyboard.press("Enter")
    page.wait_for_selector(".sheetpop")
    page.keyboard.press("Escape")
    assert page.locator(".sheetpop").count() == 0


@pytest.mark.viewport({"width": 390, "height": 844})
def test_touch_targets_on_a_phone(page):
    open_home(page)
    send(page, "a black kurti")
    small = page.evaluate("""() => [...document.querySelectorAll('.send, .mic, .opt, .seg button, .order dd button')]
        .map(e => e.getBoundingClientRect()).filter(r => r.width && (r.height < 32))
        .map(r => [Math.round(r.width), Math.round(r.height)])""")
    assert small == [], small
    tall = page.evaluate("[...document.querySelectorAll('.send, .mic')].every(e => e.getBoundingClientRect().height >= 44)")
    assert tall
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")   # no sideways scrolling
    for name in ["Home", "Board", "Sheet", "Shop"]:
        page.click(f'.seg >> text="{name}"')
        page.wait_for_timeout(300)
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), name


def test_desktop_scale_matches_eighty_percent(page):
    open_home(page)
    assert page.evaluate("getComputedStyle(document.body).fontSize") == "13.6px"


@pytest.mark.viewport({"width": 390, "height": 844})
def test_phone_scale_stays_full_size(page):
    open_home(page)
    assert page.evaluate("getComputedStyle(document.body).fontSize") == "17px"


def test_reduced_motion_is_respected(browser, site):
    ctx = browser.new_context(reduced_motion="reduce")
    pg = ctx.new_page()
    pg.goto(site + "/")
    pg.wait_for_selector(".home-hero h1")
    assert pg.evaluate("getComputedStyle(document.querySelector('.fade')).animationName") == "none"
    ctx.close()


def test_headline_is_not_broken_across_lines(page):
    open_home(page)
    em = page.evaluate("(() => { const r = document.querySelector('.hero h1 em').getClientRects(); return r.length; })()")
    assert em == 1
