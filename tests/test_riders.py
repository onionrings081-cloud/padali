"""Rider accounts, rider portal, store logo and the removed admin feedback page.  Run from the project folder:   python -m unittest tests.test_riders -v
Uses a COPY of oms.db (made below), so your real data is never touched."""
import base64, os, shutil, sys, tempfile, unittest
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
TMP = tempfile.mkdtemp()
os.environ["PADALI_DB"] = os.path.join(TMP, "test.db"); os.environ["PADALI_NO_PHOTOS"] = "1"
shutil.copy(os.path.join(HERE, "oms.db"), os.environ["PADALI_DB"])
import app as padali
padali.LOGO_DIR = os.path.join(TMP, "logos")

def client(): return padali.app.test_client()
def J(r): return r.get_json(silent=True) or {}
def reg(c, u):
    return c.post("/api/register", json={"name": u.title() + " Test", "email": u + "@x.com", "phone": "09123456789", "addr": "Somewhere 1", "u": u, "p": "secret12"})
def login(c, u, p): return c.post("/api/login", json={"u": u, "p": p})
RIDER = {"name": "Juan Rider", "phone": "09171234567", "vehicle": "Motorcycle", "plate": "abc 123", "u": "rider_juan", "p": "rider123"}
APP = {"name": "Logo Grill", "cuisine": "Filipino · Grill", "description": "Charcoal grilled food for everyone.", "address": "Rizal St", "phone": "09171234567", "lat": 9.3356, "lng": 125.9769}
# a tiny valid-looking JPEG (start + end markers, padded) is enough for the server check
JPG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 400 + b"\xff\xd9").decode()
def order(c, dish_id, **extra):
    return c.post("/api/orders", json={"items": [{"id": dish_id, "q": 1}], "otype": "Delivery", "addr": "Poblacion, Cantilan", "method": "Cash", "details": {"cash": 5000}, **extra})

