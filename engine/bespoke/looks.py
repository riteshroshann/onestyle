"""The visual catalogue: one picture per ontology value, so customers can choose by looking.

Every key is "<slot>/<value>" or "<slot>/<value>@<context>", using the ontology's own value IDs, so the
picker, the tagger and the language-model layer all speak the same names. A context gives a second picture
where the same word means a different shape: "straight" for a kurta and "straight" for trousers.

Line drawings use one style throughout. Where only one detail should change (necklines, sleeves, lengths,
fits), the drawing is an edit of a shared base drawing, so the set reads like a tailor's tech pack. Fabrics,
prints and finishes are photographs, because texture does not survive as line art.
"""
from __future__ import annotations

LINE = ("Drawn as a technical fashion flat sketch: front view, clean uniform black ink outlines on a pure white "
        "background, minimal tech-pack line drawing with no shading, no colour, no fill, no texture, no person, "
        "no mannequin, no hanger, no text and no labels. The garment is centred with generous white margins.")
FIGURE = ("Drawn as a minimal fashion croquis: one faceless, hairless figure standing straight and facing front, "
          "arms relaxed slightly away from the body, the whole figure from head to feet visible, clean uniform "
          "black ink outlines on a pure white background, no shading, no colour, no fill, no text, no labels.")
FABRIC = ("A close-up product photograph that fills the whole frame with {s}, softly folded, in soft diffused "
          "daylight with sharp focus on the texture and weave. No text, no props, no people.")
PRINT = ("A top-down photograph of a flat square swatch of cotton fabric that fills the whole frame, printed with "
         "{s}, in deep indigo on ivory, evenly lit. No text, no props, no people.")
FINISH = ("A close-up photograph that fills the whole frame with {s} on ivory silk, in soft diffused daylight with "
          "sharp detail. No text, no props, no people.")

KEEP = " Keep everything else exactly the same: the same garment, the same line style, the same framing and size."

# Base drawings that edits start from. Each is drawn once from its prompt.
BASES = {
    "top": "A plain women's woven top with a simple round neckline and short set-in sleeves, hip length. " + LINE,
    "knit": "A plain sweatshirt with a ribbed crew neckline, full sleeves with ribbed cuffs and a ribbed hem. " + LINE,
    "kurta": "A plain knee-length straight kurta with a round neckline, three-quarter sleeves and side slits. " + LINE,
    "trousers": "A pair of plain straight-leg trousers with a waistband, full length, shown flat from the front. " + LINE,
    "figure": "A figure wearing a plain round-neck straight kurta that ends at the hip, over slim trousers. " + FIGURE,
    "figure_bottom": "A figure wearing a plain fitted t-shirt and plain straight trousers that end at the ankle. " + FIGURE,
}

