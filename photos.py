"""photos.py - downloads a real photo for every dish from Wikimedia Commons (free, no API key).

Runs automatically in the background when app.py starts (only for dishes that have no photo yet),
or run it yourself:   python photos.py
Photos are saved to static/img/food/<dish-slug>.jpg  and credits go to static/img/food/CREDITS.txt.
Want a different picture for a dish?  Just drop your own JPG in that folder using the same file name,
or paste an image link in Admin > Menu (Photo URL).
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
FOOD_DIR = os.path.join(HERE, "static", "img", "food")
API = "https://commons.wikimedia.org/w/api.php"
UA = "PadaliOrderingDemo/1.0 (student project; local use)"

def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def is_jpeg(data):
    return data[:3] == b"\xff\xd8\xff" and len(data) > 2000 and b"\xff\xd9" in data[-64:]

def path_for(name):
    return os.path.join(FOOD_DIR, slug(name) + ".jpg")

# search words that find a better picture than the dish name alone
QUERY = {
    "Chicken Adobo Rice": "chicken adobo", "Sinigang na Baboy": "sinigang na baboy", "Pork Sisig": "pork sisig",
    "Beef Tapa Silog": "tapsilog", "Pancit Canton": "pancit canton", "Kare-Kare": "kare-kare",
    "Chicken Inasal": "chicken inasal", "Liempo Rice": "inihaw na liempo", "Grilled Isaw": "isaw grilled",
    "Inihaw na Pusit": "grilled squid", "Pork BBQ Rice": "filipino pork barbecue",
    "Lumpiang Shanghai": "lumpiang shanghai", "Turon": "turon filipino", "Banana Cue": "banana cue",
    "Pork Siomai": "siomai", "Halo-halo": "halo-halo", "Leche Flan": "leche flan", "Bibingka": "bibingka",
    "Iced Coffee": "iced coffee", "Calamansi Juice": "calamansi juice", "Mango Shake": "mango shake",
    "Caramel Latte": "caramel latte", "Club Sandwich": "club sandwich", "Choco Chip Cookie": "chocolate chip cookie",
    "Classic Cheeseburger": "cheeseburger", "Double Bacon Burger": "bacon cheeseburger", "Crispy Fried Chicken": "fried chicken",
    "French Fries": "french fries", "Chicken Sandwich": "fried chicken sandwich", "Onion Rings": "onion rings",
    "Pepperoni Pizza": "pepperoni pizza", "Hawaiian Pizza": "hawaiian pizza", "Spaghetti": "filipino spaghetti",
    "Carbonara": "spaghetti carbonara", "Garlic Bread": "garlic bread", "Lasagna": "lasagna",
    "Beef Broccoli": "beef and broccoli", "Yang Chow Fried Rice": "yangzhou fried rice", "Sweet and Sour Pork": "sweet and sour pork",
    "Chopsuey": "chop suey", "Beef Mami": "beef noodle soup",
    "Classic Milk Tea": "milk tea", "Wintermelon Milk Tea": "winter melon tea", "Taro Milk Tea": "taro milk tea",
    "Brown Sugar Boba": "bubble tea", "Matcha Latte": "matcha latte", "Mango Graham Float": "mango float",
}

def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for wait in (0, 3, 8):                       # Wikimedia sometimes answers 429 (too many requests): wait and retry
        time.sleep(wait)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503): raise
    raise OSError("Wikimedia is busy, try again later")

def pick(data):
    """choose the best JPEG from a Commons API reply: bigger than 500px wide, search rank order."""
    pages = sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    for p in pages:
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("mime") == "image/jpeg" and info.get("width", 0) >= 500 and info.get("thumburl"):
            return info["thumburl"], p.get("title", ""), info.get("descriptionurl", "")
    return None

def find(query):
    q = {"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrlimit": 10,
         "gsrsearch": query + " filetype:bitmap", "prop": "imageinfo", "iiprop": "url|size|mime", "iiurlwidth": 960}
    return pick(json.loads(_get(API + "?" + urllib.parse.urlencode(q))))

def download_missing(names, log=print):
    os.makedirs(FOOD_DIR, exist_ok=True)
    got = fails = 0
    for n in names:
        dest = path_for(n)
        if os.path.exists(dest):
            if is_jpeg(open(dest, "rb").read()): continue
            os.remove(dest)                                    # corrupted earlier download: fetch again
        try:
            hit = find(QUERY.get(n, n))
            if not hit:
                log(f"[photos] no picture found for {n}"); continue
            url, title, page = hit
            data = _get(url)
            if not is_jpeg(data):
                log(f"[photos] {n} skipped: Wikimedia did not send a real picture"); fails += 1; time.sleep(2); continue
            open(dest, "wb").write(data)
            with open(os.path.join(FOOD_DIR, "CREDITS.txt"), "a", encoding="utf-8") as c:
                c.write(f"{n}: {title} - {page}\n")
            got += 1; fails = 0; log(f"[photos] {n} ok"); time.sleep(0.4)
        except Exception as e:
            fails += 1
            why = getattr(e, "reason", e)                      # the real reason (timeout, DNS, SSL certificate, HTTP code...)
            log(f"[photos] {n} skipped: {e.__class__.__name__}: {why}")
            if "CERTIFICATE" in str(why).upper():
                log("[photos] Python can't verify the SSL certificate. Windows: run  pip install certifi  then try again. Mac: run 'Install Certificates.command' in your Python folder.")
                return got
            if fails >= 4:
                log("[photos] 4 failures in a row, stopping. Check your internet / VPN / firewall, then run again."); return got
    return got

if __name__ == "__main__":
    sys.path.insert(0, HERE)
    os.environ["PADALI_NO_PHOTOS"] = "1"     # we download here, no need for app.py to do it too
    import app
    names = sorted({s[1] for s in app.SEED})
    print(f"{download_missing(names)} new photos downloaded to static/img/food/")
