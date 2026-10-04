"""Broaden the ontology to everyday Western, winter and Indian wear, add seasons, and make questions garment-aware.

Run once; the JSON stays the single source of truth for the Python engine and the web app.
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parents[2] / "ontology" / "bespoke.json"
o = json.loads(P.read_text(encoding="utf8"))
L = o["lexicon"]


def add(tag, value, forms, hi=None):
    e = L[tag].setdefault(value, {"forms": [], "hi": hi or value})
    for f in forms:
        if f not in e["forms"]:
            e["forms"].append(f)
    if hi:
        e["hi"] = hi


def remove_form(tag, value, form):
    if value in L[tag] and form in L[tag][value]["forms"]:
        L[tag][value]["forms"].remove(form)


# ---- garments: everyday Western, winter, sets ----
remove_form("GARMENT", "top", "tee"); remove_form("GARMENT", "top", "t-shirt"); remove_form("GARMENT", "top", "tshirt")
remove_form("GARMENT", "trousers", "pyjama"); remove_form("GARMENT", "trousers", "pajama")
remove_form("GARMENT", "churidar", "leggings")
remove_form("GARMENT", "jacket", "blazer")
add("GARMENT", "sweatshirt", ["sweatshirt", "sweatshirts", "sweat shirt", "crewneck sweatshirt"], "स्वेटशर्ट")
add("GARMENT", "hoodie", ["hoodie", "hoodies", "hoody", "hooded sweatshirt", "zip hoodie"], "हुडी")
add("GARMENT", "sweater", ["sweater", "sweaters", "jumper", "pullover", "knit sweater", "swetar", "sweter"], "स्वेटर")
add("GARMENT", "cardigan", ["cardigan", "cardigans"], "कार्डिगन")
add("GARMENT", "t-shirt", ["t-shirt", "t-shirts", "tshirt", "tshirts", "tee", "tees", "t shirt"], "टी-शर्ट")
add("GARMENT", "polo", ["polo", "polo shirt", "polo tshirt"], "पोलो")
add("GARMENT", "tank top", ["tank top", "tank", "camisole", "cami", "vest top"], "टैंक टॉप")
add("GARMENT", "crop top", ["crop top", "crop tops"], "क्रॉप टॉप")
add("GARMENT", "corset", ["corset", "bustier"], "कॉर्सेट")
add("GARMENT", "bodysuit", ["bodysuit"], "बॉडीसूट")
add("GARMENT", "blazer", ["blazer", "blazers", "suit jacket"], "ब्लेज़र")
add("GARMENT", "coat", ["coat", "overcoat", "trench coat", "trench", "long coat", "peacoat", "pea coat"], "कोट")
add("GARMENT", "puffer jacket", ["puffer", "puffer jacket", "quilted jacket", "down jacket", "padded jacket"], "पफर जैकेट")
add("GARMENT", "jacket", ["bomber", "bomber jacket", "denim jacket", "leather jacket", "windcheater", "biker jacket"])
add("GARMENT", "shrug", ["shrug", "kimono jacket"], "श्रग")
add("GARMENT", "kaftan", ["kaftan", "caftan"], "कफ़्तान")
add("GARMENT", "cape", ["cape", "poncho"], "केप")
add("GARMENT", "jeans", ["jeans", "denims", "jean"], "जींस")
add("GARMENT", "joggers", ["joggers", "jogger", "track pants", "trackpants", "sweatpants", "sweat pants", "lowers", "lower"], "जॉगर्स")
add("GARMENT", "cargo pants", ["cargo", "cargos", "cargo pants"], "कार्गो पैंट")
add("GARMENT", "trousers", ["pants", "trousers", "formal pants", "slacks", "chinos", "pant"])
add("GARMENT", "shorts", ["shorts", "bermuda", "bermudas"], "शॉर्ट्स")
add("GARMENT", "leggings", ["leggings", "jeggings"], "लेगिंग्स")
add("GARMENT", "pyjama set", ["pyjama", "pajama", "pyjamas", "pajamas", "nightsuit", "night suit", "loungewear", "lounge set"], "पजामा सेट")
add("GARMENT", "tracksuit", ["tracksuit", "track suit", "sweatsuit"], "ट्रैकसूट")
add("GARMENT", "co-ord set", ["cord set", "co ord set", "co ord", "co-ords", "coords", "cord-set", "twinset", "matching top and bottom"])
add("GARMENT", "dungarees", ["dungarees", "dungaree", "overalls"], "डंगरी")
add("GARMENT", "saree", ["saree", "sari", "sarees", "saari", "साड़ी"], "साड़ी")
add("GARMENT", "dupatta", ["dupatta", "stole", "chunni", "odhni"], "दुपट्टा")
add("GARMENT", "kurta set", ["kurta set", "kurti set", "kurta pajama", "kurta pyjama", "kurta palazzo set"], "कुर्ता सेट")
add("GARMENT", "dhoti pants", ["dhoti pants", "dhoti", "dhoti salwar"], "धोती पैंट")
add("GARMENT", "skirt", ["maxi skirt", "midi skirt", "mini skirt", "pencil skirt", "pleated skirt"])
add("GARMENT", "dress", ["shirt dress", "slip dress", "wrap dress", "sweater dress", "bodycon dress"])

# ---- fabrics for every season ----
add("FABRIC", "fleece", ["fleece", "polar fleece", "sherpa", "brushed fleece"], "फ़्लीस")
add("FABRIC", "terry", ["terry", "french terry", "loopback", "cotton fleece", "sweatshirt fabric"], "टेरी")
add("FABRIC", "wool", ["woolen", "merino", "knitted", "knit", "acrylic wool", "angora"])
add("FABRIC", "cashmere", ["cashmere"], "कश्मीरी")
add("FABRIC", "corduroy", ["corduroy", "cord fabric", "cords", "cordroy"], "कॉरडरॉय")
add("FABRIC", "flannel", ["flannel", "brushed cotton"], "फ़लालैन")
add("FABRIC", "tweed", ["tweed", "boucle"], "ट्वीड")
add("FABRIC", "leather", ["leather", "faux leather", "vegan leather", "pu leather", "suede"], "चमड़ा")
add("FABRIC", "faux fur", ["faux fur", "fur", "teddy"], "फ़र")
add("FABRIC", "polyester", ["polyester", "poly", "nylon", "spandex blend"], "पॉलिएस्टर")
add("FABRIC", "lycra", ["spandex", "elastane", "stretch"])

# ---- seasons and weather live under OCCASION, so the tag set (and the trained model's labels) do not change ----
add("OCCASION", "winter", ["winter", "winters", "cold", "the cold", "chilly", "freezing", "snow", "hills", "mountains", "manali", "shimla", "kashmir", "ladakh",
                           "december", "january", "warm", "keep me warm", "cozy", "cosy", "sardi", "sardiyon", "thand", "thandi"], "सर्दी")
add("OCCASION", "summer", ["summer", "summers", "hot weather", "heat", "humid", "beach", "goa", "vacation", "garmi", "garmiyon"], "गर्मी")
add("OCCASION", "monsoon", ["monsoon", "rain", "rainy", "barish", "baarish"], "बारिश")
add("OCCASION", "travel", ["travel", "trip", "airport", "flight", "road trip"], "यात्रा")
add("OCCASION", "gym", ["gym", "workout", "yoga", "running", "sports", "athleisure"], "जिम")
add("OCCASION", "lounge", ["home", "lounging", "sleep", "night", "wfh", "work from home"], "घर")

# ---- styles people actually ask for ----
add("STYLE", "streetwear", ["streetwear", "street style", "hip hop", "skater", "baggy look"], "स्ट्रीटवियर")
add("STYLE", "sporty", ["sporty", "athletic", "athleisure look"], "स्पोर्टी")
add("STYLE", "korean", ["korean", "k-style", "kdrama", "k-drama"], "कोरियन")
add("STYLE", "old money", ["old money", "quiet luxury", "preppy"], "ओल्ड मनी")
add("STYLE", "minimal", ["basic", "plain look", "clean look", "understated look"])
add("STYLE", "edgy", ["edgy", "grunge", "goth", "gothic", "punk"], "एजी")

# ---- fits and silhouettes for knitwear and bottoms ----
add("FIT", "loose", ["oversize", "boxy", "relaxed fit", "slouchy"])
add("FIT", "fitted", ["slim fit", "skinny", "snug fit"])
add("SILHOUETTE", "wide-leg", ["wide leg", "wide-leg", "wide legged", "palazzo style", "flared pants", "bell bottom", "bell bottoms", "baggy pants"], "चौड़ी मोहरी")
add("SILHOUETTE", "jogger", ["jogger style", "cuffed", "elastic ankle", "ribbed cuffs"], "जॉगर")
add("SILHOUETTE", "tapered", ["tapered", "slim leg", "narrow leg"], "पतली मोहरी")
add("SILHOUETTE", "cropped", ["cropped pants", "ankle length pants"], "क्रॉप्ड")
add("NECKLINE", "crew", ["crew neck", "crewneck", "crew"], "क्रू नेक")
add("NECKLINE", "hooded", ["hooded", "with hood", "hood"], "हुड")
add("NECKLINE", "turtle", ["turtle neck", "turtleneck", "polo neck", "mock neck"], "टर्टल नेक")
remove_form("NECKLINE", "round", "crew neck"); remove_form("NECKLINE", "round", "crew")
remove_form("NECKLINE", "high", "turtle neck"); remove_form("NECKLINE", "high", "turtleneck"); remove_form("NECKLINE", "high", "mock neck")
add("PATTERN", "printed", ["graphic", "graphic print", "logo", "text print"])
add("PATTERN", "solid", ["no print", "no prints"])
add("COLOUR", "navy", ["dark navy", "deep blue", "ink blue"])
add("COLOUR", "olive", ["olive green", "army green", "military green"])
add("COLOUR", "grey", ["heather grey", "melange", "ash", "dark grey", "light grey"])
add("COLOUR", "brown", ["chocolate brown", "mocha", "espresso"])
add("COLOUR", "ivory", ["cream white", "vanilla"])

# ---- resolve forms claimed twice ----
remove_form("GARMENT", "top", "crop top"); remove_form("GARMENT", "jacket", "shrug"); remove_form("GARMENT", "joggers", "lower")
remove_form("FABRIC", "lycra", "knit"); remove_form("STYLE", "minimal", "subtle"); remove_form("STYLE", "streetwear", "skater")

# ---- garment families decide which questions make sense ----
o["garment_family"] = {
    "top_long": ["kurti", "anarkali", "salwar suit", "sherwani", "dress", "gown", "kurta set", "kaftan"],
    "top_short": ["saree blouse", "top", "shirt", "crop top", "tank top", "corset", "bodysuit", "polo"],
    "knit_top": ["sweatshirt", "hoodie", "sweater", "cardigan", "t-shirt"],
    "outer": ["jacket", "blazer", "coat", "puffer jacket", "nehru jacket", "shrug", "cape"],
    "bottom": ["skirt", "trousers", "palazzo", "churidar", "sharara", "lehenga", "jeans", "joggers", "cargo pants", "shorts", "leggings", "dhoti pants"],
    "set": ["co-ord set", "jumpsuit", "tracksuit", "pyjama set", "dungarees"],
    "drape": ["saree", "dupatta"],
}
o["family_questions"] = {
    "top_long": ["neckline.shape", "neckline.depth", "sleeve.length", "garment.length", "bodice.fit", "fabric", "colour"],
    "top_short": ["neckline.shape", "sleeve.length", "bodice.fit", "fabric", "colour"],
    "knit_top": ["bodice.fit", "fabric", "colour", "neckline.shape"],
    "outer": ["garment.length", "bodice.fit", "fabric", "colour"],
    "bottom": ["lower.silhouette", "garment.length", "fabric", "colour"],
    "set": ["bodice.fit", "lower.silhouette", "fabric", "colour"],
    "drape": ["fabric", "colour", "embellishment"],
}
o["fabric_by_season"] = {
    "winter": ["fleece", "wool", "terry", "corduroy", "velvet", "flannel"],
    "summer": ["cotton", "linen", "mulmul", "rayon", "chiffon"],
    "monsoon": ["polyester", "rayon", "crepe", "denim"],
    "gym": ["lycra", "polyester", "cotton"],
    "lounge": ["cotton", "terry", "rayon", "flannel"],
}


def dump(o):
    lines = ["{"]
    keys = list(o)
    for i, k in enumerate(keys):
        comma = "," if i < len(keys) - 1 else ""
        v = o[k]
        if k == "lexicon":
            lines.append('  "lexicon": {')
            tags = list(v)
            for j, t in enumerate(tags):
                lines.append(f'    "{t}": {{')
                vals = list(v[t])
                for m, val in enumerate(vals):
                    c = "," if m < len(vals) - 1 else ""
                    lines.append(f'      {json.dumps(val, ensure_ascii=False)}: {json.dumps(v[t][val], ensure_ascii=False)}{c}')
                lines.append("    }" + ("," if j < len(tags) - 1 else ""))
            lines.append("  }" + comma)
        elif isinstance(v, dict):
            lines.append(f'  "{k}": {{')
            ks = list(v)
            for m, kk in enumerate(ks):
                c = "," if m < len(ks) - 1 else ""
                lines.append(f'    {json.dumps(kk, ensure_ascii=False)}: {json.dumps(v[kk], ensure_ascii=False)}{c}')
            lines.append("  }" + comma)
        else:
            lines.append(f'  "{k}": {json.dumps(v, ensure_ascii=False)}{comma}')
    lines.append("}")
    return "\n".join(lines) + "\n"


o["version"] = "1.1.0"
P.write_text(dump(o), encoding="utf8")
n = sum(len(e["forms"]) for t in L.values() for e in t.values())
print("forms:", n, "garments:", len(L["GARMENT"]), "fabrics:", len(L["FABRIC"]), "occasions:", len(L["OCCASION"]))