# slot, base for edits (None draws from text), kind, then value -> description.
# For edits the description completes "Change ... to ..."; for text it is the subject of the drawing.
GROUPS: list[dict] = [
    {"slot": "garment", "kind": "line", "items": {
        "kurti": "a women's kurti: a hip-length straight tunic with a round neckline, three-quarter sleeves and side slits",
        "anarkali": "an anarkali: a long frock-style kurta, fitted at the bodice and flaring from a high waist into a full, many-panelled skirt, with full sleeves",
        "salwar suit": "a salwar suit: a knee-length kurta with side slits shown beside loose salwar trousers gathered at the ankles",
        "lehenga": "a lehenga set: a short fitted choli blouse shown above a full, flared, floor-length skirt",
        "saree blouse": "a saree blouse (choli): a short, closely fitted cropped blouse with short sleeves and a scooped neckline",
        "sherwani": "a men's sherwani: a long knee-length coat with a mandarin collar, a row of buttons down the front and full sleeves",
        "nehru jacket": "a sleeveless Nehru jacket: hip length, with a mandarin collar and a buttoned front",
        "dress": "a simple knee-length dress with short sleeves and a fitted waist",
        "gown": "a floor-length evening gown with a fitted bodice and a full, sweeping skirt",
        "top": "a simple women's blouse-style top with short sleeves",
        "shirt": "a classic button-down shirt with a collar and full sleeves with cuffs",
        "skirt": "a knee-length A-line skirt with a waistband",
        "trousers": "a pair of tailored straight-leg trousers with a waistband and a front crease",
        "palazzo": "palazzo pants: very wide, flowing, full-length trousers with an elastic waistband",
        "churidar": "churidar pants: slim fitted trousers cut extra long so they bunch into gathers at the ankles",
        "sharara": "sharara pants: trousers fitted to the knee, then flaring into wide ruffled pleats down to the floor",
        "jumpsuit": "a sleeveless one-piece jumpsuit with wide legs and a belted waist",
        "co-ord set": "a matching co-ord set: a boxy short-sleeved shirt shown beside matching straight trousers",
        "jacket": "a casual zip-up jacket with a collar and full sleeves",
        "sweatshirt": "a crew-neck sweatshirt with ribbed cuffs and a ribbed hem",
        "hoodie": "a pullover hoodie with a hood, a front kangaroo pocket and ribbed cuffs",
        "sweater": "a knitted pullover sweater with a ribbed neckline, cuffs and hem",
        "cardigan": "a button-front knitted cardigan with a V-neck",
        "t-shirt": "a plain crew-neck t-shirt with short sleeves",
        "polo": "a polo shirt with a collar, a short button placket and short sleeves",
        "tank top": "a sleeveless tank top with a scoop neck",
        "crop top": "a short crop top that ends above the waist, with short sleeves",
        "corset": "a structured corset top with vertical boning seams and a straight neckline",
        "bodysuit": "a fitted long-sleeved bodysuit, shown flat",
        "blazer": "a single-breasted blazer with notch lapels, two buttons and flap pockets",
        "coat": "a knee-length tailored overcoat with lapels and a double-breasted button front",
        "puffer jacket": "a quilted puffer jacket with horizontal padded baffles, a high collar and a front zip",
        "shrug": "a cropped open-front shrug with long sleeves",
        "kaftan": "a kaftan: a loose, flowing, ankle-length robe with very wide sleeves and a V-neck",
        "cape": "a cape: a sleeveless outer garment that drapes over the shoulders and falls to the hip",
        "jeans": "a pair of five-pocket jeans with straight legs and visible topstitching",
        "joggers": "jogger pants with an elastic drawstring waist and cuffed ankles",
        "cargo pants": "cargo pants with large flap pockets on the sides of the thighs",
        "shorts": "a pair of casual shorts that end at mid-thigh",
        "leggings": "a pair of plain fitted leggings",
        "pyjama set": "a pyjama set: a button-front sleep shirt with piped edges shown beside matching pyjama trousers",
        "tracksuit": "a tracksuit: a zip-up track jacket shown beside matching track pants",
        "dungarees": "dungarees: overalls with a bib front, shoulder straps and straight legs",
        "dupatta": "a dupatta: a long rectangular scarf with a decorative border and tasselled ends, gently folded",
        "kurta set": "a kurta set: a straight knee-length kurta shown beside matching straight pants",
        "dhoti pants": "dhoti pants: low-crotch draped trousers with soft folds, gathered and fitted at the ankles",
    }},
    {"slot": "garment", "kind": "figure", "tpl": "A figure wearing {d}.", "items": {
        "saree": "a saree draped in the Nivi style, with pleats at the front and the pallu over the left shoulder",
    }},
    {"slot": "neckline.shape", "base": "top", "kind": "line",
     "tpl": "A plain hip-length women's woven top with short sleeves and {d}.", "edit": "Change the neckline to {d}.", "items": {
        "v": "a V-neckline of moderate depth",
        "deep v": "a deep, plunging V-neckline that reaches the middle of the chest",
        "round": "a simple round jewel neckline",
        "boat": "a boat neckline (bateau): a wide, high, almost straight horizontal opening running from one shoulder to the other, not scooped",
        "square": "a square neckline with straight sides and a straight horizontal front edge",
        "sweetheart": "a sweetheart neckline shaped like the top of a heart, two curves dipping to a point at the centre",
        "halter": "a sleeveless halter neckline: the armholes are cut in deeply towards the neck so the shoulders and arms are bare, and the front is held by a band around the neck",
        "high": "a high neckline that sits close around the base of the neck",
        "mandarin": "a mandarin collar: a short stand-up band collar with no fold, open at the centre front",
        "keyhole": "a round neckline with a small teardrop-shaped keyhole opening at the centre front",
        "off-shoulder": "an off-the-shoulder neckline running straight across the upper arms, leaving the shoulders bare",
        "u": "a deep U-shaped scoop neckline with a rounded bottom, like the letter U, not pointed",
        "collar": "a classic shirt collar with a short button placket",
        "cowl": "a cowl neckline with soft folds of draped fabric hanging at the front",
        "potli": "a round neckline with a short front slit closed by a row of small round potli ball buttons",
    }},
    {"slot": "neckline.shape", "base": "knit", "kind": "line",
     "tpl": "A plain sweatshirt with full sleeves, ribbed cuffs and {d}.", "edit": "Change the neckline to {d}.", "items": {
        "crew": "a crew neck: a close round neckline finished with a ribbed band",
        "hooded": "an attached hood at the neckline, with drawstrings",
        "turtle": "a turtleneck: a tall, close-fitting folded collar that covers the neck",
    }},
    {"slot": "neckline.depth", "base": "top", "kind": "line",
     "tpl": "A plain hip-length women's woven top with short sleeves and {d}.", "edit": "Change the neckline to {d}.", "items": {
        "shallow": "a very small, shallow V-neckline whose point sits just below the base of the neck, high on the chest",
        "moderate": "a V-neckline of moderate depth, ending a little above the bust",
        "deep": "a deep V-neckline that ends at the bust line",
        "plunging": "an extremely deep plunging V-neckline whose point reaches all the way down to the waist",
    }},
    {"slot": "sleeve.style", "base": "top", "kind": "line",
     "tpl": "A plain hip-length women's woven top with a round neckline and {d}.", "edit": "Change the sleeves to {d}.", "items": {
        "puff": "short puffed sleeves, gathered at the shoulder and at a band above the elbow",
        "bell": "full-length sleeves that widen into a bell shape towards the wrist",
        "bishop": "full sleeves that are fuller at the lower arm and gathered into a cuff at the wrist",
        "flutter": "short, loose, ruffled flutter sleeves",
        "cold shoulder": "sleeves with cut-outs that leave the top of each shoulder bare",
        "kimono": "wide, loose kimono sleeves cut in one piece with the body",
        "raglan": "raglan sleeves, with diagonal seams running from the underarm to the neckline",
        "straight": "straight, slim, full-length sleeves",
        "sheer": "sheer full-length sleeves, drawn with light dotted outlines to show they are see-through",
    }},
    {"slot": "sleeve.length", "base": "top", "kind": "line",
     "tpl": "A plain hip-length women's woven top with a round neckline and {d}.", "edit": "Change the sleeves to {d}.", "items": {
        "sleeveless": ("no sleeves at all, just clean armholes", "Remove the sleeves completely, leaving clean armholes."),
        "cap": "tiny cap sleeves that just cover the top of the shoulder",
        "short": "short sleeves that end at the middle of the upper arm",
        "elbow": "sleeves that end exactly at the elbow",
        "three-quarter": "three-quarter sleeves that end halfway between the elbow and the wrist",
        "full": "full-length sleeves that reach the wrist",
    }},
    {"slot": "bodice.fit", "base": "kurta", "kind": "line",
     "tpl": "A plain knee-length kurta with a round neckline and three-quarter sleeves, cut with {d}.", "edit": "Change the cut of the body to {d}.", "items": {
        "fitted": "a closely fitted body with a clearly defined waist, cut close to the figure",
        "semi-fitted": "a gently shaped, semi-fitted body with a little ease at the waist",
        "relaxed": "a relaxed straight body with generous ease, not shaped at the waist",
        "loose": "a loose, oversized boxy body with dropped shoulders",
    }},
    {"slot": "bodice.fit", "context": "knit", "base": "knit", "kind": "line",
     "tpl": "A plain crew-neck sweatshirt with full sleeves in {d}.", "edit": "Change the fit to {d}.", "items": {
        "fitted": "a slim fit that follows the body closely",
        "semi-fitted": "a regular fit with a little ease, neither slim nor loose",
        "relaxed": "a relaxed fit with a roomy body and sleeves",
        "loose": "an oversized fit with dropped shoulders and a wide boxy body",
    }},
    {"slot": "lower.silhouette", "base": "kurta", "kind": "line",
     "tpl": "A plain knee-length kurta with a round neckline and three-quarter sleeves, in {d}.", "edit": "Change the shape of the kurta to {d}.", "items": {
        "a-line": "an A-line shape that widens gradually from the bust down to the hem",
        "straight": "a straight cut with straight sides from the bust to the hem",
        "flared": "a flared shape that spreads widely from the waist into a full hem",
        "anarkali": "an anarkali kalidar shape: many vertical panels flaring from a high waist into a full circular hem",
        "angrakha": "an angrakha: an overlapping wrap bodice tied at the side, flaring below the waist",
    }},
    {"slot": "lower.silhouette", "kind": "line", "items": {
        "bodycon": "a bodycon dress that hugs the body closely from the bust to the hem",
        "fit and flare": "a fit-and-flare dress, fitted through the bodice and waist, then flaring into a full skirt",
        "mermaid": "a mermaid gown, fitted through the hips and thighs, flaring out dramatically from the knee",
        "empire": "an empire-waist dress with a seam just under the bust and a skirt that flows from there",
        "peplum": "a peplum top, fitted at the waist with a short flared ruffle below the waist",
    }},
    {"slot": "lower.silhouette", "context": "bottom", "base": "trousers", "kind": "line",
     "tpl": "A pair of plain trousers with a waistband and {d}, shown flat from the front.", "edit": "Change the legs to {d}.", "items": {
        "straight": "straight legs with the same width from the knee to the hem",
        "wide-leg": "wide legs that are wide from the hip all the way to the hem",
        "jogger": "jogger legs: relaxed through the leg and gathered into ribbed cuffs at the ankle",
        "tapered": "tapered legs: roomy at the hip, narrowing steadily to a slim ankle",
        "cropped": "cropped straight legs cut short so the hems end at mid-calf, clearly shorter than full length, leaving the lower leg bare",
    }},
    {"slot": "garment.length", "base": "figure", "kind": "figure",
     "tpl": "A figure wearing {d}.", "edit": "Change the garment to {d}.", "items": {
        "crop": "a crop top that ends above the waist, so the midriff shows",
        "hip": "a kurta that ends at the hip",
        "short": "a short dress that ends at mid-thigh",
        "knee": "a kurta that ends exactly at the knee",
        "midi": "a kurta that ends at mid-calf, below the knee",
        "ankle": "a kurta that ends at the ankle",
        "floor": "a floor-length kurta whose hem touches the floor",
    }},
    {"slot": "garment.length", "context": "bottom", "base": "figure_bottom", "kind": "figure",
     "tpl": "A figure wearing a plain fitted t-shirt and {d}.", "edit": "Change the trousers to {d}.", "items": {
        "short": "shorts that end at mid-thigh",
        "knee": "shorts that end at the knee",
        "midi": "trousers that end at mid-calf",
        "ankle": "trousers that end exactly at the ankle bone",
        "floor": "full-length trousers whose hems touch the floor",
    }},
    {"slot": "fabric", "kind": "fabric", "items": {
        "cotton": "plain-weave ivory cotton with a soft matte surface",
        "mulmul": "very fine, soft, slightly sheer ivory mulmul cotton muslin",
        "linen": "ivory linen with a visible slubby, slightly uneven weave and natural creases",
        "silk": "ivory pure silk with a soft lustrous sheen and fluid folds",
        "banarasi": "maroon Banarasi silk brocade woven with intricate gold zari floral motifs",
        "chanderi": "sheer ivory chanderi silk-cotton with small woven gold dots",
        "georgette": "ivory georgette: sheer, lightweight and finely crinkled, with a grainy texture and floaty drape",
        "chiffon": "very sheer, lightweight ivory chiffon in soft floating folds",
        "organza": "crisp, sheer ivory organza with a stiff, slightly shiny surface",
        "crepe": "ivory crepe with a fine, crinkled, pebbly matte texture",
        "rayon": "smooth, soft ivory rayon with a fluid drape",
        "satin": "ivory satin with a glossy, highly reflective smooth surface",
        "velvet": "ivory velvet with a dense, soft pile catching the light",
        "net": "ivory net tulle, an open mesh, laid over a dark charcoal surface so the holes show",
        "denim": "indigo blue denim with a visible diagonal twill weave",
        "khadi": "handspun ivory khadi cotton with an irregular, textured handwoven surface",
        "wool": "cream woven wool suiting with a soft brushed surface",
        "lycra": "smooth, stretchy cream lycra jersey, gently stretched",
        "fleece": "soft cream fleece with a fuzzy brushed pile",
        "terry": "cream French terry, turned to show its looped back",
        "cashmere": "a fine cream cashmere knit with a soft fuzzy halo",
        "corduroy": "camel corduroy with distinct raised vertical ribs",
        "flannel": "soft brushed cream flannel",
        "tweed": "grey-brown herringbone tweed with a coarse woven texture",
        "leather": "smooth tan leather with a fine natural grain",
        "faux fur": "long-pile cream faux fur",
        "polyester": "smooth ivory polyester with a slight sheen",
    }},
    {"slot": "pattern", "kind": "print", "items": {
        "solid": "no print at all, a plain solid indigo",
        "floral": "a floral print of small flowers and leaves",
        "printed": "an all-over small decorative print",
        "striped": "even vertical stripes",
        "checked": "a gingham check",
        "polka": "polka dots",
        "paisley": "a paisley print",
        "bandhani": "bandhani tie-dye: tiny resist-dyed dots arranged in patterns",
        "leheriya": "leheriya tie-dye: wavy diagonal stripes",
        "block print": "a hand block print of repeating motifs, slightly irregular like hand stamping",
        "ikat": "an ikat weave of diamond motifs with blurred, feathered edges",
        "geometric": "a geometric print of triangles and squares",
        "ombre": "an ombre dye that fades smoothly from deep indigo at one edge to ivory at the other",
    }},
    {"slot": "embellishment", "kind": "finish", "items": {
        "embroidery": "floral thread embroidery in tonal ivory and gold thread",
        "zari": "zari work: fine metallic gold thread embroidery in a floral motif",
        "gota patti": "gota patti work: shiny gold ribbon appliqued in leaf and flower shapes",
        "mirror work": "mirror work: small round mirrors stitched on with colourful thread surrounds",
        "chikankari": "chikankari: delicate white-on-white shadow-work hand embroidery on fine muslin",
        "sequins": "densely sewn small shimmering sequins",
        "pearl work": "small white pearls hand-sewn in a floral pattern",
        "zardozi": "zardozi: raised, heavy gold metal-thread embroidery with beads and coiled wire",
        "thread work": "colourful resham thread embroidery of small flowers",
        "lace": "a delicate ivory lace trim with scalloped edges",
        "tassels": "decorative beaded tassels hanging from the edge of a fabric border",
        "beadwork": "dense glass beadwork in a geometric pattern",
    }},
]

