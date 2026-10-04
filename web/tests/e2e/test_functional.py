"""Functional tests: what a customer does, end to end, in a real browser."""
from conftest import open_home, order_rows, send


def answer_all(page, limit=10):
    for _ in range(limit):
        last = page.locator(".reply").last
        if last.locator(".ask").count() == 0:
            return
        last.locator(".ask").first.locator(".opt").first.click()
        page.wait_for_timeout(250)


def test_friends_request_becomes_a_set(page):
    open_home(page, wait_tagger=True)
    send(page, "i want a sweatshirt and pants dark blue cord set that i can wear in the cold")
    reply = page.locator(".reply").last.locator("p").inner_text()
    assert reply.startswith("A navy co-ord set: a sweatshirt with pants")
    rows = order_rows(page)
    assert rows["Garment"].startswith("co-ord set") and "sweatshirt" in rows["Pieces"] and "navy" in rows["Colour"]
    qs = page.locator(".reply").last.locator(".ask .q").all_inner_texts()
    assert qs and not any("neckline" in q.lower() for q in qs)


def test_answering_everything_ends_with_shopping(page):
    open_home(page)
    send(page, "a black kurti for office")
    answer_all(page)
    assert page.locator(".finale").count() == 1
    assert page.locator(".finale .card").count() >= 4
    assert page.locator(".reply").last.locator("text=Add pictures").count() == 0


def test_garment_picker_changes_the_garment(page):
    open_home(page)
    send(page, "a red kurti")
    page.locator(".order .item").first.locator("button").click()
    page.fill(".sheetpop .search", "sweat")
    page.click(".sheetpop .choice >> text=sweatshirt")
    assert order_rows(page)["Garment"].startswith("sweatshirt")


def test_palette_and_exact_shade(page):
    open_home(page)
    send(page, "a red kurti")
    page.locator(".order .item", has_text="Colour").locator("button").click()
    page.click(".swatch >> text=mint")
    assert order_rows(page)["Colour"].startswith("mint")
    page.locator(".order .item", has_text="Colour").locator("button").click()
    page.locator(".slider").nth(2).fill("10")
    page.click(".custom .btn")
    page.click(".sheetpop .done")
    assert "exact colour #" in order_rows(page).get("Notes", "")


def test_sheet_switches_fully_to_hindi(page):
    open_home(page)
    send(page, "a cotton kurti with a v neck and full sleeves")
    page.click(".seg >> text=Sheet")
    page.click("text=हिंदी में दिखाएँ")
    first_parts = page.locator(".sheet td:first-child").all_inner_texts()
    assert all(any("ऀ" <= ch <= "ॿ" for ch in p) for p in first_parts), first_parts
    assert any("ऀ" <= ch <= "ॿ" for ch in page.inner_text(".sheet h3"))
    page.click("text=Show in English")
    assert "Neckline" in page.locator(".sheet td:first-child").all_inner_texts()


def test_shop_page_and_wearer(page):
    open_home(page)
    send(page, "a grey hoodie")
    page.click(".seg >> text=Shop")
    assert page.locator(".cards").first.locator(".card").count() == 5
    assert page.locator(".card img").count() >= 5
    page.click('.searchline .seg >> text="Men"')
    assert page.inner_text(".searchline .q").splitlines()[-1].startswith("men's")


def test_moodboard_opens_with_blush_canvas(page):
    open_home(page)
    page.click(".seg >> text=Board")
    page.wait_for_selector(".excalidraw")
    assert page.locator(".boardwelcome h3").inner_text() == "Your moodboard"
    bg = page.evaluate("getComputedStyle(document.querySelector('.excalidraw .excalidraw__canvas, .excalidraw canvas')).backgroundColor || ''")
    assert page.locator("text=Read the board").count() == 1
    assert bg is not None


def test_new_design_resets(page):
    open_home(page)
    send(page, "a red kurti")
    page.click("text=New design")
    page.wait_for_selector(".hero h1")
    assert page.locator(".said").count() == 0


def test_conversation_survives_a_reload(page):
    open_home(page)
    send(page, "a red kurti")
    page.reload()
    page.wait_for_selector(".said")
    assert "kurti" in page.inner_text(".said")
