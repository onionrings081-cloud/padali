import base64, csv, io, json, math, os, random, re, sqlite3, threading, time
import urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta
from functools import wraps
from flask import Flask, Response, g, jsonify, request, session, render_template, redirect
from werkzeug.security import generate_password_hash, check_password_hash
import photos

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-in-production")
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024        # profile photos arrive as small JPEGs (the browser shrinks them first)
HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get("PADALI_DB", os.path.join(HERE, "oms.db"))
AVATAR_DIR = os.path.join(HERE, "static", "uploads", "avatars")   # profile pictures chosen from the phone / computer gallery
ON_VERCEL = bool(os.environ.get("VERCEL"))
if ON_VERCEL:        # Vercel's disk is read-only except /tmp: copy the bundled database there on cold start (data in /tmp is NOT permanent)
    import shutil
    DB = "/tmp/oms.db"
    AVATAR_DIR = "/tmp/avatars"
    if not os.path.exists(DB):
        shutil.copyfile(os.path.join(HERE, "oms.db"), DB)
AREA = "Cantilan, Surigao del Sur"          # the area your stores are in
AREA_CENTER = (9.3356, 125.9769)             # town center of Cantilan (Wikipedia). Used for the map and the delivery area check.
DELIVERY_RADIUS_KM = 15                      # orders with a map pin farther than this from the center are refused

def km_between(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0]); dp = p2 - p1; dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
  address TEXT NOT NULL, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user');
