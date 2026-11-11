"""Store application workflow tests.  Run from the project folder:   python -m unittest tests.test_store_applications -v
Uses a COPY of oms.db (made below), so your real data is never touched."""
import os, shutil, sys, tempfile, unittest
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
TMP = tempfile.mkdtemp()
os.environ["PADALI_DB"] = os.path.join(TMP, "test.db"); os.environ["PADALI_NO_PHOTOS"] = "1"
shutil.copy(os.path.join(HERE, "oms.db"), os.environ["PADALI_DB"])
import app as padali

def client(): return padali.app.test_client()
def J(r): return r.get_json(silent=True) or {}
def reg(c, u):
    return c.post("/api/register", json={"name": u.title() + " Test", "email": u + "@x.com", "phone": "09123456789", "addr": "Somewhere 1", "u": u, "p": "secret12"})
APP = {"name": "Test Grill", "cuisine": "Filipino · Grill", "description": "Charcoal grilled food for everyone.", "address": "Rizal St", "phone": "09171234567", "lat": 9.3356, "lng": 125.9769}
DISH = {"name": "Test Dish", "price": 100, "category": "Meals", "description": "yum"}

class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = client(); assert cls.admin.post("/api/login", json={"u": "admin", "p": "123456"}).status_code == 200
        cls.a = client(); reg(cls.a, "applicant1"); cls.b = client(); reg(cls.b, "applicant2"); cls.cus = client(); reg(cls.cus, "customer1"); cls.anon = client()

    def test_01_apply_validation(self):
        for bad in ({"name": "x"}, {"phone": "123"}, {"description": "short"}, {"lat": None}, {"lat": 0, "lng": 0}):
            self.assertEqual(self.a.post("/api/store-application", json={**APP, **bad}).status_code, 400, bad)
        self.assertEqual(self.anon.post("/api/store-application", json=APP).status_code, 401)
        self.assertEqual(self.admin.post("/api/store-application", json=APP).status_code, 403)
        self.assertEqual(self.a.post("/api/store-application", json={**APP, "name": "dragon wok"}).status_code, 409)     # name of an existing store
    def test_02_pending_and_hidden(self):
        self.assertEqual(self.a.post("/api/store-application", json=APP).status_code, 200)
        self.assertEqual(self.a.post("/api/store-application", json=APP).status_code, 409)                                # one pending at a time
        self.assertEqual(self.b.post("/api/store-application", json=APP).status_code, 409)                                # same name already waiting
        self.assertEqual(J(self.a.get("/api/store-application"))["latest"]["status"], "pending")
        self.assertNotIn("Test Grill", [s["n"] for s in J(self.cus.get("/api/stores"))["stores"]])                         # not visible before approval
        self.assertEqual(self.a.get("/api/owner/store").status_code, 403)
        self.assertEqual(self.a.get("/owner").headers["Location"], "/sell")
    def test_03_only_admin_decides(self):
        i = J(self.admin.get("/api/admin/applications"))["applications"][0]["id"]
        for c in (self.a, self.cus, self.anon): self.assertIn(c.post(f"/api/admin/applications/{i}/approve").status_code, (401, 403))
        self.assertEqual(self.admin.post(f"/api/admin/applications/{i}/reject", json={"reason": "no"}).status_code, 400)
        self.assertEqual(self.admin.post(f"/api/admin/applications/{i}/reject", json={"reason": "Address is not clear"}).status_code, 200)
        self.assertEqual(self.admin.post(f"/api/admin/applications/{i}/approve").status_code, 409)                         # decided already
        la = J(self.a.get("/api/store-application"))["latest"]; self.assertEqual((la["status"], la["reason"]), ("rejected", "Address is not clear"))
    def test_04_reapply_and_approve(self):
        self.assertEqual(self.a.post("/api/store-application", json={**APP, "address": "Rizal St corner Mabini"}).status_code, 200)
        i = J(self.admin.get("/api/admin/applications"))["applications"][0]; self.assertEqual(i["status"], "pending"); self.assertTrue(i["checks"])
        self.assertEqual(self.admin.post(f"/api/admin/applications/{i['id']}/approve").status_code, 200)
        self.assertEqual(self.a.get("/api/me").get_json()["user"]["role"], "owner")
        self.assertIn("Test Grill", [s["n"] for s in J(self.cus.get("/api/stores"))["stores"]])
        self.assertEqual(self.a.get("/sell").headers["Location"], "/owner"); self.assertEqual(self.a.get("/owner").status_code, 200)
        self.assertEqual(self.a.post("/api/store-application", json=APP).status_code, 409)                                 # one store per owner
        self.assertEqual(self.b.post("/api/store-application", json={**APP, "name": "Second Place"}).status_code, 200)
        j = [x for x in J(self.admin.get("/api/admin/applications"))["applications"] if x["name"] == "Second Place"][0]
        self.assertEqual(self.admin.post(f"/api/admin/applications/{j['id']}/approve").status_code, 200)
    def test_05_owner_isolation_and_menu(self):
        self.assertEqual(self.a.post("/api/owner/menu", json=DISH).status_code, 200)
        self.assertEqual(self.a.post("/api/owner/menu", json=DISH).status_code, 400)
        self.assertEqual(self.b.post("/api/owner/menu", json={**DISH, "name": "Other Dish"}).status_code, 200)
        mine = J(self.a.get("/api/owner/menu"))["items"]; theirs = J(self.b.get("/api/owner/menu"))["items"]
        self.assertEqual([x["n"] for x in mine], ["Test Dish"]); self.assertEqual([x["n"] for x in theirs], ["Other Dish"])
        oid = theirs[0]["id"]
        self.assertEqual(self.a.put(f"/api/owner/menu/{oid}", json={"available": False}).status_code, 404)
        self.assertEqual(self.a.put(f"/api/owner/menu/{oid}", json={**DISH, "name": "Hacked"}).status_code, 404)
        self.assertEqual(self.a.delete(f"/api/owner/menu/{oid}").status_code, 404)
        self.assertEqual(self.a.put("/api/owner/menu/%d" % mine[0]["id"], json={**DISH, "store_id": 1}).status_code, 200)      # store_id in the body is ignored
        self.assertEqual(len(J(self.a.get("/api/owner/menu"))["items"]), 1)
        self.assertEqual(self.a.put("/api/owner/store", json={**APP, "name": "Renamed", "description": "New description here"}).status_code, 200)
        st = J(self.a.get("/api/owner/store"))["store"]; self.assertEqual((st["name"], st["description"]), ("Test Grill", "New description here"))
        for c in (self.cus, self.admin, self.anon):
            self.assertIn(c.get("/api/owner/menu").status_code, (401, 403)); self.assertIn(c.get("/api/owner/feedback").status_code, (401, 403))
    def test_06_orders_and_feedback(self):
        d = padali.sqlite3.connect(padali.DB); iid = d.execute("SELECT id FROM menu_items WHERE name='Test Dish'").fetchone()[0]
        body = {"items": [{"id": iid, "q": 2}], "otype": "Delivery", "addr": "Home address 1", "method": "Cash", "details": {"cash": 1000}}
        r = self.cus.post("/api/orders", json=body); self.assertEqual(r.status_code, 200, J(r)); code = J(r)["order"]["id"]
        self.assertEqual(self.a.post("/api/orders", json=body).status_code, 400)                                           # owner can not order from own store
        oo = J(self.a.get("/api/owner/orders"))["orders"]; self.assertEqual(oo[0]["id"], code); self.assertEqual(oo[0]["mine"], 200); self.assertNotIn("method", oo[0])
        self.assertEqual(J(self.b.get("/api/owner/orders"))["orders"], [])
        n = int(code[4:]) - 1000; d.execute("UPDATE orders SET status=2 WHERE id=?", (n,)); d.commit()                      # completed, so it can be rated
        self.assertEqual(self.cus.post("/api/reviews/food", json={"order": code, "store": "Test Grill", "name": "Test Dish", "rating": 2, "comment": "cold fries"}).status_code, 200)
        self.assertEqual(self.cus.post("/api/reviews", json={"order": code, "store": "Test Grill", "rating": 5, "comment": "nice store"}).status_code, 200)
        self.assertEqual(self.cus.post("/api/reviews/delivery", json={"order": code, "rating": 4, "speed": "ontime", "comment": "ok"}).status_code, 200)
        fb = J(self.a.get("/api/owner/feedback"))["feedback"]
        self.assertEqual((fb["food"][0]["comment"], fb["store"][0]["comment"], len(fb["delivery"])), ("cold fries", "nice store", 1))
        self.assertEqual(J(self.b.get("/api/owner/feedback"))["feedback"]["food"], [])
        for k in ("store", "food", "delivery"):
            fid = fb[k][0]["id"]
            self.assertEqual(self.b.put(f"/api/owner/feedback/{k}/{fid}/reply", json={"reply": "x"}).status_code, 404)
            self.assertEqual(self.a.put(f"/api/owner/feedback/{k}/{fid}/reply", json={"reply": "Salamat!"}).status_code, 200)
        s = J(self.a.get("/api/owner/summary")); self.assertEqual(s["kpi"]["orders"], 1); self.assertEqual(s["kpi"]["sales"], 200)
        self.assertEqual(self.a.get("/api/owner/summary").status_code, 200)
        self.assertEqual(self.a.put("/api/owner/store", json={"open": False}).status_code, 200)
        self.assertEqual(self.cus.post("/api/orders", json=body).status_code, 400)                                         # closed store: no orders
        self.assertEqual(self.a.put("/api/owner/store", json={"open": True}).status_code, 200)
    def test_07_legacy_and_admin_unchanged(self):
        self.assertEqual(self.admin.get("/api/admin/summary").status_code, 200); self.assertEqual(self.admin.get("/api/admin/menu").status_code, 200)
        self.assertEqual(self.a.get("/api/admin/summary").status_code, 403); self.assertEqual(self.a.get("/admin/applications").headers["Location"], "/app")
        st = [s for s in J(self.admin.get("/api/admin/stores"))["stores"] if s["n"] == "Test Grill"][0]; self.assertEqual(st["owner"], "Applicant1 Test")
        self.assertGreaterEqual(len([s for s in J(self.cus.get("/api/stores"))["stores"]]), 10)
    def test_08_store_removed_returns_to_customer(self):
        sid = padali.sqlite3.connect(padali.DB).execute("SELECT id FROM stores WHERE name='Second Place'").fetchone()[0]
        iid = J(self.b.get("/api/owner/menu"))["items"][0]["id"]; self.assertEqual(self.b.delete(f"/api/owner/menu/{iid}").status_code, 200)
        self.assertEqual(self.admin.delete(f"/api/admin/stores/{sid}").status_code, 200)
        self.assertEqual(self.b.get("/api/me").get_json()["user"]["role"], "user")
        self.assertEqual(J(self.b.get("/api/store-application"))["latest"]["status"], "closed")
        self.assertEqual(self.b.post("/api/store-application", json={**APP, "name": "Third Place"}).status_code, 200)

if __name__ == "__main__":
    unittest.main()