class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = client(); assert login(cls.admin, "admin", "123456").status_code == 200
        cls.cus = client(); reg(cls.cus, "cust_r"); cls.anon = client()
        cls.dish = padali.sqlite3.connect(padali.DB).execute("SELECT id FROM menu_items WHERE available=1 AND store_id IN (SELECT id FROM stores WHERE owner_id IS NULL AND is_open=1) LIMIT 1").fetchone()[0]

    def test_01_only_admin_creates_riders(self):
        for c in (self.anon, self.cus):
            self.assertIn(c.post("/api/admin/riders", json=RIDER).status_code, (401, 403))
            self.assertIn(c.get("/api/admin/riders").status_code, (401, 403))
        # the public register page can not make a rider, even if a role is sent
        r = client().post("/api/register", json={"name": "Sneaky Rider", "email": "s@x.com", "phone": "09123456789", "addr": "x", "u": "sneaky", "p": "secret12", "role": "rider", "account": "rider"})
        self.assertEqual(J(r)["user"]["role"], "user")
    def test_02_create_and_validate(self):
        for bad in ({"name": "x"}, {"phone": "123"}, {"vehicle": "Jet"}, {"u": "a b"}, {"p": "123"}):
            self.assertEqual(self.admin.post("/api/admin/riders", json={**RIDER, **bad}).status_code, 400, bad)
        self.assertEqual(self.admin.post("/api/admin/riders", json=RIDER).status_code, 200)
        self.assertEqual(self.admin.post("/api/admin/riders", json=RIDER).status_code, 409)       # username taken
        L = J(self.admin.get("/api/admin/riders"))["riders"]
        self.assertEqual([r["u"] for r in L if r["u"] == "rider_juan"], ["rider_juan"])
        self.assertEqual([r["pl"] for r in L if r["u"] == "rider_juan"], ["ABC 123"])
        # riders are not customers
        self.assertNotIn("rider_juan", [c["u"] for c in J(self.admin.get("/api/admin/customers"))["customers"]])
    def test_03_rider_portal_access(self):
        r = client(); j = login(r, "rider_juan", "rider123"); self.assertEqual(j.status_code, 200); self.assertEqual(J(j)["user"]["role"], "rider")
        self.assertEqual(r.get("/rider").status_code, 200); self.assertEqual(r.get("/rider/earnings").status_code, 200); self.assertEqual(r.get("/rider/account").status_code, 200)
        self.assertEqual(r.get("/app").headers["Location"], "/rider"); self.assertEqual(r.get("/login").headers["Location"], "/rider"); self.assertEqual(r.get("/sell").headers["Location"], "/rider")
        self.assertEqual(r.get("/admin").headers["Location"], "/app")
        self.assertEqual(r.get("/api/admin/summary").status_code, 403); self.assertEqual(r.get("/api/owner/store").status_code, 403)
        self.assertEqual(r.post("/api/orders", json={"items": [{"id": self.dish, "q": 1}], "otype": "Delivery", "addr": "Somewhere here", "method": "Cash", "details": {"cash": 5000}}).status_code, 403)
        self.assertEqual(self.anon.get("/rider").headers["Location"], "/login"); self.assertEqual(self.anon.get("/api/rider/deliveries").status_code, 401)
        self.assertEqual(self.cus.get("/rider").headers["Location"], "/app"); self.assertEqual(self.cus.get("/api/rider/deliveries").status_code, 403)
        self.assertEqual(self.admin.get("/api/rider/deliveries").status_code, 403)
    def test_04_assignment_and_delivery_flow(self):
        r = client(); login(r, "rider_juan", "rider123")
        o = J(order(self.cus, self.dish))["order"]
        self.assertTrue(o["real"]); self.assertEqual(o["rider"]["n"], "Juan Rider"); self.assertEqual(o["status"], 0)
        d = J(r.get("/api/rider/deliveries"))["deliveries"][0]
        self.assertEqual((d["id"], d["state"], d["status"]), (o["id"], "Assigned", 0)); self.assertEqual(d["collect"], o["total"])
        self.assertEqual(r.post(f"/api/rider/deliveries/{d['num']}/deliver", json={}).status_code, 400)       # must pick up first
        self.assertEqual(r.post(f"/api/rider/deliveries/{d['num']}/pickup", json={}).status_code, 200)
        self.assertEqual(r.post(f"/api/rider/deliveries/{d['num']}/pickup", json={}).status_code, 400)
        self.assertEqual([x for x in J(self.cus.get("/api/orders"))["orders"] if x["id"] == o["id"]][0]["status"], 1)
        self.assertEqual(r.post(f"/api/rider/deliveries/{d['num']}/deliver", json={}).status_code, 200)
        self.assertEqual([x for x in J(self.cus.get("/api/orders"))["orders"] if x["id"] == o["id"]][0]["status"], 2)
        e = J(r.get("/api/rider/earnings"))
        self.assertEqual(e["all"]["n"], 1); self.assertGreater(e["all"]["fees"], 0); self.assertEqual(e["today"]["n"], 1)
    def test_05_rider_isolation_and_availability(self):
        self.assertEqual(self.admin.post("/api/admin/riders", json={**RIDER, "name": "Pedro Rider", "u": "rider_pedro"}).status_code, 200)
        a = client(); login(a, "rider_juan", "rider123"); b = client(); login(b, "rider_pedro", "rider123")
        self.assertEqual(a.put("/api/rider/profile", json={"active": False}).status_code, 200)       # Juan goes offline
        o = J(order(self.cus, self.dish))["order"]; self.assertEqual(o["rider"]["n"], "Pedro Rider")
        mine = J(b.get("/api/rider/deliveries"))["deliveries"][0]
        self.assertEqual(a.post(f"/api/rider/deliveries/{mine['num']}/pickup", json={}).status_code, 404)    # not Juan's order
        self.assertNotIn(mine["id"], [x["id"] for x in J(a.get("/api/rider/deliveries"))["deliveries"]])
        self.assertEqual(self.cus.post(f"/api/orders/{o['id']}/cancel", json={}).status_code, 200)             # the customer cancels while preparing
        self.assertEqual(b.post(f"/api/rider/deliveries/{mine['num']}/pickup", json={}).status_code, 400)
        self.assertEqual(a.put("/api/rider/profile", json={"active": True}).status_code, 200)
    def test_06_no_rider_uses_demo_rider(self):
        for u in ("rider_juan", "rider_pedro"):
            c = client(); login(c, u, "rider123" if u == "rider_juan" else "rider123"); c.put("/api/rider/profile", json={"active": False})
        o = J(order(self.cus, self.dish))["order"]
        self.assertFalse(o["real"]); self.assertIsNotNone(o["rider"])
        for u in ("rider_juan", "rider_pedro"):
            c = client(); login(c, u, "rider123"); c.put("/api/rider/profile", json={"active": True})
    def test_07_admin_manage(self):
        L = {r["u"]: r for r in J(self.admin.get("/api/admin/riders"))["riders"]}; p = L["rider_pedro"]["id"]
        self.assertEqual(self.admin.delete(f"/api/admin/riders/{p}").status_code, 200 if L["rider_pedro"]["total"] == 0 else 409)
        j = L["rider_juan"]["id"]
        self.assertEqual(self.admin.delete(f"/api/admin/riders/{j}").status_code, 409)               # has deliveries on record
        self.assertEqual(self.admin.put(f"/api/admin/riders/{j}", json={"password": "123"}).status_code, 400)
        self.assertEqual(self.admin.put(f"/api/admin/riders/{j}", json={"password": "newpass1"}).status_code, 200)
        self.assertEqual(login(client(), "rider_juan", "rider123").status_code, 401); self.assertEqual(login(client(), "rider_juan", "newpass1").status_code, 200)
        self.assertEqual(self.admin.put(f"/api/admin/riders/{j}", json={**RIDER, "name": "Juan Dela Cruz"}).status_code, 200)
        self.assertEqual(self.admin.put(f"/api/admin/riders/{j}", json={"disabled": True}).status_code, 200)
        self.assertEqual(login(client(), "rider_juan", "newpass1").status_code, 403)                  # switched off
        self.assertEqual(self.admin.put(f"/api/admin/riders/{j}", json={"disabled": False}).status_code, 200)
        self.assertEqual(login(client(), "rider_juan", "newpass1").status_code, 200)
    def test_08_rider_password_change(self):
        c = client(); login(c, "rider_juan", "newpass1")
        self.assertEqual(c.post("/api/rider/password", json={"current": "wrong", "new": "another1"}).status_code, 400)
        self.assertEqual(c.post("/api/rider/password", json={"current": "newpass1", "new": "123"}).status_code, 400)
        self.assertEqual(c.post("/api/rider/password", json={"current": "newpass1", "new": "another1"}).status_code, 200)
        self.assertEqual(login(client(), "rider_juan", "another1").status_code, 200)
    def test_10_store_logo(self):
        o = client(); reg(o, "logoowner"); self.assertEqual(o.post("/api/store-application", json=APP).status_code, 200)
        aid = J(self.admin.get("/api/admin/applications"))["applications"][0]["id"]
        self.assertEqual(self.admin.post(f"/api/admin/applications/{aid}/approve", json={}).status_code, 200)
        self.assertIsNone(J(o.get("/api/owner/store"))["store"]["logo"])
        for c in (self.anon, self.cus, self.admin): self.assertIn(c.post("/api/owner/store/logo", json={"image": JPG}).status_code, (401, 403))
        for bad in ("hello", "data:image/png;base64,AAAA", "data:image/jpeg;base64,AAAA"): self.assertEqual(o.post("/api/owner/store/logo", json={"image": bad}).status_code, 400, bad)
        r = o.post("/api/owner/store/logo", json={"image": JPG}); self.assertEqual(r.status_code, 200); logo = J(r)["store"]["logo"]
        self.assertTrue(logo.startswith("/static/uploads/logos/")); self.assertTrue(os.path.exists(os.path.join(padali.LOGO_DIR, os.path.basename(logo))))
        self.assertEqual([s["logo"] for s in J(self.cus.get("/api/stores"))["stores"] if s["n"] == "Logo Grill"], [logo])      # customers see it
        r2 = o.post("/api/owner/store/logo", json={"image": JPG}); logo2 = J(r2)["store"]["logo"]
        self.assertFalse(os.path.exists(os.path.join(padali.LOGO_DIR, os.path.basename(logo))) and logo != logo2)               # the old file is removed
        self.assertEqual(o.delete("/api/owner/store/logo").status_code, 200); self.assertIsNone(J(o.get("/api/owner/store"))["store"]["logo"])
    def test_11_admin_feedback_removed_owner_feedback_kept(self):
        self.assertEqual(self.admin.get("/admin/feedback").status_code, 404); self.assertEqual(self.admin.get("/api/admin/feedback").status_code, 404)
        self.assertNotIn(b"Feedback", self.admin.get("/admin").data)
        o = client(); login(o, "logoowner", "secret12"); self.assertEqual(o.get("/api/owner/feedback").status_code, 200); self.assertEqual(o.get("/owner/feedback").status_code, 200)
        self.assertIn(b"Planning to Build a Store", self.cus.get("/app").data); self.assertNotIn(b"My Store", self.cus.get("/app").data)
    def test_12_owner_sees_rider_on_orders(self):
        o = client(); login(o, "logoowner", "secret12")
        self.assertEqual(o.get("/api/owner/orders").status_code, 200)

if __name__ == "__main__": unittest.main()