CREATE TABLE IF NOT EXISTS stores(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, cuisine TEXT, description TEXT, address TEXT, eta TEXT, is_open INTEGER NOT NULL DEFAULT 1, lat REAL, lng REAL);
CREATE TABLE IF NOT EXISTS reviews(
  id INTEGER PRIMARY KEY, store_id INTEGER NOT NULL, user_id INTEGER, name TEXT NOT NULL, order_id INTEGER,
  rating INTEGER NOT NULL, comment TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS food_reviews(
  id INTEGER PRIMARY KEY, item_name TEXT NOT NULL, store_id INTEGER, user_id INTEGER, name TEXT NOT NULL, order_id INTEGER,
  rating INTEGER NOT NULL, comment TEXT, reply TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS delivery_reviews(
  id INTEGER PRIMARY KEY, order_id INTEGER, store_id INTEGER, user_id INTEGER, name TEXT NOT NULL,
  rating INTEGER NOT NULL, speed TEXT, comment TEXT, reply TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS menu_items(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, price REAL NOT NULL,
  category TEXT NOT NULL, emoji TEXT, available INTEGER NOT NULL DEFAULT 1, store_id INTEGER, image TEXT);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), total REAL NOT NULL,
  method TEXT NOT NULL, notify INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  name TEXT NOT NULL, price REAL NOT NULL, qty INTEGER NOT NULL, store TEXT, custom INTEGER NOT NULL DEFAULT 0, note TEXT);
CREATE TABLE IF NOT EXISTS favorites(user_id INTEGER NOT NULL, item_id INTEGER NOT NULL, PRIMARY KEY(user_id,item_id));
CREATE TABLE IF NOT EXISTS store_applications(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, cuisine TEXT, description TEXT, address TEXT, phone TEXT, eta TEXT, permit TEXT,
  lat REAL, lng REAL, status TEXT NOT NULL DEFAULT 'pending', reason TEXT, created_at TEXT NOT NULL, decided_at TEXT, store_id INTEGER);
"""
# pretend stores in the area: (name, cuisine, short description, address, delivery time)
STORES = [
 ("Aling Nena's Carinderia", "Filipino · Home-cooked", "Ulam and rice meals cooked fresh every morning.", "Rizal St., Poblacion", "20-30 min", 9.3358, 125.9760),
 ("Kuya Jun's Ihaw-Ihaw", "Filipino · Grill", "Charcoal-grilled chicken, pork and street-food favorites.", "Lininti-an, Poblacion", "25-35 min", 9.3379, 125.9767),
 ("Lola Cora's Merienda", "Snacks · Kakanin · Dessert", "Afternoon snacks and sweet treats the old-school way.", "Magosilom, Poblacion", "15-25 min", 9.3335, 125.9747),
 ("Bean There Cafe", "Coffee · Drinks", "Coffee, fruit shakes and light bites.", "Near the town plaza", "15-25 min", 9.3345, 125.9735),
 ("Burger Barn", "Burgers · Fried Chicken", "Big burgers, crispy chicken and fries.", "Pag-antayan", "20-30 min", 9.3330, 125.9677),
 ("Mama Rosa's Pizza & Pasta", "Italian · Pizza", "Pizza and pasta, baked to order.", "Lininti-an", "30-40 min", 9.3370, 125.9745),
 ("Dragon Wok", "Chinese · Rice meals", "Wok-fired favorites and noodle soups.", "Poblacion", "25-35 min", 9.3350, 125.9715),
 ("Sip & Sweet Milk Tea", "Milk Tea · Drinks", "Milk tea, boba and matcha, made to your sweetness level.", "Town center", "10-20 min", 9.3352, 125.9762),
]
# dishes: (store number, name, description, price, category, icon)
SEED = [
 (0,"Chicken Adobo Rice","Soy-vinegar braised chicken with garlic rice",149,"Meals","drumstick"),
 (0,"Sinigang na Baboy","Sour tamarind pork soup with vegetables",189,"Meals","soup"),
 (0,"Pork Sisig","Sizzling chopped pork with onions and chili",169,"Meals","beef"),
 (0,"Beef Tapa Silog","Cured beef, garlic rice, and fried egg",159,"Meals","egg-fried"),
 (0,"Pancit Canton","Stir-fried noodles with vegetables and pork",129,"Meals","utensils-crossed"),
 (0,"Kare-Kare","Oxtail and vegetables in peanut sauce with bagoong",219,"Meals","soup"),
 (1,"Chicken Inasal","Grilled chicken leg quarter with garlic rice",139,"Meals","drumstick"),
 (1,"Liempo Rice","Charcoal-grilled pork belly with rice and atchara",159,"Meals","beef"),
 (1,"Pork BBQ Rice","Three pork barbecue sticks with rice",129,"Meals","beef"),
 (1,"Inihaw na Pusit","Grilled squid stuffed with tomato and onion",199,"Meals","utensils"),
 (1,"Grilled Isaw","Ten sticks of grilled chicken intestine with vinegar dip",79,"Snacks","cookie"),
 (2,"Lumpiang Shanghai","Ten crispy pork rolls with sweet chili dip",99,"Snacks","cookie"),
 (2,"Turon","Banana and jackfruit in a caramelized wrapper",69,"Snacks","banana"),
 (2,"Banana Cue","Three fried saging na saba on a stick, caramelized",49,"Snacks","banana"),
 (2,"Pork Siomai","Six steamed pork dumplings with chili garlic",79,"Snacks","cookie"),
 (2,"Bibingka","Warm rice cake topped with salted egg and cheese",89,"Desserts","cake-slice"),
 (2,"Halo-halo","Shaved ice, sweet beans, leche flan, and ube",109,"Desserts","ice-cream-bowl"),
 (2,"Leche Flan","Silky caramel custard",79,"Desserts","cake-slice"),
 (3,"Iced Coffee","Cold brew with milk and brown sugar",89,"Drinks","coffee"),
 (3,"Caramel Latte","Espresso, steamed milk and caramel",119,"Drinks","coffee"),
 (3,"Calamansi Juice","Fresh calamansi, lightly sweetened",59,"Drinks","citrus"),
 (3,"Mango Shake","Ripe Cebu mango blended with ice",99,"Drinks","cup-soda"),
 (3,"Club Sandwich","Triple-decker with chicken, egg, bacon and veggies",129,"Meals","utensils"),
 (3,"Choco Chip Cookie","Big chewy cookie with chocolate chunks",49,"Desserts","cookie"),
 (4,"Classic Cheeseburger","Beef patty, cheese, pickles and special sauce",129,"Meals","utensils"),
 (4,"Double Bacon Burger","Two beef patties with crispy bacon and cheese",179,"Meals","beef"),
 (4,"Crispy Fried Chicken","Two pieces of crispy fried chicken with rice",169,"Meals","drumstick"),
 (4,"Chicken Sandwich","Crispy chicken fillet with mayo and lettuce",139,"Meals","utensils"),
 (4,"French Fries","Large, salted and golden",69,"Snacks","cookie"),
 (4,"Onion Rings","Crunchy battered onion rings with dip",79,"Snacks","cookie"),
 (5,"Pepperoni Pizza","8-inch pizza with pepperoni and mozzarella",249,"Meals","utensils"),
 (5,"Hawaiian Pizza","8-inch pizza with ham and pineapple",229,"Meals","utensils"),
 (5,"Spaghetti","Filipino-style sweet spaghetti with hotdog and cheese",139,"Meals","utensils-crossed"),
 (5,"Carbonara","Creamy pasta with bacon and mushrooms",169,"Meals","utensils-crossed"),
 (5,"Lasagna","Baked beef lasagna with white sauce",189,"Meals","utensils"),
 (5,"Garlic Bread","Toasted garlic butter bread, four slices",69,"Snacks","cookie"),
 (6,"Beef Broccoli","Tender beef and broccoli in oyster sauce",189,"Meals","beef"),
 (6,"Yang Chow Fried Rice","Fried rice with shrimp, ham and egg",149,"Meals","utensils-crossed"),
 (6,"Sweet and Sour Pork","Crispy pork in sweet and sour sauce with rice",179,"Meals","beef"),
 (6,"Chopsuey","Mixed vegetables with chicken and quail egg",159,"Meals","utensils"),
 (6,"Beef Mami","Egg noodle soup with beef brisket",129,"Meals","soup"),
 (7,"Classic Milk Tea","Black tea with creamy milk and pearls",99,"Drinks","cup-soda"),
 (7,"Wintermelon Milk Tea","Sweet wintermelon with milk and pearls",99,"Drinks","cup-soda"),
 (7,"Taro Milk Tea","Creamy taro with pearls",109,"Drinks","cup-soda"),
 (7,"Brown Sugar Boba","Fresh milk with brown sugar syrup and pearls",119,"Drinks","cup-soda"),
 (7,"Matcha Latte","Japanese matcha with fresh milk",119,"Drinks","coffee"),
 (7,"Mango Graham Float","Layers of graham, cream and ripe mango",89,"Desserts","cake-slice"),
]

# pretend riders (name, vehicle, plate, rating) - one is assigned to every delivery order
RIDERS = [("Kuya Ramon", "Motorcycle", "NBD 4821", 4.9), ("Ate Liza", "Motorcycle", "TXA 1190", 4.8), ("Kuya Jomar", "E-bike", "No plate", 4.7),
          ("Kuya Dennis", "Motorcycle", "ABK 7302", 4.9), ("Ate Marge", "Scooter", "NCV 5567", 4.6), ("Kuya Paolo", "Bicycle", "No plate", 4.8)]
# Padali Rewards: 1 point for every P10 spent on a completed order. 100 points = P10 off.
TIERS = [("Bronze", 0), ("Silver", 150), ("Gold", 400)]

REVIEWERS = ["Maria S.", "Jun R.", "Angel D.", "Kuya Mark", "Bea L.", "Carlo T.", "Tita Lyn", "Paolo V.", "Jessa M.", "Rico B.", "Nica P.", "Ian C."]
COMMENTS = ["Sarap! Mainit pa pagdating.", "Worth it, malaki ang serving.", "Mabilis dumating, will order again.", "Medyo matagal pero masarap.",
            "Paborito ko na dito, laging tama ang lasa.", "Fresh ang ingredients, malinis ang packaging.", "Solid for the price.", "Okay lang, pwede pang pagbutihin.",
            "Super bait ng rider, sakto ang order.", "Pang-barkada, sulit!"]

FOOD_COMMENTS = ["Malasa at mainit pa pagdating.", "Sakto ang timpla, hindi maalat.", "Malaki ang serving, sulit!", "Crispy pa rin kahit na-deliver.",
                 "Fresh ang sangkap, halatang bagong luto.", "Pwede pang dagdagan ang sauce.", "Paborito ko 'to, uulitin ko.", "Medyo lumamig na pero masarap pa rin.",
                 "Sobrang sarap, umorder ulit ako kinabukasan.", "Okay lang, medyo matabang para sa akin."]
DELIVERY_COMMENTS = {"fast": ["Wala pang 20 minutes, mainit pa ang pagkain!", "Mas mabilis pa sa inaasahan ko.", "Ang bilis ng rider, salamat!"],
                     "ontime": ["Sakto sa sinabing oras.", "Dumating ayon sa schedule, maayos ang rider.", "On time, maayos ang pagkakabalot."],
                     "late": ["Medyo natagalan pero okay lang.", "Late ng mga 15 minutes, pero mabait ang rider.", "Natagalan, sana mas mabilis next time."]}
DELIVERY_TAGS = {"fast": "Faster than expected", "ontime": "On time", "late": "Took a while"}

def init_db():
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    # upgrade older databases
    cols = {r[1] for r in con.execute("PRAGMA table_info(orders)")}
    for c, t in (("discount","REAL DEFAULT 0"),("promo","TEXT"),("fee","REAL DEFAULT 0"),("otype","TEXT DEFAULT 'Pickup'"),("status","INTEGER"),("addr","TEXT"),("rider","INTEGER"),("tip","REAL NOT NULL DEFAULT 0"),("pts_used","INTEGER NOT NULL DEFAULT 0"),("sched_at","TEXT"),("dlat","REAL"),("dlng","REAL"),("ret_status","TEXT"),("ret_kind","TEXT"),("ret_reason","TEXT"),("ret_detail","TEXT"),("ret_at","TEXT"),("ret_note","TEXT"),("ret_done_at","TEXT")):
        if c not in cols: con.execute(f"ALTER TABLE orders ADD COLUMN {c} {t}")
    if "role" not in {r[1] for r in con.execute("PRAGMA table_info(users)")}:
        con.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
    if "available" not in {r[1] for r in con.execute("PRAGMA table_info(menu_items)")}:
        con.execute("ALTER TABLE menu_items ADD COLUMN available INTEGER NOT NULL DEFAULT 1")
    if "store_id" not in {r[1] for r in con.execute("PRAGMA table_info(menu_items)")}:
        con.execute("ALTER TABLE menu_items ADD COLUMN store_id INTEGER")
    if "image" not in {r[1] for r in con.execute("PRAGMA table_info(menu_items)")}:
        con.execute("ALTER TABLE menu_items ADD COLUMN image TEXT")
    oc = {r[1] for r in con.execute("PRAGMA table_info(order_items)")}
    for c, t in (("store", "TEXT"), ("custom", "INTEGER NOT NULL DEFAULT 0"), ("note", "TEXT")):
        if c not in oc: con.execute(f"ALTER TABLE order_items ADD COLUMN {c} {t}")
    if "is_open" not in {r[1] for r in con.execute("PRAGMA table_info(stores)")}:
        con.execute("ALTER TABLE stores ADD COLUMN is_open INTEGER NOT NULL DEFAULT 1")
    for c in ("lat", "lng"):
        if c not in {r[1] for r in con.execute("PRAGMA table_info(stores)")}: con.execute(f"ALTER TABLE stores ADD COLUMN {c} REAL")
    for c, t in (("owner_id", "INTEGER"), ("phone", "TEXT"), ("permit", "TEXT")):        # store owner (set when the admin approves a store application)
        if c not in {r[1] for r in con.execute("PRAGMA table_info(stores)")}: con.execute(f"ALTER TABLE stores ADD COLUMN {c} {t}")
    if not con.execute("SELECT 1 FROM stores").fetchone():            # first run: stores + their dishes
        ids = [con.execute("INSERT INTO stores(name,cuisine,description,address,eta,lat,lng) VALUES(?,?,?,?,?,?,?)", st).lastrowid for st in STORES]
        for n, name, d, price, cat, icon in SEED:
            old = con.execute("SELECT id FROM menu_items WHERE name=? AND store_id IS NULL", (name,)).fetchone()   # older database: keep the same dish id
            if old: con.execute("UPDATE menu_items SET store_id=?,description=?,price=?,category=?,emoji=? WHERE id=?", (ids[n], d, price, cat, icon, old[0]))
            else: con.execute("INSERT INTO menu_items(name,description,price,category,emoji,store_id) VALUES(?,?,?,?,?,?)", (name, d, price, cat, icon, ids[n]))
    for k, (sid,) in enumerate(con.execute("SELECT id FROM stores WHERE lat IS NULL").fetchall()):   # older database: give every store a map pin near the town center
        con.execute("UPDATE stores SET lat=?,lng=? WHERE id=?", (AREA_CENTER[0] + 0.0012 * (k % 4 - 1.5), AREA_CENTER[1] - 0.0015 * (k % 5), sid))
    if con.execute("SELECT 1 FROM menu_items WHERE store_id IS NULL").fetchone():   # dishes an admin added before stores existed
        sid = con.execute("INSERT INTO stores(name,cuisine,description,address,eta) VALUES(?,?,?,?,?)",
                          ("Padali Kitchen", "Assorted", "Dishes from the original menu.", "Padali HQ", "20-30 min")).lastrowid
        con.execute("UPDATE menu_items SET store_id=? WHERE store_id IS NULL", (sid,))
    if not con.execute("SELECT 1 FROM reviews").fetchone():           # pretend past customers so every store already has ratings
        rnd = random.Random(7); now = datetime.now(timezone.utc)
        for (sid,) in con.execute("SELECT id FROM stores").fetchall():
            for k in range(rnd.randint(5, 8)):
                con.execute("INSERT INTO reviews(store_id,name,rating,comment,created_at) VALUES(?,?,?,?,?)",
                    (sid, rnd.choice(REVIEWERS), rnd.choice((5, 5, 5, 4, 4, 4, 3)), rnd.choice(COMMENTS), (now - timedelta(days=rnd.randint(1, 40), hours=rnd.randint(0, 20))).isoformat()))
    if "avatar" not in {r[1] for r in con.execute("PRAGMA table_info(users)")}:           # profile picture (file path under /static/uploads/avatars)
        con.execute("ALTER TABLE users ADD COLUMN avatar TEXT")
    if "reply" not in {r[1] for r in con.execute("PRAGMA table_info(reviews)")}:          # the admin can answer a comment
        con.execute("ALTER TABLE reviews ADD COLUMN reply TEXT")
    rnd = random.Random(11); now = datetime.now(timezone.utc)
    if not con.execute("SELECT 1 FROM food_reviews").fetchone():      # pretend past customers also rated the food itself
        for iid, name, sid in con.execute("SELECT id,name,store_id FROM menu_items WHERE store_id IS NOT NULL").fetchall():
            for k in range(rnd.randint(2, 4)):
                con.execute("INSERT INTO food_reviews(item_name,store_id,name,rating,comment,created_at) VALUES(?,?,?,?,?,?)",
                    (name, sid, rnd.choice(REVIEWERS), rnd.choice((5, 5, 4, 4, 4, 3)), rnd.choice(FOOD_COMMENTS), (now - timedelta(days=rnd.randint(1, 35), hours=rnd.randint(0, 20))).isoformat()))
    if not con.execute("SELECT 1 FROM delivery_reviews").fetchone():  # ...and the delivery time (kept apart from food and store comments)
        for (sid,) in con.execute("SELECT id FROM stores").fetchall():
            for k in range(rnd.randint(4, 6)):
                tag = rnd.choice(("fast", "ontime", "ontime", "ontime", "late")); rate = {"fast": 5, "ontime": rnd.choice((4, 5)), "late": rnd.choice((2, 3))}[tag]
                con.execute("INSERT INTO delivery_reviews(store_id,name,rating,speed,comment,created_at) VALUES(?,?,?,?,?,?)",
                    (sid, rnd.choice(REVIEWERS), rate, tag, rnd.choice(DELIVERY_COMMENTS[tag]), (now - timedelta(days=rnd.randint(1, 35), hours=rnd.randint(0, 20))).isoformat()))
    os.makedirs(AVATAR_DIR, exist_ok=True)
    # default admin account (user: admin / password: 123456)
    if not con.execute("SELECT 1 FROM users WHERE username='admin'").fetchone():
        con.execute("INSERT INTO users(full_name,email,phone,address,username,password_hash,role) VALUES(?,?,?,?,?,?,?)",
                    ("Administrator", "admin@padali.local", "09000000000", "Padali HQ", "admin", generate_password_hash("123456"), "admin"))
    if os.environ.get("ADMIN_PASSWORD"):      # set ADMIN_PASSWORD in Vercel to replace the default 123456
        con.execute("UPDATE users SET password_hash=? WHERE username='admin'", (generate_password_hash(os.environ["ADMIN_PASSWORD"]),))
    con.commit(); con.close()

def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(_):
    d = g.pop("db", None)
    if d: d.close()

def err(msg, code=400):
    return jsonify(error=msg), code

def user_dict(r):
    return {"id": r["id"], "u": r["username"], "name": r["full_name"], "email": r["email"], "role": r["role"], "av": r["avatar"]}

def current_user():
    uid = session.get("uid")
    return db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone() if uid else None

@app.get("/")
def landing():
    return render_template("landing.html")

# ---- pages (one HTML file each, see templates/) ----
def home_for(u):
    return "/admin" if u["role"] == "admin" else "/owner" if u["role"] == "owner" else "/app"

def auth_page(tpl):
    u = current_user()
    if u: return redirect(home_for(u))
    return render_template(tpl)

def user_page(tpl):
    u = current_user()
    if not u: return redirect("/login")
    if u["role"] == "admin": return redirect("/admin")
    return render_template(tpl)

def admin_page(tpl):
    u = current_user()
    if not u: return redirect("/login")
    if u["role"] != "admin": return redirect("/app")
    return render_template(tpl)

@app.get("/login")
def login_page(): return auth_page("login.html")

@app.get("/register")
def register_page(): return auth_page("register.html")

@app.get("/app")
def app_page(): return user_page("home.html")

@app.get("/menu")
def menu_page(): return user_page("menu.html")

@app.get("/favorites")
def favorites_page(): return user_page("favorites.html")

@app.get("/orders")
def orders_page(): return user_page("orders.html")

@app.get("/profile")
def profile_page(): return user_page("profile.html")

@app.get("/planner")
def planner_page(): return user_page("planner.html")

@app.get("/checkout")
def checkout_page(): return user_page("checkout.html")

@app.get("/receipt")
def receipt_page(): return user_page("receipt.html")

@app.post("/api/register")
def register():
    f = request.get_json(silent=True) or {}
    keys = ("name", "email", "phone", "addr", "u", "p")
    if any(not str(f.get(k, "")).strip() for k in keys):
        return err("Fill in all fields.")
    if not re.fullmatch(r"09\d{9}", f["phone"]):
        return err("Enter an 11-digit phone number starting with 09.")
    if len(f["u"]) < 3 or len(f["p"]) < 6:
        return err("Username needs 3+ characters and password needs 6+.")
    try:
        cur = db().execute(
            "INSERT INTO users(full_name,email,phone,address,username,password_hash) VALUES(?,?,?,?,?,?)",
            (f["name"].strip(), f["email"].strip(), f["phone"], f["addr"].strip(), f["u"].strip(),
             generate_password_hash(f["p"])))
        db().commit()
    except sqlite3.IntegrityError:
        return err("That username is taken. Try a different one.")
    session["uid"] = cur.lastrowid
    return jsonify(user=user_dict(current_user()))

@app.post("/api/login")
def login():
    f = request.get_json(silent=True) or {}
    r = db().execute("SELECT * FROM users WHERE username=?", (str(f.get("u", "")).strip(),)).fetchone()
    if not r or not check_password_hash(r["password_hash"], str(f.get("p", ""))):
        return err("Wrong username or password. Check your details and try again.", 401)
    session["uid"] = r["id"]
    return jsonify(user=user_dict(r))

@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)

@app.get("/api/me")
def me():
    r = current_user()
    return (jsonify(user=user_dict(r)) if r else err("Not logged in.", 401))

def img_for(name, image):
    """a photo link set by the admin wins, then the downloaded photo static/img/food/<slug>.jpg, and if there is none
    (no internet, corrupted download...) a picture drawn by the app itself, so every dish always has an image"""
    if image: return image
    f = photos.path_for(name)
    if os.path.exists(f) and photos.is_jpeg(open(f, "rb").read()): return "/static/img/food/" + photos.slug(name) + ".jpg"
    return "/dish-art/" + photos.slug(name) + ".svg"

DISH_EMOJI = {
    "Banana Cue": "🍌", "Beef Broccoli": "🥦", "Beef Mami": "🍜", "Beef Tapa Silog": "🥩", "Bibingka": "🥞", "Brown Sugar Boba": "🧋",
    "Calamansi Juice": "🍋", "Caramel Latte": "☕", "Carbonara": "🍝", "Chicken Adobo Rice": "🍛", "Chicken Inasal": "🍗",
    "Chicken Sandwich": "🥪", "Choco Chip Cookie": "🍪", "Chopsuey": "🥗", "Classic Cheeseburger": "🍔", "Classic Milk Tea": "🧋",
    "Club Sandwich": "🥪", "Crispy Fried Chicken": "🍗", "Double Bacon Burger": "🍔", "French Fries": "🍟", "Garlic Bread": "🥖",
    "Grilled Isaw": "🍢", "Halo-halo": "🍧", "Hawaiian Pizza": "🍕", "Iced Coffee": "🧊", "Inihaw na Pusit": "🦑", "Kare-Kare": "🍲",
    "Lasagna": "🍝", "Leche Flan": "🍮", "Liempo Rice": "🥓", "Lumpiang Shanghai": "🥟", "Mango Graham Float": "🥭", "Mango Shake": "🥭",
    "Matcha Latte": "🍵", "Onion Rings": "🧅", "Pancit Canton": "🍜", "Pepperoni Pizza": "🍕", "Pork BBQ Rice": "🍢", "Pork Siomai": "🥟",
    "Pork Sisig": "🍳", "Sinigang na Baboy": "🍲", "Spaghetti": "🍝", "Sweet and Sour Pork": "🍖", "Taro Milk Tea": "🧋", "Turon": "🌯",
    "Wintermelon Milk Tea": "🧋", "Yang Chow Fried Rice": "🍚"}

@app.get("/dish-art/<slug>.svg")
def dish_art(slug):
    """a colourful picture for a dish that has no photo: big emoji on a soft gradient plate"""
    name = next((n for n in DISH_EMOJI if photos.slug(n) == slug), None)
    emoji = DISH_EMOJI.get(name, "🍽️")
    hue = sum(ord(c) for c in slug) * 37 % 360
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">'
           f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl({hue},85%,78%)"/><stop offset="1" stop-color="hsl({(hue+40)%360},80%,62%)"/></linearGradient></defs>'
           f'<rect width="400" height="300" fill="url(#g)"/><circle cx="200" cy="150" r="108" fill="#fff" fill-opacity=".38"/><circle cx="200" cy="150" r="84" fill="#fff" fill-opacity=".5"/>'
           f'<text x="200" y="150" font-size="104" text-anchor="middle" dominant-baseline="central" font-family="Segoe UI Emoji,Apple Color Emoji,Noto Color Emoji,sans-serif">{emoji}</text></svg>')
    return Response(svg, mimetype="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})

@app.get("/api/menu")
def menu():
    rows = db().execute("""SELECT m.id,m.name n,m.description d,m.price p,m.category c,m.emoji e,m.store_id s,m.image im,
        (SELECT ROUND(AVG(f.rating),1) FROM food_reviews f WHERE f.item_name=m.name AND f.store_id=m.store_id) fr,
        (SELECT COUNT(*) FROM food_reviews f WHERE f.item_name=m.name AND f.store_id=m.store_id) fc
        FROM menu_items m WHERE m.available=1 AND m.store_id IS NOT NULL""").fetchall()
    out = []
    for r in rows:
        d = dict(r); d["img"] = img_for(d["n"], d.pop("im")); out.append(d)
    return jsonify(items=out)

@app.get("/api/stores")
def stores():
    rows = db().execute("""SELECT s.id,s.name n,s.cuisine cu,s.description d,s.address a,s.eta,s.is_open open,s.lat,s.lng,
        ROUND(COALESCE(AVG(r.rating),0),1) rating, COUNT(r.id) rc FROM stores s LEFT JOIN reviews r ON r.store_id=s.id GROUP BY s.id ORDER BY s.id""").fetchall()
    out = []
    for r in rows:
        d = dict(r); sl = photos.slug(d["n"])           # a store photo: static/img/store/<store-name>.jpg (optional)
        d["img"] = "/static/img/store/" + sl + ".jpg" if os.path.exists(os.path.join(photos.HERE, "static", "img", "store", sl + ".jpg")) else None
        out.append(d)
    return jsonify(area=AREA, center={"lat": AREA_CENTER[0], "lng": AREA_CENTER[1]}, radius=DELIVERY_RADIUS_KM, stores=out)

def reviewer_name(u):
    parts = u["full_name"].split()
    return parts[0] + (" " + parts[-1][0] + "." if len(parts) > 1 else "")

def feedback_out(rows, extra=()):
    """one shape for every kind of comment: who, stars, text, when, the admin's answer, and (if any) the profile picture"""
    out = []
    for r in rows:
        d = {"name": r["name"], "rating": r["rating"], "comment": r["comment"], "d": r["created_at"], "reply": r["reply"], "av": r["av"]}
        for k in extra: d[k] = r[k]
        out.append(d)
    return out

def summary_of(table, where, args):
    r = db().execute(f"SELECT COUNT(*) n, ROUND(COALESCE(AVG(rating),0),1) a FROM {table} WHERE {where}", args).fetchone()
    return {"n": r["n"], "avg": r["a"]}

@app.get("/api/stores/<int:i>/reviews")
def store_reviews(i):
    """store comments (about the store itself: service, packaging, how it is run)"""
    rows = db().execute("SELECT r.name,r.rating,r.comment,r.created_at,r.reply,u.avatar av FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.store_id=? ORDER BY r.id DESC LIMIT 12", (i,)).fetchall()
    return jsonify(reviews=feedback_out(rows), **summary_of("reviews", "store_id=?", (i,)))

@app.get("/api/stores/<int:i>/food-reviews")
def store_food_reviews(i):
    """comments about the dishes sold by this store"""
    rows = db().execute("SELECT r.item_name,r.name,r.rating,r.comment,r.created_at,r.reply,u.avatar av FROM food_reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.store_id=? ORDER BY r.id DESC LIMIT 12", (i,)).fetchall()
    return jsonify(reviews=feedback_out(rows, ("item_name",)), **summary_of("food_reviews", "store_id=?", (i,)))

DEL_WHERE = "(store_id=? OR order_id IN (SELECT oi.order_id FROM order_items oi WHERE oi.store=(SELECT name FROM stores WHERE id=?)))"

@app.get("/api/stores/<int:i>/delivery-reviews")
def store_delivery_reviews(i):
    """comments about the delivery time of orders that included this store"""
    rows = db().execute(f"SELECT r.speed,r.name,r.rating,r.comment,r.created_at,r.reply,u.avatar av FROM delivery_reviews r LEFT JOIN users u ON u.id=r.user_id WHERE {DEL_WHERE.replace('store_id=?', 'r.store_id=?').replace('order_id IN', 'r.order_id IN')} ORDER BY r.id DESC LIMIT 12", (i, i)).fetchall()
    return jsonify(reviews=feedback_out(rows, ("speed",)), **summary_of("delivery_reviews", DEL_WHERE, (i, i)))

@app.get("/api/dishes/reviews")
def dish_reviews():
    name = request.args.get("name", ""); sid = request.args.get("store", type=int)
    rows = db().execute("SELECT r.name,r.rating,r.comment,r.created_at,r.reply,u.avatar av FROM food_reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.item_name=? AND r.store_id=? ORDER BY r.id DESC LIMIT 20", (name, sid)).fetchall()
    return jsonify(reviews=feedback_out(rows), **summary_of("food_reviews", "item_name=? AND store_id=?", (name, sid)))

@app.get("/api/popular")
def popular():
    rows = db().execute("""SELECT oi.name n, oi.store s, SUM(oi.qty) q FROM order_items oi JOIN orders o ON o.id=oi.order_id
        WHERE oi.custom=0 AND COALESCE(o.status,0)>=0 GROUP BY oi.name,oi.store ORDER BY q DESC LIMIT 8""").fetchall()
    return jsonify(items=[dict(r) for r in rows])

def own_completed_order(u, code):
    """the order must be the customer's own and already completed before anything can be rated"""
    m = re.fullmatch(r"ORD-(\d+)", str(code or ""))
    o = db().execute("SELECT * FROM orders WHERE id=? AND user_id=?", (int(m[1]) - 1000, u["id"])).fetchone() if m else None
    if not o: return None, err("Order not found.", 404)
    if eff_status(o) != 2: return None, err("You can rate an order once it is completed.")
    return o, None

def clean_rating(f):
    r = f.get("rating")
    return r if isinstance(r, int) and 1 <= r <= 5 else None

@app.post("/api/reviews/food")
def add_food_review():
    u, bad = need_user()
    if bad: return bad
    f = request.get_json(silent=True) or {}
    o, e = own_completed_order(u, f.get("order"))
    if e: return e
    rating = clean_rating(f)
    st = db().execute("SELECT id,owner_id FROM stores WHERE name=?", (f.get("store"),)).fetchone()
    name = str(f.get("name") or "")
    if not rating or not st: return err("Could not save your food rating.")
    if st["owner_id"] == u["id"]: return err("You can not rate your own store.")
    if not db().execute("SELECT 1 FROM order_items WHERE order_id=? AND name=? AND store=? AND custom=0", (o["id"], name, f["store"])).fetchone(): return err("That dish is not part of this order.")
    if db().execute("SELECT 1 FROM food_reviews WHERE order_id=? AND item_name=? AND store_id=?", (o["id"], name, st["id"])).fetchone(): return err("You already rated this dish for this order.")
    db().execute("INSERT INTO food_reviews(item_name,store_id,user_id,name,order_id,rating,comment,created_at) VALUES(?,?,?,?,?,?,?,?)",
                 (name, st["id"], u["id"], reviewer_name(u), o["id"], rating, str(f.get("comment") or "").strip()[:200], datetime.now(timezone.utc).isoformat()))
    db().commit()
    return jsonify(ok=True)

@app.post("/api/reviews/delivery")
def add_delivery_review():
    u, bad = need_user()
    if bad: return bad
    f = request.get_json(silent=True) or {}
    o, e = own_completed_order(u, f.get("order"))
    if e: return e
    rating = clean_rating(f)
    if not rating or f.get("speed") not in DELIVERY_TAGS: return err("Choose the stars and how the delivery time was.")
    if o["otype"] != "Delivery": return err("Only delivery orders have a delivery time to rate.")
    if db().execute("SELECT 1 FROM delivery_reviews WHERE order_id=?", (o["id"],)).fetchone(): return err("You already rated the delivery of this order.")
    db().execute("INSERT INTO delivery_reviews(order_id,user_id,name,rating,speed,comment,created_at) VALUES(?,?,?,?,?,?,?)",
                 (o["id"], u["id"], reviewer_name(u), rating, f["speed"], str(f.get("comment") or "").strip()[:200], datetime.now(timezone.utc).isoformat()))
    db().commit()
    return jsonify(ok=True)

@app.post("/api/reviews")
def add_review():
    u, bad = need_user()
    if bad: return bad
    f = request.get_json(silent=True) or {}
    m = re.fullmatch(r"ORD-(\d+)", str(f.get("order", "")))
    o = db().execute("SELECT * FROM orders WHERE id=? AND user_id=?", (int(m[1]) - 1000, u["id"])).fetchone() if m else None
    st = db().execute("SELECT id,owner_id FROM stores WHERE name=?", (f.get("store"),)).fetchone()
    rating = f.get("rating")
    if not o or not st or not isinstance(rating, int) or not 1 <= rating <= 5: return err("Could not save your rating.")
    if st["owner_id"] == u["id"]: return err("You can not rate your own store.")
    if eff_status(o) != 2: return err("You can rate a store once the order is completed.")
    if not db().execute("SELECT 1 FROM order_items WHERE order_id=? AND store=? AND custom=0", (o["id"], f["store"])).fetchone(): return err("That store is not part of this order.")
    if db().execute("SELECT 1 FROM reviews WHERE order_id=? AND store_id=?", (o["id"], st["id"])).fetchone(): return err("You already rated this store for this order.")
    db().execute("INSERT INTO reviews(store_id,user_id,name,order_id,rating,comment,created_at) VALUES(?,?,?,?,?,?,?)",
                 (st["id"], u["id"], u["full_name"].split()[0] + " " + (u["full_name"].split()[-1][0] + "." if len(u["full_name"].split()) > 1 else ""),
                  o["id"], rating, str(f.get("comment") or "").strip()[:200], datetime.now(timezone.utc).isoformat()))
    db().commit()
    return jsonify(ok=True)

WALLETS = ("GCash", "Maya", "PayPal")

def check_payment(method, d, total):
    if method == "Cash":
        try: cash = float(d.get("cash"))
        except (TypeError, ValueError): return "Enter the cash amount."
        if cash < total: return f"Cash on hand is less than the ₱{total:,.2f} total."
    elif method == "Card":
        if not re.fullmatch(r"\d{16}", str(d.get("num", "")).replace(" ", "")): return "Card number must be 16 digits."
        if not re.fullmatch(r"(0[1-9]|1[0-2])/\d{2}", str(d.get("exp", ""))): return "Enter the expiry as MM/YY."
        if not re.fullmatch(r"\d{3}", str(d.get("cvv", ""))): return "CVV must be 3 digits."
    elif method == "E-Wallet":
        if d.get("w") not in WALLETS: return "Choose a valid e-wallet."
        if d.get("w") == "PayPal":
            if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", str(d.get("pp", ""))): return "Enter your PayPal email."
        elif not re.fullmatch(r"09\d{9}", str(d.get("mob", ""))): return "Mobile number must be 11 digits and start with 09."
    else:
        return "Choose a payment method."
    return None

PROMOS = {"WELCOME10": ("pct", 10, 0), "SAVE50": ("flat", 50, 300)}
FEES = {"Delivery": 49}                              # delivery only: no dine-in or pickup

def calc_discount(code, sub):
    if not code: return 0.0, None
    p = PROMOS.get(str(code).strip().upper())
    if not p: return None, "That promo code is not valid."
    kind, val, minimum = p
    if sub < minimum: return None, f"This code needs a minimum order of ₱{minimum:,.0f}."
    return (round(sub * val / 100, 2) if kind == "pct" else float(val)), None

def need_user():
    u = current_user()
    return u, (None if u else err("Please log in first.", 401))

_geo_cache = {}
def _nominatim(path, params):
    """Ask OpenStreetMap's free Nominatim service (needs internet on the server). Returns parsed JSON or None."""
    key = (path, tuple(sorted(params.items())))
    if key in _geo_cache: return _geo_cache[key]
    try:
        req = urllib.request.Request("https://nominatim.openstreetmap.org/" + path + "?" + urllib.parse.urlencode({**params, "format": "jsonv2"}),
                                     headers={"User-Agent": "PadaliOrdering/1.0 (school project)"})
        with urllib.request.urlopen(req, timeout=6) as r: data = json.load(r)
    except Exception: return None
    if len(_geo_cache) > 500: _geo_cache.clear()
    _geo_cache[key] = data
    return data

@app.post("/api/geocode")
def geocode():
    """Typed address -> map pin ({q}), or map pin -> address ({lat, lng}). Always limited to the delivery area."""
    u, e = need_user()
    if e: return e
    f = request.get_json(silent=True) or {}
    if f.get("q") is not None:
        q = str(f["q"]).strip()[:200]
        if len(q) < 5: return err("Type a longer address.")
        d = 0.15                                              # search box around the town center (about 15 km)
        box = f"{AREA_CENTER[1]-d},{AREA_CENTER[0]+d},{AREA_CENTER[1]+d},{AREA_CENTER[0]-d}"
        res = _nominatim("search", {"q": q if AREA.split(",")[0].lower() in q.lower() else q + ", " + AREA, "limit": 1, "countrycodes": "ph", "viewbox": box, "bounded": 1})
        if res is None: return err("Address lookup is not available right now. Drop a pin on the map instead.", 503)
        if not res: return err("Could not find that address on the map. Tap the map to place your pin.", 404)
        lat, lng = float(res[0]["lat"]), float(res[0]["lon"])
        if km_between((lat, lng), AREA_CENTER) > DELIVERY_RADIUS_KM: return err(f"Sorry, that address is outside our delivery area ({AREA}).")
        return jsonify(lat=lat, lng=lng)
    try: lat, lng = float(f["lat"]), float(f["lng"])
    except (TypeError, ValueError, KeyError): return err("That map location is not valid.")
    res = _nominatim("reverse", {"lat": round(lat, 5), "lon": round(lng, 5), "zoom": 18})
    a = (res or {}).get("address") or {}
    parts = [a.get("house_number"), a.get("road"), a.get("neighbourhood") or a.get("suburb") or a.get("village") or a.get("quarter"), a.get("town") or a.get("city") or a.get("municipality")]
    text = ", ".join(x for x in parts if x)
    return jsonify(addr=text)

@app.post("/api/promo")
def promo():
    f = request.get_json(silent=True) or {}
    try: sub = float(f.get("subtotal") or 0)
    except ValueError: sub = 0
    d, e = calc_discount(f.get("code"), sub)
    return err(e) if e else jsonify(discount=d)

@app.post("/api/orders")
def create_order():
    u, bad = need_user()
    if bad: return bad
    f = request.get_json(silent=True) or {}
    items = []                      # (name, price, qty, store, custom, note)
    for it in f.get("items", []):
        r = db().execute("SELECT m.name,m.price,s.name sname,s.is_open,s.owner_id FROM menu_items m JOIN stores s ON s.id=m.store_id WHERE m.id=? AND m.available=1", (it.get("id"),)).fetchone()
        q = it.get("q")
        if r and not r["is_open"]: return err(f"{r['sname']} is closed right now. Remove its items to continue.")
        if r and r["owner_id"] == u["id"]: return err("You can not order from your own store.")
        if r and isinstance(q, int) and 0 < q <= 99: items.append((r["name"], r["price"], q, r["sname"], 0, None))
    for c in (f.get("custom") or [])[:10]:          # "other order": food the customer types in, from any store
        name = str(c.get("name", "")).strip()[:80]; store = str(c.get("store", "")).strip()[:60]; note = str(c.get("note", "")).strip()[:140]
        q = c.get("q")
        try: price = round(float(c.get("p")), 2)
        except (TypeError, ValueError): price = 0
        if len(name) < 2 or not isinstance(q, int) or not 0 < q <= 20 or not 0 < price <= 5000:
            return err("Check your special request: it needs a name, a quantity and an estimated price.")
        items.append((name, price, q, store or "Special request", 1, note or None))
    if not items: return err("Your cart is empty.")
    sub = sum(i[1] * i[2] for i in items)
    disc, e = calc_discount(f.get("promo"), sub)
    if e: return err(e)
    otype = f.get("otype")
    if otype not in FEES: return err("Padali is delivery only.")
    addr = str(f.get("addr") or "").strip()[:200]
    has_pin = f.get("lat") is not None and f.get("lng") is not None
    if otype == "Delivery" and len(addr) < 5 and not has_pin: return err("Type your delivery address or drop a pin on the map.")
    fee = FEES[otype] * len({i[3] for i in items})      # delivery fee is charged per store
    dlat = dlng = None
    if otype == "Delivery" and f.get("lat") is not None:           # where the customer dropped the pin on the map
        try: dlat, dlng = float(f["lat"]), float(f["lng"])
        except (TypeError, ValueError, KeyError): return err("That map location is not valid.")
        if not (-90 <= dlat <= 90 and -180 <= dlng <= 180): return err("That map location is not valid.")
        if km_between((dlat, dlng), AREA_CENTER) > DELIVERY_RADIUS_KM: return err(f"Sorry, that pin is outside our delivery area ({AREA}).")
        if len(addr) < 5:                                                # GPS / pin only: write the address ourselves
            g = (_nominatim("reverse", {"lat": round(dlat, 5), "lon": round(dlng, 5), "zoom": 18}) or {}).get("display_name") or ""
            addr = g[:200] if len(g) >= 5 else f"Pinned location ({dlat:.5f}, {dlng:.5f})"
    base = max(0, sub - disc)
    tip = 0.0
    if otype == "Delivery":                                   # optional tip for the rider
        try: tip = round(float(f.get("tip") or 0), 2)
        except (TypeError, ValueError): tip = -1
        if not 0 <= tip <= 500: return err("Choose a valid tip.")
    try: want = int(f.get("points") or 0)                     # Padali Rewards points the customer wants to use
    except (TypeError, ValueError): want = -1
    bal = rewards(u["id"])["balance"]
    if want < 0 or want > bal: return err("You don't have that many reward points.")
    pts = min(want, int(base * 10))                           # 10 points = P1, never more than the food total
    total = round(base - pts / 10 + fee + tip, 2)
    sm = f.get("sched") or 0
    if sm not in (0, 30, 60, 120): return err("Choose a valid delivery time.")
    method = f.get("method"); details = f.get("details") or {}
    msg = check_payment(method, details, total)
    if msg: return err(msg)
    label = details.get("w", "E-Wallet") if method == "E-Wallet" else method
    nowdt = datetime.now(timezone.utc); now = nowdt.isoformat()
    sched_at = (nowdt + timedelta(minutes=sm)).isoformat() if sm else None
    rider = random.randrange(len(RIDERS)) if otype == "Delivery" else None
    cur = db().execute("INSERT INTO orders(user_id,total,method,notify,created_at,discount,promo,fee,otype,addr,rider,tip,pts_used,sched_at,dlat,dlng) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (u["id"], total, label, int(bool(f.get("notify"))), now, disc, (f.get("promo") or "").upper() or None, fee, otype, addr if otype == "Delivery" else None, rider, tip, pts, sched_at, dlat, dlng))
    oid = cur.lastrowid
    db().executemany("INSERT INTO order_items(order_id,name,price,qty,store,custom,note) VALUES(?,?,?,?,?,?,?)", [(oid, *i) for i in items])
    db().commit()
    o = db().execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
    return jsonify(order=order_json(o, items, u["email"]))

def status(created):
    m = (datetime.now(timezone.utc) - datetime.fromisoformat(created)).total_seconds() / 60
    return 0 if m < 2 else 1 if m < 5 else 2

def eff_status(o):
    return o["status"] if o["status"] is not None else status(o["sched_at"] or o["created_at"])   # a scheduled order starts at its scheduled time

def pts_of(o):
    return max(0, int(((o["total"] or 0) - (o["tip"] or 0)) // 10))

def rewards(uid):
    earned = used = 0
    for o in db().execute("SELECT * FROM orders WHERE user_id=?", (uid,)):
        s = eff_status(o)
        refunded = o["ret_status"] == "refunded"
        if s == 2 and not refunded: earned += pts_of(o)
        if s != -1 and not refunded: used += o["pts_used"] or 0
    tier = [t for t in TIERS if earned >= t[1]][-1]
    nxt = next((t for t in TIERS if t[1] > earned), None)
    return {"balance": max(0, earned - used), "earned": earned, "tier": tier[0], "tier_at": tier[1],
            "next": nxt[0] if nxt else None, "next_at": nxt[1] if nxt else None, "to_next": nxt[1] - earned if nxt else 0}

@app.get("/api/rewards")
def my_rewards():
    u, bad = need_user()
    if bad: return bad
    return jsonify(rewards(u["id"]))

def store_pin(items):                               # map position of the first real store in the order (where the rider starts)
    for it in items:
        if not it[4]:
            r = db().execute("SELECT name,lat,lng FROM stores WHERE name=? AND lat IS NOT NULL", (it[3],)).fetchone()
            if r: return {"n": r["name"], "lat": r["lat"], "lng": r["lng"]}
    return None

RETURN_REASONS = ("Wrong item received", "Missing item", "Item is damaged or spilled", "Food quality problem", "Order arrived too late", "Other")
RETURN_KINDS = ("Refund only", "Return and refund")
RETURN_WINDOW_DAYS = 7                                # a completed order can be returned / refunded within 7 days of ordering

def return_json(o):                                   # the return / refund request on an order (None if there is none)
    if not o["ret_status"]: return None
    return {"status": o["ret_status"], "kind": o["ret_kind"], "reason": o["ret_reason"], "detail": o["ret_detail"], "at": o["ret_at"],
            "note": o["ret_note"], "done_at": o["ret_done_at"], "amount": o["total"], "to": o["method"]}

def order_json(o, items, email):
    return {"id": f"ORD-{1000 + o['id']}", "sub": sum(i[1] * i[2] for i in items), "discount": o["discount"] or 0,
            "promo": o["promo"], "fee": o["fee"] or 0, "otype": o["otype"] or "Pickup", "total": o["total"],
            "method": o["method"], "notify": bool(o["notify"]), "date": o["created_at"], "email": email,
            "status": eff_status(o), "addr": o["addr"], "start": o["sched_at"] or o["created_at"], "sched": o["sched_at"],
            "dest": ({"lat": o["dlat"], "lng": o["dlng"]} if o["dlat"] is not None else None), "from": store_pin(items),
            "tip": o["tip"] or 0, "pts": o["pts_used"] or 0, "earn": pts_of(o) if eff_status(o) == 2 else 0,
            "rider": ({"n": RIDERS[o["rider"]][0], "v": RIDERS[o["rider"]][1], "p": RIDERS[o["rider"]][2], "r": RIDERS[o["rider"]][3]} if o["rider"] is not None else None),
            "reviewed": [r[0] for r in db().execute("SELECT s.name FROM reviews r JOIN stores s ON s.id=r.store_id WHERE r.order_id=?", (o["id"],))],
            "rv_food": [r[0] + "||" + r[1] for r in db().execute("SELECT f.item_name, s.name FROM food_reviews f JOIN stores s ON s.id=f.store_id WHERE f.order_id=?", (o["id"],))],
            "rv_del": bool(db().execute("SELECT 1 FROM delivery_reviews WHERE order_id=?", (o["id"],)).fetchone()),
            "ret": return_json(o),
            "items": [{"n": n, "p": p, "q": q, "s": st, "cu": cu, "no": no} for n, p, q, st, cu, no in items]}

@app.get("/api/orders")
def list_orders():
    u, bad = need_user()
    if bad: return bad
    out = []
    for o in db().execute("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC", (u["id"],)).fetchall():
        its = [(r["name"], r["price"], r["qty"], r["store"], r["custom"], r["note"]) for r in db().execute("SELECT name,price,qty,store,custom,note FROM order_items WHERE order_id=?", (o["id"],))]
        out.append(order_json(o, its, u["email"]))
    return jsonify(orders=out)

@app.post("/api/orders/<code>/cancel")
def cancel_order(code):
    u, bad = need_user()
    if bad: return bad
    m = re.fullmatch(r"ORD-(\d+)", code)
    o = db().execute("SELECT * FROM orders WHERE id=? AND user_id=?", (int(m[1]) - 1000, u["id"])).fetchone() if m else None
    if not o: return err("Order not found.", 404)
    if eff_status(o) != 0: return err("This order is already on its way, so it can't be cancelled.")
    db().execute("UPDATE orders SET status=-1 WHERE id=?", (o["id"],)); db().commit()      # points used on it go back automatically
    return jsonify(ok=True)

@app.post("/api/orders/<code>/return")
def return_order(code):
    u, bad = need_user()
    if bad: return bad
    f = request.get_json(silent=True) or {}
    m = re.fullmatch(r"ORD-(\d+)", code)
    o = db().execute("SELECT * FROM orders WHERE id=? AND user_id=?", (int(m[1]) - 1000, u["id"])).fetchone() if m else None
    if not o: return err("Order not found.", 404)
    if eff_status(o) != 2: return err("You can ask for a return or refund only after the order is completed.")
    if o["ret_status"]: return err("You already sent a return / refund request for this order.")
    if datetime.now(timezone.utc) - datetime.fromisoformat(o["created_at"]) > timedelta(days=RETURN_WINDOW_DAYS):
        return err(f"The {RETURN_WINDOW_DAYS}-day return / refund period for this order is over.")
    kind, reason = f.get("kind"), f.get("reason")
    if kind not in RETURN_KINDS: return err("Choose Refund only or Return and refund.")
    if reason not in RETURN_REASONS: return err("Choose a reason.")
    detail = str(f.get("detail") or "").strip()[:300]
    if reason == "Other" and len(detail) < 5: return err("Tell us a little about the problem.")
    db().execute("UPDATE orders SET ret_status='requested',ret_kind=?,ret_reason=?,ret_detail=?,ret_at=? WHERE id=?",
                 (kind, reason, detail or None, datetime.now(timezone.utc).isoformat(), o["id"])); db().commit()
    return jsonify(ok=True)

@app.get("/api/stats")
def stats():
    u, bad = need_user()
    if bad: return bad
    r = db().execute("SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM orders WHERE user_id=?", (u["id"],)).fetchone()
    return jsonify(orders=r["n"], spent=r["s"])

@app.get("/api/favorites")
def favs():
    u, bad = need_user()
    if bad: return bad
    return jsonify(ids=[r[0] for r in db().execute("SELECT item_id FROM favorites WHERE user_id=?", (u["id"],))])

@app.post("/api/favorites/<int:i>")
def toggle_fav(i):
    u, bad = need_user()
    if bad: return bad
    d = db()
    if d.execute("DELETE FROM favorites WHERE user_id=? AND item_id=?", (u["id"], i)).rowcount == 0:
        d.execute("INSERT OR IGNORE INTO favorites VALUES(?,?)", (u["id"], i))
    d.commit()
    return favs()

@app.get("/api/profile")
def get_profile():
    u, bad = need_user()
    if bad: return bad
    return jsonify(profile={"name": u["full_name"], "email": u["email"], "phone": u["phone"], "addr": u["address"], "u": u["username"]})

@app.put("/api/profile")
def put_profile():
    u, bad = need_user()
    if bad: return bad
    f = request.get_json(silent=True) or {}
    if any(not str(f.get(k, "")).strip() for k in ("name", "email", "phone", "addr")): return err("Fill in all fields.")
    if not re.fullmatch(r"09\d{9}", f["phone"]): return err("Enter an 11-digit phone number starting with 09.")
    db().execute("UPDATE users SET full_name=?,email=?,phone=?,address=? WHERE id=?",
                 (f["name"].strip(), f["email"].strip(), f["phone"], f["addr"].strip(), u["id"]))
    db().commit()
    return jsonify(user=user_dict(current_user()))

@app.post("/api/profile/avatar")
def set_avatar():
    """profile picture picked from the gallery. The browser crops it square and shrinks it to a small JPEG before sending."""
    u, bad = need_user()
    if bad: return bad
    m = re.fullmatch(r"data:image/jpeg;base64,([A-Za-z0-9+/=]+)", str((request.get_json(silent=True) or {}).get("image", "")))
    if not m: return err("Choose a photo from your gallery.")
    try: raw = base64.b64decode(m[1], validate=True)
    except Exception: return err("That photo could not be read.")
    if len(raw) > 600_000 or len(raw) < 200 or raw[:3] != b"\xff\xd8\xff" or b"\xff\xd9" not in raw[-64:]: return err("That photo is too big or not a valid image. Try another one.")
    os.makedirs(AVATAR_DIR, exist_ok=True)
    name = f"u{u['id']}-{int(time.time())}.jpg"
    with open(os.path.join(AVATAR_DIR, name), "wb") as fh: fh.write(raw)
    drop_avatar(u)
    db().execute("UPDATE users SET avatar=? WHERE id=?", ("/static/uploads/avatars/" + name, u["id"])); db().commit()
    return jsonify(user=user_dict(current_user()))

def drop_avatar(u):
    if u["avatar"]:
        try: os.remove(os.path.join(AVATAR_DIR, os.path.basename(u["avatar"])))
        except OSError: pass

@app.delete("/api/profile/avatar")
def remove_avatar():
    u, bad = need_user()
    if bad: return bad
    drop_avatar(u)
    db().execute("UPDATE users SET avatar=NULL WHERE id=?", (u["id"],)); db().commit()
    return jsonify(user=user_dict(current_user()))

# ================= ADMIN =================
def admin_only(fn):
    @wraps(fn)
    def w(*a, **k):
        u = current_user()
        if not u or u["role"] != "admin": return err("Admin access only.", 403)
        return fn(*a, **k)
    return w

@app.get("/admin")
def admin_dashboard_page(): return admin_page("admin_dashboard.html")

@app.get("/admin/orders")
def admin_orders_page(): return admin_page("admin_orders.html")

@app.get("/admin/menu")
def admin_menu_page(): return admin_page("admin_menu.html")

@app.get("/admin/stores")
def admin_stores_page(): return admin_page("admin_stores.html")

@app.get("/admin/customers")
def admin_customers_page(): return admin_page("admin_customers.html")

@app.get("/admin/feedback")
def admin_feedback_page(): return admin_page("admin_feedback.html")

def admin_orders_data(limit=None):
    rows = db().execute("SELECT o.*, u.full_name cname, u.phone cphone, u.address caddr, u.email cemail FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC" + (f" LIMIT {int(limit)}" if limit else "")).fetchall()
    ids = [r["id"] for r in rows]
    items = {}
    if ids:
        q = ",".join("?" * len(ids))
        for it in db().execute(f"SELECT order_id,name,price,qty,store,custom,note FROM order_items WHERE order_id IN ({q})", ids):
            items.setdefault(it["order_id"], []).append({"n": it["name"], "p": it["price"], "q": it["qty"], "s": it["store"], "cu": it["custom"], "no": it["note"]})
    return [{"num": o["id"], "id": f"ORD-{1000 + o['id']}", "customer": o["cname"], "phone": o["cphone"], "addr": o["addr"] or o["caddr"],
             "total": o["total"], "otype": o["otype"] or "Pickup", "method": o["method"], "promo": o["promo"], "discount": o["discount"] or 0,
             "date": o["created_at"], "status": eff_status(o), "items": items.get(o["id"], []),
             "tip": o["tip"] or 0, "pts": o["pts_used"] or 0, "sched": o["sched_at"], "fee": o["fee"] or 0,
             "rider": RIDERS[o["rider"]][0] if o["rider"] is not None else None, "ret": return_json(o)} for o in rows]

def safe_cell(v):                                   # stop spreadsheet formulas ("=...") from running when the CSV is opened
    v = "" if v is None else str(v)
    return "'" + v if v[:1] in ("=", "+", "-", "@") else v

@app.get("/api/admin/export.csv")
@admin_only
def admin_export():
    out = io.StringIO(); w = csv.writer(out)
    w.writerow(["Order", "Date (UTC)", "Customer", "Phone", "Type", "Address", "Stores", "Items", "Promo", "Promo discount", "Points used (P)", "Delivery fee", "Tip", "Total", "Payment", "Rider", "Scheduled for", "Status", "Return / refund"])
    label = {-1: "Cancelled", 0: "Preparing", 1: "Out / ready", 2: "Completed"}
    for o in admin_orders_data():
        w.writerow([safe_cell(x) for x in (o["id"], o["date"], o["customer"], o["phone"], o["otype"], o["addr"] if o["otype"] == "Delivery" else "",
            ", ".join(sorted({i["s"] for i in o["items"] if i["s"]})), "; ".join(f'{i["q"]} x {i["n"]}' for i in o["items"]), o["promo"], o["discount"],
            o["pts"] / 10, o["fee"], o["tip"], o["total"], o["method"], o["rider"], o["sched"], label[o["status"]], (o["ret"]["kind"] + ": " + o["ret"]["status"]) if o["ret"] else "")])
    return Response(out.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=padali-orders.csv"})

@app.get("/api/admin/summary")
@admin_only
def admin_summary():
    off = request.args.get("tz", 0, type=int)          # browser offset (minutes) so "today" matches the admin's clock
    orders = admin_orders_data()
    today = (datetime.now(timezone.utc) - timedelta(minutes=off)).date()
    days = {(today - timedelta(days=i)).isoformat(): {"orders": 0, "revenue": 0.0} for i in range(6, -1, -1)}
    k = {"orders": 0, "revenue": 0.0, "today_orders": 0, "today_revenue": 0.0, "active": 0, "cancelled": 0}
    by_status = {"0": 0, "1": 0, "2": 0, "-1": 0}; by_type = {}; by_method = {}
    for o in orders:
        by_status[str(o["status"])] += 1
        if o["status"] < 0:
            k["cancelled"] += 1; continue
        if o["ret"] and o["ret"]["status"] == "refunded": continue          # refunded money is not revenue
        d = (datetime.fromisoformat(o["date"]) - timedelta(minutes=off)).date().isoformat()
        k["orders"] += 1; k["revenue"] += o["total"]
        if o["status"] < 2: k["active"] += 1
        if d in days: days[d]["orders"] += 1; days[d]["revenue"] += o["total"]
        if d == today.isoformat(): k["today_orders"] += 1; k["today_revenue"] += o["total"]
        by_type[o["otype"]] = by_type.get(o["otype"], 0) + 1
        m = "E-Wallet" if o["method"] not in ("Cash", "Card") else o["method"]
        by_method[m] = by_method.get(m, 0) + 1
    k["customers"] = db().execute("SELECT COUNT(*) FROM users WHERE role IN ('user','owner')").fetchone()[0]
    k["menu_items"] = db().execute("SELECT COUNT(*) FROM menu_items").fetchone()[0]
    k["stores"] = db().execute("SELECT COUNT(*) FROM stores").fetchone()[0]
    k["unavailable"] = db().execute("SELECT COUNT(*) FROM menu_items WHERE available=0").fetchone()[0]
    k["avg"] = k["revenue"] / k["orders"] if k["orders"] else 0
    top = db().execute("SELECT oi.name n, SUM(oi.qty) q, SUM(oi.qty*oi.price) r FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE COALESCE(o.status,0)>=0 AND COALESCE(o.ret_status,'')<>'refunded' AND oi.custom=0 GROUP BY oi.name ORDER BY q DESC, r DESC LIMIT 5").fetchall()
    by_store = db().execute("""SELECT COALESCE(oi.store,'Other') n, SUM(oi.qty) q, SUM(oi.qty*oi.price) r FROM order_items oi JOIN orders o ON o.id=oi.order_id
        WHERE COALESCE(o.status,0)>=0 AND COALESCE(o.ret_status,'')<>'refunded' AND oi.custom=0 GROUP BY oi.store ORDER BY r DESC LIMIT 6""").fetchall()
    return jsonify(by_store=[dict(r) for r in by_store], kpi=k, days=[{"d": d, **v} for d, v in days.items()], by_status=by_status, by_type=by_type, by_method=by_method,
                   top=[dict(r) for r in top], recent=orders[:6])

@app.get("/api/admin/orders")
@admin_only
def admin_orders():
    return jsonify(orders=admin_orders_data(500))

@app.put("/api/admin/orders/<int:oid>/status")
@admin_only
def admin_set_status(oid):
    st = (request.get_json(silent=True) or {}).get("status")
    if st not in (-1, 0, 1, 2): return err("Invalid status.")
    d = db()
    if d.execute("UPDATE orders SET status=? WHERE id=?", (st, oid)).rowcount == 0: return err("Order not found.", 404)
    d.commit()
    return jsonify(ok=True)

@app.put("/api/admin/orders/<int:oid>/return")
@admin_only
def admin_return(oid):
    f = request.get_json(silent=True) or {}
    act, note = f.get("action"), str(f.get("note") or "").strip()[:200]
    o = db().execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
    if not o: return err("Order not found.", 404)
    cur = o["ret_status"]
    now = datetime.now(timezone.utc).isoformat()
    if act == "approve" and cur == "requested": q = ("approved", note or None, None)
    elif act == "reject" and cur in ("requested", "approved"):
        if len(note) < 3: return err("Write a short reason so the customer knows why.")
        q = ("rejected", note, now)
    elif act == "refund" and cur in ("requested", "approved"): q = ("refunded", note or None, now)
    else: return err("That action is not possible for this request.")
    db().execute("UPDATE orders SET ret_status=?,ret_note=?,ret_done_at=? WHERE id=?", (*q, oid)); db().commit()
    return jsonify(ok=True)

CATS = ("Meals", "Snacks", "Drinks", "Desserts")
ICON_BY_CAT = {"Meals": "utensils", "Snacks": "cookie", "Drinks": "cup-soda", "Desserts": "cake-slice"}

def menu_form(f):
    name = str(f.get("name", "")).strip(); cat = f.get("category"); image = str(f.get("image") or "").strip()
    try: price = round(float(f.get("price")), 2)
    except (TypeError, ValueError): price = 0
    if not name or len(name) > 60: return None, "Enter a dish name (up to 60 characters)."
    if cat not in CATS: return None, "Choose a category."
    if price <= 0 or price > 100000: return None, "Enter a price greater than 0."
    if not db().execute("SELECT 1 FROM stores WHERE id=?", (f.get("store_id"),)).fetchone(): return None, "Choose a store."
    if image and (len(image) > 400 or not re.match(r"(https?://|/static/)", image)): return None, "Photo link must start with http:// or https://"
    return {"name": name, "description": str(f.get("description", "")).strip()[:140], "price": price, "category": cat,
            "available": 1 if f.get("available", True) else 0, "store_id": int(f["store_id"]), "image": image or None}, None

@app.get("/api/admin/menu")
@admin_only
def admin_menu_list():
    rows = db().execute("SELECT m.id,m.name n,m.description d,m.price p,m.category c,m.emoji e,m.available a,m.store_id s,m.image im,st.name sn FROM menu_items m LEFT JOIN stores st ON st.id=m.store_id ORDER BY st.name,m.category,m.name").fetchall()
    items = []
    for r in rows:
        d = dict(r); d["img"] = img_for(d["n"], d["im"]); items.append(d)
    return jsonify(items=items, stores=[dict(r) for r in db().execute("SELECT id,name n FROM stores ORDER BY name")])

@app.post("/api/admin/menu")
@admin_only
def admin_menu_add():
    v, e = menu_form(request.get_json(silent=True) or {})
    if e: return err(e)
    db().execute("INSERT INTO menu_items(name,description,price,category,emoji,available,store_id,image) VALUES(?,?,?,?,?,?,?,?)",
                 (v["name"], v["description"], v["price"], v["category"], ICON_BY_CAT[v["category"]], v["available"], v["store_id"], v["image"]))
    db().commit()
    return jsonify(ok=True)

@app.put("/api/admin/menu/<int:i>")
@admin_only
def admin_menu_edit(i):
    f = request.get_json(silent=True) or {}
    if set(f) == {"available"}:                                   # quick on/off switch
        db().execute("UPDATE menu_items SET available=? WHERE id=?", (1 if f["available"] else 0, i)); db().commit()
        return jsonify(ok=True)
    v, e = menu_form(f)
    if e: return err(e)
    if db().execute("UPDATE menu_items SET name=?,description=?,price=?,category=?,available=?,store_id=?,image=? WHERE id=?",
                    (v["name"], v["description"], v["price"], v["category"], v["available"], v["store_id"], v["image"], i)).rowcount == 0: return err("Dish not found.", 404)
    db().commit()
    return jsonify(ok=True)

@app.delete("/api/admin/menu/<int:i>")
@admin_only
def admin_menu_delete(i):
    d = db()
    d.execute("DELETE FROM favorites WHERE item_id=?", (i,))
    d.execute("DELETE FROM menu_items WHERE id=?", (i,))
    d.commit()
    return jsonify(ok=True)

def store_form(f):
    g = lambda k, n: str(f.get(k) or "").strip()[:n]
    name = g("name", 60)
    if not name: return None, "Enter a store name."
    try: lat, lng = float(f.get("lat")), float(f.get("lng"))
    except (TypeError, ValueError): lat = lng = None
    if lat is not None and km_between((lat, lng), AREA_CENTER) > 30: return None, "That map pin is too far from the town."
    return {"name": name, "cuisine": g("cuisine", 60), "description": g("description", 140), "address": g("address", 80),
            "eta": g("eta", 20) or "20-30 min", "is_open": 1 if f.get("open", True) else 0,
            "lat": lat, "lng": lng}, None

@app.get("/api/admin/stores")
@admin_only
def admin_stores():
    rows = db().execute("""SELECT s.id,s.name n,s.cuisine cu,s.description d,s.address a,s.eta,s.is_open open,s.lat,s.lng,
        (SELECT COUNT(*) FROM menu_items m WHERE m.store_id=s.id) dishes,
        (SELECT ROUND(COALESCE(AVG(rating),0),1) FROM reviews r WHERE r.store_id=s.id) rating,
        (SELECT COUNT(*) FROM reviews r WHERE r.store_id=s.id) rc,
        (SELECT COALESCE(SUM(oi.qty*oi.price),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.store=s.name AND COALESCE(o.status,0)>=0) sales,
        (SELECT full_name FROM users WHERE id=s.owner_id) owner
        FROM stores s ORDER BY s.id""").fetchall()
    return jsonify(stores=[dict(r) for r in rows])

@app.post("/api/admin/stores")
@admin_only
def admin_store_add():
    v, e = store_form(request.get_json(silent=True) or {})
    if e: return err(e)
    db().execute("INSERT INTO stores(name,cuisine,description,address,eta,is_open,lat,lng) VALUES(?,?,?,?,?,?,?,?)", tuple(v.values()))
    db().commit()
    return jsonify(ok=True)

@app.put("/api/admin/stores/<int:i>")
@admin_only
def admin_store_edit(i):
    f = request.get_json(silent=True) or {}
    if set(f) == {"open"}:                                       # quick open / closed switch
        db().execute("UPDATE stores SET is_open=? WHERE id=?", (1 if f["open"] else 0, i)); db().commit()
        return jsonify(ok=True)
    v, e = store_form(f)
    if e: return err(e)
    if db().execute("UPDATE stores SET name=?,cuisine=?,description=?,address=?,eta=?,is_open=?,lat=?,lng=? WHERE id=?", (*v.values(), i)).rowcount == 0: return err("Store not found.", 404)
    db().commit()
    return jsonify(ok=True)

@app.delete("/api/admin/stores/<int:i>")
@admin_only
def admin_store_delete(i):
    if db().execute("SELECT 1 FROM menu_items WHERE store_id=?", (i,)).fetchone(): return err("This store still has dishes. Delete or move them first.")
    st = db().execute("SELECT owner_id FROM stores WHERE id=?", (i,)).fetchone()
    db().execute("DELETE FROM reviews WHERE store_id=?", (i,)); db().execute("DELETE FROM stores WHERE id=?", (i,))
    if st and st["owner_id"]:                                    # the owner goes back to a normal customer account and may apply again
        db().execute("UPDATE users SET role='user' WHERE id=? AND role='owner'", (st["owner_id"],))
        db().execute("UPDATE store_applications SET status='closed',decided_at=? WHERE store_id=?", (now_iso(), i))
    db().commit()
    return jsonify(ok=True)

@app.get("/api/admin/customers")
@admin_only
def admin_customers():
    rows = db().execute("""SELECT u.id,u.full_name n,u.username u,u.email e,u.phone p,u.address a,u.avatar av,COUNT(o.id) orders,
        COALESCE(SUM(CASE WHEN COALESCE(o.status,0)>=0 AND COALESCE(o.ret_status,'')<>'refunded' THEN o.total END),0) spent, MAX(o.created_at) last
        FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.role IN ('user','owner') GROUP BY u.id ORDER BY spent DESC, u.id DESC""").fetchall()
    return jsonify(customers=[dict(r) for r in rows])


FB = {"store": ("reviews", "store_id"), "food": ("food_reviews", "store_id"), "delivery": ("delivery_reviews", "store_id")}

@app.get("/api/admin/feedback")
@admin_only
def admin_feedback():
    """every comment, split in the three kinds (store, food, delivery time), plus numbers that point at problems"""
    off = request.args.get("tz", 0, type=int)
    d = db(); out = {}; summ = {}
    out["store"] = [dict(r) for r in d.execute("SELECT r.id,r.name,r.rating,r.comment,r.reply,r.created_at d,s.name target,u.avatar av FROM reviews r JOIN stores s ON s.id=r.store_id LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 100")]
    out["food"] = [dict(r) for r in d.execute("SELECT r.id,r.name,r.rating,r.comment,r.reply,r.created_at d,r.item_name||' · '||COALESCE(s.name,'') target,u.avatar av FROM food_reviews r LEFT JOIN stores s ON s.id=r.store_id LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 100")]
    out["delivery"] = [dict(r) for r in d.execute("SELECT r.id,r.name,r.rating,r.comment,r.reply,r.created_at d,r.speed,COALESCE(s.name,(SELECT GROUP_CONCAT(DISTINCT oi.store) FROM order_items oi WHERE oi.order_id=r.order_id)) target,u.avatar av FROM delivery_reviews r LEFT JOIN stores s ON s.id=r.store_id LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 100")]
    for k, (t, _) in FB.items():
        r = d.execute(f"SELECT COUNT(*) n, ROUND(COALESCE(AVG(rating),0),1) a, SUM(CASE WHEN rating<=2 THEN 1 ELSE 0 END) low, SUM(CASE WHEN reply IS NULL OR reply='' THEN 1 ELSE 0 END) open FROM {t}").fetchone()
        summ[k] = {"n": r["n"], "avg": r["a"], "low": r["low"] or 0, "open": r["open"] or 0}
    tags = {r[0]: r[1] for r in d.execute("SELECT speed, COUNT(*) FROM delivery_reviews GROUP BY speed")}
    worst = [dict(r) for r in d.execute("""SELECT f.item_name n, s.name s, ROUND(AVG(f.rating),1) a, COUNT(*) c FROM food_reviews f LEFT JOIN stores s ON s.id=f.store_id
        GROUP BY f.item_name,f.store_id HAVING c>=2 ORDER BY a ASC, c DESC LIMIT 5""")]
    best = [dict(r) for r in d.execute("""SELECT f.item_name n, s.name s, ROUND(AVG(f.rating),1) a, COUNT(*) c FROM food_reviews f LEFT JOIN stores s ON s.id=f.store_id
        GROUP BY f.item_name,f.store_id HAVING c>=2 ORDER BY a DESC, c DESC LIMIT 5""")]
    heat = [[0] * 24 for _ in range(7)]
    for o in d.execute("SELECT created_at FROM orders WHERE COALESCE(status,0)>=0"):
        t = datetime.fromisoformat(o[0]) - timedelta(minutes=off); heat[t.weekday()][t.hour] += 1
    return jsonify(feedback=out, summary=summ, tags=tags, worst=worst, best=best, heat=heat)

@app.put("/api/admin/feedback/<kind>/<int:i>/reply")
@admin_only
def admin_feedback_reply(kind, i):
    if kind not in FB: return err("Unknown comment type.", 404)
    text = str((request.get_json(silent=True) or {}).get("reply") or "").strip()[:240]
    db().execute(f"UPDATE {FB[kind][0]} SET reply=? WHERE id=?", (text or None, i)); db().commit()
    return jsonify(ok=True)

@app.delete("/api/admin/feedback/<kind>/<int:i>")
@admin_only
def admin_feedback_delete(kind, i):
    if kind not in FB: return err("Unknown comment type.", 404)
    db().execute(f"DELETE FROM {FB[kind][0]} WHERE id=?", (i,)); db().commit()
    return jsonify(ok=True)

# =====================================================================================================================
# STORE APPLICATIONS + STORE OWNER  (customer applies  ->  admin approves / rejects  ->  the account becomes a store owner)
#   customer : /sell  (apply, follow the status)            API  /api/store-application
#   admin    : /admin/applications  (review, approve, reject) API  /api/admin/applications
#   owner    : /owner  /owner/store  /owner/menu  /owner/orders  /owner/feedback   API  /api/owner/*
# The 8 sample stores have no owner (owner_id is empty) and keep being managed by the admin, exactly as before.
# =====================================================================================================================
def now_iso(): return datetime.now(timezone.utc).isoformat()

def sell_page_guard():
    u = current_user()
    if not u: return redirect("/login")
    if u["role"] == "admin": return redirect("/admin")
    if u["role"] == "owner": return redirect("/owner")
    return render_template("sell.html")

@app.get("/sell")
def sell_page(): return sell_page_guard()

def owner_page(tpl):
    u = current_user()
    if not u: return redirect("/login")
    if u["role"] == "admin": return redirect("/admin")
    if u["role"] != "owner": return redirect("/sell")
    return render_template(tpl)

@app.get("/owner")
def owner_dashboard_page(): return owner_page("owner_dashboard.html")

@app.get("/owner/store")
def owner_store_page(): return owner_page("owner_store.html")

@app.get("/owner/menu")
def owner_menu_page(): return owner_page("owner_menu.html")

@app.get("/owner/orders")
def owner_orders_page(): return owner_page("owner_orders.html")

@app.get("/owner/feedback")
def owner_feedback_page(): return owner_page("owner_feedback.html")

@app.get("/admin/applications")
def admin_applications_page(): return admin_page("admin_verification.html")

def owner_only(fn):
    @wraps(fn)
    def w(*a, **k):
        u = current_user()
        if not u: return err("Please log in first.", 401)
        if u["role"] != "owner": return err("Store owners only.", 403)
        s = db().execute("SELECT * FROM stores WHERE owner_id=?", (u["id"],)).fetchone()
        if not s: return err("You do not have a store yet.", 403)
        g.store = s
        return fn(*a, **k)
    return w

def app_form(f):
    """check what the customer typed in the store application"""
    t = lambda k, n: str(f.get(k) or "").strip()[:n]
    name, cuisine, desc, addr, phone, eta, permit = t("name", 60), t("cuisine", 60), t("description", 140), t("address", 80), t("phone", 11), t("eta", 20), t("permit", 40)
    if len(name) < 3: return None, "Enter your store name (at least 3 characters)."
    if len(cuisine) < 3: return None, "Tell us what kind of food you sell (example: Filipino · Grill)."
    if len(desc) < 10: return None, "Describe your store in at least 10 characters."
    if len(addr) < 5: return None, "Enter the store address."
    if not re.fullmatch(r"09\d{9}", phone): return None, "Enter an 11-digit store contact number starting with 09."
    try: lat, lng = float(f.get("lat")), float(f.get("lng"))
    except (TypeError, ValueError): return None, "Tap the map to place your store pin."
    if not (-90 <= lat <= 90 and -180 <= lng <= 180): return None, "That map pin is not valid."
    if km_between((lat, lng), AREA_CENTER) > DELIVERY_RADIUS_KM: return None, f"Your store pin is outside our delivery area ({AREA})."
    return {"name": name, "cuisine": cuisine, "description": desc, "address": addr, "phone": phone, "eta": eta or "20-30 min", "permit": permit or None, "lat": lat, "lng": lng}, None

def name_taken(name, skip_app=None):
    d = db()
    if d.execute("SELECT 1 FROM stores WHERE lower(name)=lower(?)", (name,)).fetchone(): return True
    return bool(d.execute("SELECT 1 FROM store_applications WHERE lower(name)=lower(?) AND status='pending' AND id<>?", (name, skip_app or 0)).fetchone())

def app_json(a):
    return {"id": a["id"], "name": a["name"], "cuisine": a["cuisine"], "description": a["description"], "address": a["address"], "phone": a["phone"],
            "eta": a["eta"], "permit": a["permit"], "lat": a["lat"], "lng": a["lng"], "status": a["status"], "reason": a["reason"],
            "created_at": a["created_at"], "decided_at": a["decided_at"]}

@app.get("/api/store-application")
def my_application():
    u, bad = need_user()
    if bad: return bad
    rows = db().execute("SELECT * FROM store_applications WHERE user_id=? ORDER BY id DESC", (u["id"],)).fetchall()
    return jsonify(role=u["role"], latest=app_json(rows[0]) if rows else None, history=[app_json(r) for r in rows[1:6]])

@app.post("/api/store-application")
def apply_store():
    u, bad = need_user()
    if bad: return bad
    if u["role"] == "owner": return err("You already own a store on Padali.", 409)
    if u["role"] != "user": return err("Only customer accounts can apply for a store.", 403)
    if db().execute("SELECT 1 FROM store_applications WHERE user_id=? AND status='pending'", (u["id"],)).fetchone():
        return err("You already have an application waiting for review.", 409)
    v, e = app_form(request.get_json(silent=True) or {})
    if e: return err(e)
    if name_taken(v["name"]): return err("A store with that name already exists. Choose a different store name.", 409)
    db().execute("INSERT INTO store_applications(user_id,name,cuisine,description,address,phone,eta,permit,lat,lng,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?)",
                 (u["id"], v["name"], v["cuisine"], v["description"], v["address"], v["phone"], v["eta"], v["permit"], v["lat"], v["lng"], now_iso()))
    db().commit()
    return jsonify(ok=True)

@app.delete("/api/store-application")
def withdraw_application():
    u, bad = need_user()
    if bad: return bad
    r = db().execute("UPDATE store_applications SET status='withdrawn',decided_at=? WHERE user_id=? AND status='pending'", (now_iso(), u["id"]))
    db().commit()
    return jsonify(ok=True) if r.rowcount else err("There is no pending application to withdraw.", 404)

# ---- admin: review the applications ----
def applicant_info(uid):
    d = db(); u = d.execute("SELECT id,full_name,username,email,phone,address,avatar FROM users WHERE id=?", (uid,)).fetchone()
    done = spent = 0
    for o in d.execute("SELECT * FROM orders WHERE user_id=?", (uid,)):
        if eff_status(o) == 2 and o["ret_status"] != "refunded": done += 1; spent += o["total"] or 0
    return {"id": u["id"], "name": u["full_name"], "username": u["username"], "email": u["email"], "phone": u["phone"], "address": u["address"], "av": u["avatar"],
            "orders": done, "spent": spent} if u else None

def app_checks(a):
    """quick eligibility hints for the admin (the admin still makes the decision)"""
    km = km_between((a["lat"], a["lng"]), AREA_CENTER)
    clash = bool(db().execute("SELECT 1 FROM stores WHERE lower(name)=lower(?)", (a["name"],)).fetchone())
    other = bool(db().execute("SELECT 1 FROM store_applications WHERE lower(name)=lower(?) AND status='pending' AND id<>?", (a["name"], a["id"])).fetchone())
    return [{"ok": not clash and not other, "t": "Store name is not used by another store" if not (clash or other) else "Another store or application already uses this name"},
            {"ok": km <= DELIVERY_RADIUS_KM, "t": f"Store pin is {km:.1f} km from the town center (inside the delivery area)" if km <= DELIVERY_RADIUS_KM else f"Store pin is {km:.1f} km away (outside the delivery area)"},
            {"ok": bool(a["permit"]), "t": "Business permit / registration number given" if a["permit"] else "No permit number given (optional)"},
            {"ok": len(a["description"] or "") >= 30, "t": "Description is clear" if len(a["description"] or "") >= 30 else "Description is very short"}]

@app.get("/api/admin/applications")
@admin_only
def admin_applications():
    rows = db().execute("SELECT * FROM store_applications ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, id DESC").fetchall()
    out = []
    for a in rows:
        d = app_json(a); d["applicant"] = applicant_info(a["user_id"]); d["checks"] = app_checks(a) if a["status"] == "pending" else []; d["store_id"] = a["store_id"]; out.append(d)
    counts = {k: 0 for k in ("pending", "approved", "rejected", "other")}
    for a in rows: counts[a["status"] if a["status"] in counts else "other"] += 1
    return jsonify(applications=out, counts=counts, center={"lat": AREA_CENTER[0], "lng": AREA_CENTER[1]})

def pending_app(i):
    a = db().execute("SELECT * FROM store_applications WHERE id=?", (i,)).fetchone()
    if not a: return None, err("Application not found.", 404)
    if a["status"] != "pending": return None, err("This application was already decided.", 409)
    return a, None

@app.post("/api/admin/applications/<int:i>/approve")
@admin_only
def admin_application_approve(i):
    a, e = pending_app(i)
    if e: return e
    d = db(); u = d.execute("SELECT * FROM users WHERE id=?", (a["user_id"],)).fetchone()
    if not u or u["role"] != "user": return err("This account is no longer a customer account, so it can not become a store owner.", 409)
    if d.execute("SELECT 1 FROM stores WHERE lower(name)=lower(?)", (a["name"],)).fetchone(): return err("A store with this name already exists. Reject this application and ask the applicant to choose another name.", 409)
    sid = d.execute("INSERT INTO stores(name,cuisine,description,address,eta,is_open,lat,lng,owner_id,phone,permit) VALUES(?,?,?,?,?,1,?,?,?,?,?)",
                    (a["name"], a["cuisine"], a["description"], a["address"], a["eta"], a["lat"], a["lng"], u["id"], a["phone"], a["permit"])).lastrowid
    d.execute("UPDATE users SET role='owner' WHERE id=?", (u["id"],))
    d.execute("UPDATE store_applications SET status='approved',decided_at=?,store_id=?,reason=NULL WHERE id=?", (now_iso(), sid, i))
    d.commit()
    return jsonify(ok=True)

@app.post("/api/admin/applications/<int:i>/reject")
@admin_only
def admin_application_reject(i):
    a, e = pending_app(i)
    if e: return e
    why = str((request.get_json(silent=True) or {}).get("reason") or "").strip()[:300]
    if len(why) < 5: return err("Write the reason (at least 5 characters). The applicant will read it.")
    db().execute("UPDATE store_applications SET status='rejected',decided_at=?,reason=? WHERE id=?", (now_iso(), why, i)); db().commit()
    return jsonify(ok=True)

# ---- owner: the store, the menu, the orders and the feedback of the owner's OWN store only ----
def valid_order(o): return eff_status(o) >= 0 and o["ret_status"] != "refunded"

def owner_lines(s):
    """every order line of this store: (order row, item name, price, qty)"""
    return db().execute("""SELECT o.*, oi.name iname, oi.price iprice, oi.qty iqty FROM order_items oi JOIN orders o ON o.id=oi.order_id
        WHERE oi.store=? AND oi.custom=0 ORDER BY o.id DESC""", (s["name"],)).fetchall()

def store_json(s):
    r = db().execute("SELECT ROUND(COALESCE(AVG(rating),0),1) a, COUNT(*) n FROM reviews WHERE store_id=?", (s["id"],)).fetchone()
    a = db().execute("SELECT created_at FROM store_applications WHERE store_id=? ORDER BY id DESC", (s["id"],)).fetchone()
    return {"id": s["id"], "name": s["name"], "cuisine": s["cuisine"], "description": s["description"], "address": s["address"], "eta": s["eta"], "phone": s["phone"],
            "permit": s["permit"], "lat": s["lat"], "lng": s["lng"], "open": bool(s["is_open"]), "rating": r["a"], "rc": r["n"], "since": a["created_at"] if a else None}

@app.get("/api/owner/store")
@owner_only
def owner_store(): return jsonify(store=store_json(g.store))

@app.put("/api/owner/store")
@owner_only
def owner_store_edit():
    f = request.get_json(silent=True) or {}; s = g.store
    if set(f) == {"open"}:                                       # quick open / closed switch
        db().execute("UPDATE stores SET is_open=? WHERE id=?", (1 if f["open"] else 0, s["id"])); db().commit()
        return jsonify(ok=True)
    v, e = app_form({**f, "name": s["name"]})
    if e: return err(e)
    db().execute("UPDATE stores SET cuisine=?,description=?,address=?,eta=?,phone=?,permit=?,lat=?,lng=? WHERE id=?",        # the store name is locked (orders and comments are linked to it)
                 (v["cuisine"], v["description"], v["address"], v["eta"], v["phone"], v["permit"], v["lat"], v["lng"], s["id"])); db().commit()
    return jsonify(ok=True)

@app.get("/api/owner/menu")
@owner_only
def owner_menu_list():
    rows = db().execute("SELECT id,name n,description d,price p,category c,emoji e,available a,image im FROM menu_items WHERE store_id=? ORDER BY category,name", (g.store["id"],)).fetchall()
    items = []
    for r in rows:
        d = dict(r); d["img"] = img_for(d["n"], d["im"]); items.append(d)
    return jsonify(items=items)

def dish_name_used(sid, name, skip=0):
    return bool(db().execute("SELECT 1 FROM menu_items WHERE store_id=? AND lower(name)=lower(?) AND id<>?", (sid, name, skip)).fetchone())

@app.post("/api/owner/menu")
@owner_only
def owner_menu_add():
    s = g.store; v, e = menu_form({**(request.get_json(silent=True) or {}), "store_id": s["id"]})     # the store always comes from the logged-in owner, never from the request
    if e: return err(e)
    if dish_name_used(s["id"], v["name"]): return err("You already have a dish with that name.")
    db().execute("INSERT INTO menu_items(name,description,price,category,emoji,available,store_id,image) VALUES(?,?,?,?,?,?,?,?)",
                 (v["name"], v["description"], v["price"], v["category"], ICON_BY_CAT[v["category"]], v["available"], s["id"], v["image"]))
    db().commit()
    return jsonify(ok=True)

def own_dish(i):
    return db().execute("SELECT * FROM menu_items WHERE id=? AND store_id=?", (i, g.store["id"])).fetchone()

@app.put("/api/owner/menu/<int:i>")
@owner_only
def owner_menu_edit(i):
    old = own_dish(i)
    if not old: return err("Dish not found.", 404)
    f = request.get_json(silent=True) or {}
    if set(f) == {"available"}:
        db().execute("UPDATE menu_items SET available=? WHERE id=?", (1 if f["available"] else 0, i)); db().commit()
        return jsonify(ok=True)
    v, e = menu_form({**f, "store_id": g.store["id"]})
    if e: return err(e)
    if dish_name_used(g.store["id"], v["name"], i): return err("You already have a dish with that name.")
    db().execute("UPDATE menu_items SET name=?,description=?,price=?,category=?,available=?,image=? WHERE id=?", (v["name"], v["description"], v["price"], v["category"], v["available"], v["image"], i))
    if v["name"] != old["name"]: db().execute("UPDATE food_reviews SET item_name=? WHERE item_name=? AND store_id=?", (v["name"], old["name"], g.store["id"]))   # comments follow the new name
    db().commit()
    return jsonify(ok=True)

@app.delete("/api/owner/menu/<int:i>")
@owner_only
def owner_menu_delete(i):
    if not own_dish(i): return err("Dish not found.", 404)
    db().execute("DELETE FROM favorites WHERE item_id=?", (i,)); db().execute("DELETE FROM menu_items WHERE id=?", (i,)); db().commit()
    return jsonify(ok=True)

@app.get("/api/owner/orders")
@owner_only
def owner_orders():
    s = g.store; by = {}
    for r in owner_lines(s):
        o = by.setdefault(r["id"], {"row": r, "items": []}); o["items"].append({"n": r["iname"], "p": r["iprice"], "q": r["iqty"]})
    names = {r["id"]: r["full_name"] for r in db().execute("SELECT id,full_name FROM users")}
    out = []
    for oid, o in by.items():
        r = o["row"]
        out.append({"id": f"ORD-{1000 + oid}", "date": r["created_at"], "sched": r["sched_at"], "status": eff_status(r), "otype": r["otype"] or "Delivery",
                    "customer": reviewer_name({"full_name": names.get(r["user_id"], "Customer")}), "items": o["items"], "mine": sum(i["p"] * i["q"] for i in o["items"]),
                    "ret": r["ret_status"], "other": db().execute("SELECT COUNT(DISTINCT store) FROM order_items WHERE order_id=?", (oid,)).fetchone()[0] > 1})
    return jsonify(orders=out[:200])

@app.get("/api/owner/summary")
@owner_only
def owner_summary():
    s = g.store; off = request.args.get("tz", 0, type=int); d = db()
    today = (datetime.now(timezone.utc) - timedelta(minutes=off)).date()
    days = {(today - timedelta(days=i)).isoformat(): {"orders": 0, "revenue": 0.0} for i in range(6, -1, -1)}
    k = {"orders": 0, "sales": 0.0, "today_orders": 0, "today_sales": 0.0, "active": 0}; seen = set(); sold = {}; recent = {}
    for r in owner_lines(s):
        mine = r["iprice"] * r["iqty"]
        if r["id"] not in recent and len(recent) < 6: recent[r["id"]] = {"id": f"ORD-{1000 + r['id']}", "date": r["created_at"], "status": eff_status(r), "mine": 0.0, "items": []}
        if r["id"] in recent: recent[r["id"]]["mine"] += mine; recent[r["id"]]["items"].append({"n": r["iname"], "q": r["iqty"]})
        if not valid_order(r): continue
        day = (datetime.fromisoformat(r["created_at"]) - timedelta(minutes=off)).date().isoformat()
        k["sales"] += mine; sold[r["iname"]] = sold.get(r["iname"], [0, 0.0]); sold[r["iname"]][0] += r["iqty"]; sold[r["iname"]][1] += mine
        if day in days: days[day]["revenue"] += mine
        if day == today.isoformat(): k["today_sales"] += mine
        if r["id"] not in seen:
            seen.add(r["id"]); k["orders"] += 1
            if eff_status(r) < 2: k["active"] += 1
            if day in days: days[day]["orders"] += 1
            if day == today.isoformat(): k["today_orders"] += 1
    n = d.execute("SELECT COUNT(*) FROM menu_items WHERE store_id=?", (s["id"],)).fetchone()[0]
    off_n = d.execute("SELECT COUNT(*) FROM menu_items WHERE store_id=? AND available=0", (s["id"],)).fetchone()[0]
    rc = d.execute("SELECT COUNT(*) FROM reviews WHERE store_id=?", (s["id"],)).fetchone()[0]
    dist = {str(i): 0 for i in range(1, 6)}
    for r in d.execute("SELECT rating, COUNT(*) c FROM reviews WHERE store_id=? GROUP BY rating", (s["id"],)): dist[str(r["rating"])] = r["c"]
    unanswered = sum(d.execute(f"SELECT COUNT(*) FROM {t} WHERE store_id=? AND (reply IS NULL OR reply='')", (s["id"],)).fetchone()[0] for t in ("reviews", "food_reviews"))
    unanswered += d.execute(f"SELECT COUNT(*) FROM delivery_reviews r WHERE {DEL_R} AND (r.reply IS NULL OR r.reply='')", (s["id"], s["name"])).fetchone()[0]
    top = sorted(sold.items(), key=lambda x: (-x[1][0], -x[1][1]))[:5]
    k.update(dishes=n, unavailable=off_n, rating=store_json(s)["rating"], rc=rc, unanswered=unanswered, avg=(k["sales"] / k["orders"]) if k["orders"] else 0)
    tips = []
    if n == 0: tips.append("Your menu is empty. Add your first dishes so customers can order.")
    elif n < 3: tips.append("Add a few more dishes. Stores with 3 or more dishes look more complete.")
    if n and off_n == n: tips.append("All your dishes are switched off, so customers can not order.")
    if not s["is_open"]: tips.append("Your store is closed. Switch it on in My store when you are ready for orders.")
    if unanswered: tips.append(f"{unanswered} customer comment{'s are' if unanswered > 1 else ' is'} waiting for your reply.")
    return jsonify(store=store_json(s), kpi=k, days=[{"d": x, **v} for x, v in days.items()], top=[{"n": a, "q": b[0], "r": b[1]} for a, b in top], dist=dist, tips=tips, recent=list(recent.values()))

DEL_R = "(r.store_id=? OR r.order_id IN (SELECT oi.order_id FROM order_items oi WHERE oi.store=?))"
OFB = {"store": "reviews", "food": "food_reviews", "delivery": "delivery_reviews"}

@app.get("/api/owner/feedback")
@owner_only
def owner_feedback():
    s = g.store; d = db(); off = request.args.get("tz", 0, type=int); out = {}; summ = {}
    out["store"] = [dict(r) for r in d.execute("SELECT r.id,r.name,r.rating,r.comment,r.reply,r.created_at d,u.avatar av FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.store_id=? ORDER BY r.id DESC LIMIT 100", (s["id"],))]
    out["food"] = [dict(r) for r in d.execute("SELECT r.id,r.name,r.rating,r.comment,r.reply,r.created_at d,r.item_name target,u.avatar av FROM food_reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.store_id=? ORDER BY r.id DESC LIMIT 100", (s["id"],))]
    out["delivery"] = [dict(r) for r in d.execute(f"SELECT r.id,r.name,r.rating,r.comment,r.reply,r.created_at d,r.speed,u.avatar av FROM delivery_reviews r LEFT JOIN users u ON u.id=r.user_id WHERE {DEL_R} ORDER BY r.id DESC LIMIT 100", (s["id"], s["name"]))]
    for k, rows in out.items():
        n = len(rows); summ[k] = {"n": n, "avg": round(sum(r["rating"] for r in rows) / n, 1) if n else 0, "low": sum(1 for r in rows if r["rating"] <= 2), "open": sum(1 for r in rows if not r["reply"])}
    tags = {}
    for r in out["delivery"]: tags[r["speed"]] = tags.get(r["speed"], 0) + 1
    dish = {}
    for r in out["food"]: dish.setdefault(r["target"], []).append(r["rating"])
    rank = [{"n": n, "s": s["name"], "a": round(sum(v) / len(v), 1), "c": len(v)} for n, v in dish.items() if len(v) >= 2]
    heat = [[0] * 24 for _ in range(7)]; seen = set()
    for r in owner_lines(s):
        if r["id"] in seen or not valid_order(r): continue
        seen.add(r["id"]); t = datetime.fromisoformat(r["created_at"]) - timedelta(minutes=off); heat[t.weekday()][t.hour] += 1
    return jsonify(feedback=out, summary=summ, tags=tags, worst=sorted(rank, key=lambda x: (x["a"], -x["c"]))[:5], best=sorted(rank, key=lambda x: (-x["a"], -x["c"]))[:5], heat=heat)

@app.put("/api/owner/feedback/<kind>/<int:i>/reply")
@owner_only
def owner_feedback_reply(kind, i):
    if kind not in OFB: return err("Unknown comment type.", 404)
    s = g.store; text = str((request.get_json(silent=True) or {}).get("reply") or "").strip()[:240]
    if kind == "delivery": r = db().execute(f"UPDATE delivery_reviews SET reply=? WHERE id=? AND (store_id=? OR order_id IN (SELECT oi.order_id FROM order_items oi WHERE oi.store=?))", (text or None, i, s["id"], s["name"]))
    else: r = db().execute(f"UPDATE {OFB[kind]} SET reply=? WHERE id=? AND store_id=?", (text or None, i, s["id"]))      # only comments about this owner's own store
    db().commit()
    return jsonify(ok=True) if r.rowcount else err("Comment not found.", 404)

@app.get("/static/uploads/avatars/<path:name>")
def avatar_file(name):
    from flask import send_from_directory
    return send_from_directory(AVATAR_DIR, name)

init_db()
if not os.environ.get("PADALI_NO_PHOTOS") and not ON_VERCEL:      # download missing dish photos in the background (needs internet, skips quietly if offline)
    threading.Thread(target=photos.download_missing, args=(sorted({x[1] for x in SEED}),), daemon=True).start()
if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
