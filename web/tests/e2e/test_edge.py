"""Negative and edge cases in the browser: bad input, hostile input, broken storage, no network."""
from conftest import open_home, order_rows, send


def test_empty_send_does_nothing(page):
    open_home(page)
    page.click("button.send")
    page.fill(".field input", "     ")
    page.click("button.send")
    page.wait_for_timeout(400)
    assert page.locator(".said").count() == 0


def test_markup_in_input_is_shown_as_text(page):
    dialogs = []
    page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    open_home(page)
    send(page, '<img src=x onerror="alert(1)"> a black kurti <script>alert(2)</script>')
    page.wait_for_timeout(500)
    assert dialogs == []
    assert "<img" in page.inner_text(".said")
    assert page.locator(".said img").count() == 0


def test_very_long_input(page):
    open_home(page)
    send(page, "a navy silk kurti with puff sleeves " * 400)
    assert order_rows(page)["Garment"].startswith("kurti")


def test_devanagari_input(page):
    open_home(page)
    send(page, "मुझे लाल कुर्ती चाहिए")
    rows = order_rows(page)
    assert rows["Garment"].startswith("kurti") and "red" in rows["Colour"]


def test_gibberish_asks_what_to_make(page):
    open_home(page)
    send(page, "asdkjh qwpoe zxmcn")
    assert "What should we make" in page.locator(".reply").last.inner_text()


def test_rapid_double_send_sends_once(page):
    open_home(page)
    page.fill(".field input", "a red kurti")
    page.click("button.send")
    page.click("button.send")
    page.wait_for_selector(".reply")
    page.wait_for_timeout(400)
    assert page.locator(".said").count() == 1


def test_works_when_storage_is_blocked(browser, site):
    ctx = browser.new_context()
    ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });")
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(site + "/")
    pg.wait_for_selector(".home-hero h1")
    pg.click('.seg >> text="Talk"')
    pg.wait_for_selector(".hero h1")
    pg.fill(".field input", "a red kurti")
    pg.click("button.send")
    pg.wait_for_selector(".reply")
    assert errors == []
    ctx.close()


def test_works_without_the_model_cdn(browser, site):
    ctx = browser.new_context()
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    pg = ctx.new_page()
    pg.goto(site + "/")
    pg.wait_for_selector(".home-hero h1")
    pg.click('.seg >> text="Talk"')
    pg.wait_for_selector(".hero h1")
    pg.fill(".field input", "a navy hoodie for the cold")
    pg.click("button.send")
    pg.wait_for_selector(".reply")
    assert "hoodie" in pg.locator(".order .item").first.inner_text()
    ctx.close()


def test_contradiction_is_resolved_not_crashed(page):
    open_home(page)
    send(page, "red kurti, no red")
    colour = page.locator(".order .item", has_text="Colour")
    assert colour.locator("dd button").count() == 0 or "red" not in colour.locator("dd button").inner_text()
    assert colour.locator(".no").inner_text() == "red"      # shown struck through, as ruled out