STYLE = {"line": LINE, "figure": FIGURE}
WRAP = {"fabric": FABRIC, "print": PRINT, "finish": FINISH}


def entries() -> list[dict]:
    """Every picture to make, with its text prompt and, for edits, its edit instruction."""
    out = []
    for g in GROUPS:
        ctx = g.get("context")
        for value, item in g["items"].items():
            desc, edit = item if isinstance(item, tuple) else (item, None)
            k = g["kind"]
            if k in WRAP:
                prompt = WRAP[k].format(s=desc)
            else:
                subject = g["tpl"].format(d=desc) if "tpl" in g else desc[0].upper() + desc[1:] + "."
                prompt = f"{subject} {STYLE[k]}"
            e = {"key": f"{g['slot']}/{value}" + (f"@{ctx}" if ctx else ""), "slot": g["slot"], "value": value,
                 "context": ctx, "kind": k, "desc": desc, "group": g["slot"] + (f"@{ctx}" if ctx else ""),
                 "base": g.get("base"), "prompt": prompt}
            if g.get("base"):
                e["edit"] = (edit or g["edit"].format(d=desc)) + KEEP
            out.append(e)
    return out


def slug(key: str) -> str:
    """'neckline.shape/deep v@knit' -> 'neckline-shape/deep-v--knit'"""
    slot, rest = key.split("/", 1)
    value, _, ctx = rest.partition("@")
    name = value.replace(" ", "-") + (f"--{ctx}" if ctx else "")
    return f"{slot.replace('.', '-')}/{name}"
