"""Backend authorization + workflow tests.  Run from the project folder:   python -m unittest discover -s tests -v
Every test uses a COPY of the real oms.db (made in setUpModule), so your data is never touched."""
import os, shutil, sqlite3, sys, tempfile, unittest
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
TMP = tempfile.mkdtemp()
os.environ["PADALI_DB"] = os.path.join(TMP, "test.db"); os.environ["PADALI_NO_PHOTOS"] = "1"
shutil.copy(os.path.join(HERE, "oms.db"), os.environ["PADALI_DB"])
BEFORE = {}
_c = sqlite3.connect(os.environ["PADALI_DB"])
for t in ("users", "stores", "menu_items", "orders", "order_items", "reviews", "food_reviews", "delivery_reviews", "favorites"):
    BEFORE[t] = _c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
BEFORE_ADMIN = _c.execute("SELECT password_hash FROM users WHERE username='admin'").fetchone()
BEFORE_OLD_ORDERS = [tuple(r) for r in _c.execute("SELECT id,user_id,total,status,rider FROM orders ORDER BY id")]
_c.close()
import app as padali

def client(): return padali.app.test_client()
def J(r): return r.get_json(silent=True) or {}
def reg(c, u, account, **extra):
    d = {"name": u.title() + " Test", "email": u + "@x.com", "phone": "09123456789", "addr": "Somewhere 1", "u": u, "p": "secret12", "account": account}
    d.update(extra)
    return c.post("/api/register", json=d)
def login(c, u, p="secret12"): return c.post("/api/login", json={"u": u, "p": p})
STORE = {"name": "Test Grill", "cuisine": "Filipino · Grill", "description": "Charcoal grilled food for everyone.", "address": "Rizal St", "contact_phone": "09171234567", "lat": 9.3356, "lng": 125.9769}
DISH = {"name": "Test Dish", "price": 100, "category": "Meals", "description": "yum"}

class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = client(); assert login(cls.admin, "admin", "123456").status_code == 200
        cls.o1 = client(); reg(cls.o1, "owner1", "owner"); cls.o2 = client(); reg(cls.o2, "owner2", "owner")
        cls.r1 = client(); reg(cls.r1, "rider1", "rider", vehicle="Motorcycle", plate="AB 123")
        cls.r2 = client(); reg(cls.r2, "rider2", "rider", vehicle="Bicycle")
        cls.cus = client(); reg(cls.cus, "cust1", "customer")
        cls.anon = client()
        assert cls.o1.post("/api/owner/store", json=STORE).status_code == 200
        assert cls.o2.post("/api/owner/store", json={**STORE, "name": "Other Place"}).status_code == 200
        cls.sid1 = padali.sqlite3.connect(padali.DB).execute("SELECT id FROM stores WHERE name='Test Grill'").fetchone()[0]
        cls.sid2 = padali.sqlite3.connect(padali.DB).execute("SELECT id FROM stores WHERE name='Other Place'").fetchone()[0]

    # 1-4 protected pages / APIs
    def test_01_anonymous(self):
        for p in ("/admin", "/admin/verification", "/owner", "/rider", "/owner/menu"):
            r = self.anon.get(p); self.assertEqual((r.status_code, r.headers["Location"]), (302, "/login"), p)
        for p in ("/api/admin/summary", "/api/admin/verification", "/api/owner/store", "/api/rider/deliveries", "/api/owner/feedback"):
            self.assertEqual(self.anon.get(p).status_code, 401, p)
    def test_02_customer_blocked(self):
        for p in ("/api/admin/summary", "/api/admin/verification", "/api/admin/orders", "/api/owner/store", "/api/owner/orders", "/api/owner/feedback", "/api/rider/deliveries"):
            self.assertEqual(self.cus.get(p).status_code, 403, p)
        for p, home in (("/admin", "/app"), ("/owner", "/app"), ("/rider", "/app")):
            self.assertEqual(self.cus.get(p).headers["Location"], home)
    def test_03_other_roles_cannot_use_customer_pages_or_ordering(self):
        self.assertEqual(self.o1.get("/menu").headers["Location"], "/owner"); self.assertEqual(self.r1.get("/app").headers["Location"], "/rider")
        self.assertEqual(self.admin.get("/orders").headers["Location"], "/admin")
        for c in (self.o1, self.r1, self.admin): self.assertEqual(c.post("/api/orders", json={"items": []}).status_code, 403)

    # 5, 9: owners / riders cannot verify
    def test_05_owner_rider_cannot_verify(self):
        for c in (self.o1, self.r1, self.cus, self.anon):
            self.assertIn(c.post(f"/api/admin/verification/{self.sid1}/approve", json={}).status_code, (401, 403))
        self.assertEqual(self.o1.get("/api/admin/verification").status_code, 403)

    # verification workflow: pending -> hidden, reject, resubmit, approve
    def test_10_verification_workflow(self):
        d = padali.sqlite3.connect(padali.DB)
        self.assertEqual(d.execute("SELECT verification_status FROM stores WHERE id=?", (self.sid1,)).fetchone()[0], "pending")
        self.assertEqual(self.o1.post("/api/owner/store", json=STORE).status_code, 409)               # no duplicate application
        stores = [s["n"] for s in J(self.cus.get("/api/stores"))["stores"]]
        self.assertNotIn("Test Grill", stores); self.assertEqual(len(stores), 8)                      # 14 (hidden) / 14 old stores still listed
        self.assertEqual(self.cus.get(f"/api/stores/{self.sid1}/reviews").status_code, 404)
        self.assertEqual(self.o1.post("/api/owner/menu", json=DISH).status_code, 403)                 # menu only after approval
        r = self.admin.get("/api/admin/verification"); self.assertEqual([s["name"] for s in J(r)["stores"] if s["status"] == "pending"][:2].__len__(), 2)   # 10: admin sees pending
        self.assertEqual(self.admin.post(f"/api/admin/verification/{self.sid1}/reject", json={"reason": "no"}).status_code, 400)   # reason required
        self.assertEqual(self.admin.post(f"/api/admin/verification/{self.sid1}/reject", json={"reason": "Address is not clear"}).status_code, 200)
        st = J(self.o1.get("/api/owner/store"))["store"]; self.assertEqual((st["status"], st["reason"]), ("rejected", "Address is not clear"))
        self.assertEqual(self.admin.post(f"/api/admin/verification/{self.sid1}/approve", json={}).status_code, 409)   # rejected can't be approved without resubmitting
        self.assertEqual(self.o1.put("/api/owner/store", json={**STORE, "address": "Rizal St. corner Mabini"}).status_code, 200)
        self.assertEqual(J(self.o1.get("/api/owner/store"))["store"]["status"], "pending")
        self.assertEqual(self.admin.post(f"/api/admin/verification/{self.sid1}/approve", json={}).status_code, 200)
        self.assertEqual(self.admin.post(f"/api/admin/verification/{self.sid1}/approve", json={}).status_code, 409)   # no double decision
        self.assertIn("Test Grill", [s["n"] for s in J(self.cus.get("/api/stores"))["stores"]])        # 14: approved is listed
        self.assertEqual(self.admin.post(f"/api/admin/verification/{self.sid2}/approve", json={}).status_code, 200)

    # 6, 7: owner isolation
    def test_20_owner_isolation(self):
        self.assertEqual(self.o1.post("/api/owner/menu", json=DISH).status_code, 200)
        self.assertEqual(self.o1.post("/api/owner/menu", json=DISH).status_code, 400)                  # double submit
        self.assertEqual(self.o2.post("/api/owner/menu", json={**DISH, "name": "Other Dish"}).status_code, 200)
        mine = J(self.o1.get("/api/owner/menu"))["items"]; theirs = J(self.o2.get("/api/owner/menu"))["items"]
        self.assertEqual([i["n"] for i in mine], ["Test Dish"]); self.assertEqual([i["n"] for i in theirs], ["Other Dish"])
        other_id = theirs[0]["id"]
        self.assertEqual(self.o1.put(f"/api/owner/menu/{other_id}", json={"available": False}).status_code, 404)
        self.assertEqual(self.o1.put(f"/api/owner/menu/{other_id}", json={**DISH, "name": "Hacked"}).status_code, 404)
        self.assertEqual(self.o1.delete(f"/api/owner/menu/{other_id}").status_code, 404)
        self.assertEqual(J(self.o2.get("/api/owner/menu"))["items"][0]["n"], "Other Dish")
        self.assertEqual(self.o1.put("/api/owner/menu/%d" % mine[0]["id"], json={"available": False}).status_code, 200)   # availability
        self.o1.put("/api/owner/menu/%d" % mine[0]["id"], json={"available": True})
        r = self.o1.put("/api/owner/menu/%d" % mine[0]["id"], json={**DISH, "store_id": self.sid2}); self.assertEqual(r.status_code, 200)   # store_id in body is ignored
        self.assertEqual(len(J(self.o1.get("/api/owner/menu"))["items"]), 1)
        self.assertEqual(self.o1.put("/api/owner/store", json={**STORE, "name": "Renamed"}).status_code, 200)   # name locked after approval
        self.assertEqual(J(self.o1.get("/api/owner/store"))["store"]["name"], "Test Grill")

    # 13: unapproved store direct order; 15: existing ordering still works
    def test_30_ordering_rules(self):
        d = padali.sqlite3.connect(padali.DB)
        p = {"name": "Pending Owner", "cuisine": "x", "description": "A pending place here", "address": "Addr 12345", "contact_phone": "09171234567"}
        c = client(); reg(c, "owner3", "owner"); c.post("/api/owner/store", json=p)
        sid = d.execute("SELECT id FROM stores WHERE name='Pending Owner'").fetchone()[0]
        d.execute("INSERT INTO menu_items(name,price,category,store_id) VALUES('Sneaky',50,'Meals',?)", (sid,)); d.commit()
        iid = d.execute("SELECT id FROM menu_items WHERE name='Sneaky'").fetchone()[0]
        body = {"items": [{"id": iid, "q": 1}], "otype": "Delivery", "addr": "Home address 1", "method": "Cash", "details": {"cash": 500}}
        r = self.cus.post("/api/orders", json=body); self.assertEqual(r.status_code, 403, J(r))
        self.assertNotIn(iid, [m["id"] for m in J(self.cus.get("/api/menu"))["items"]])
        # legacy demo store still orderable (existing behaviour)
        legacy = d.execute("SELECT id FROM menu_items WHERE store_id=1 LIMIT 1").fetchone()[0]
        r = self.cus.post("/api/orders", json={**body, "items": [{"id": legacy, "q": 2}]}); self.assertEqual(r.status_code, 200, J(r))
        self.assertIsNotNone(J(r)["order"]["rider"]); self.assertFalse(J(r)["order"]["live"])
        # suspend an approved store: no new orders, history kept
        mine = J(self.o1.get("/api/owner/menu"))["items"][0]["id"]
        r = self.cus.post("/api/orders", json={**body, "items": [{"id": mine, "q": 1}]}); self.assertEqual(r.status_code, 200, J(r))
        self.__class__.order = J(r)["order"]; self.assertTrue(self.order["live"]); self.assertIsNone(self.order["rider"]); self.assertEqual(self.order["status"], 0)
        self.assertEqual(self.admin.post(f"/api/admin/verification/{self.sid1}/suspend", json={"reason": "Customer complaints"}).status_code, 200)
        self.assertEqual(self.cus.post("/api/orders", json={**body, "items": [{"id": mine, "q": 1}]}).status_code, 403)
        self.assertEqual(self.o1.post("/api/owner/menu", json={**DISH, "name": "x2"}).status_code, 403)
        self.assertEqual(len(J(self.cus.get("/api/orders"))["orders"]), 2)            # history is kept
        self.assertEqual(self.admin.post(f"/api/admin/verification/{self.sid1}/reinstate", json={}).status_code, 200)

    # delivery workflow + rider isolation (6 of the list: 8)
    def test_40_delivery_workflow(self):
        code = self.order["id"]; num = int(code[4:]) - 1000
        rid1 = J(self.r1.get("/api/rider/deliveries"))["profile"]; self.assertTrue(rid1["active"])
        riders = J(self.o1.get("/api/owner/riders"))["riders"]; ids = {r["n"]: r["id"] for r in riders}
        self.assertEqual(self.o2.post(f"/api/owner/orders/{num}/assign-rider", json={"rider_id": ids["Rider1 Test"]}).status_code, 404)   # other owner's store: not their order
        self.assertEqual(self.o1.post(f"/api/owner/orders/{num}/assign-rider", json={"rider_id": 1}).status_code, 400)                    # customer id is not a rider
        self.assertEqual(self.r1.post(f"/api/rider/deliveries/{num}/pickup").status_code, 404)                                            # not assigned yet
        self.assertEqual(self.o1.post(f"/api/owner/orders/{num}/assign-rider", json={"rider_id": ids["Rider1 Test"]}).status_code, 200)
        self.assertEqual(self.o1.post(f"/api/owner/orders/{num}/assign-rider", json={"rider_id": ids["Rider2 Test"]}).status_code, 200)   # same owner may change before pickup
        self.assertEqual(self.o1.post(f"/api/owner/orders/{num}/assign-rider", json={"rider_id": ids["Rider1 Test"]}).status_code, 200)
        self.assertEqual(J(self.r2.get("/api/rider/deliveries"))["deliveries"], [])                                                       # 8: rider2 sees nothing
        self.assertEqual(self.r2.post(f"/api/rider/deliveries/{num}/pickup").status_code, 404)
        self.assertEqual(self.r2.post(f"/api/rider/deliveries/{num}/deliver").status_code, 404)
        self.assertEqual(self.r1.post(f"/api/rider/deliveries/{num}/deliver").status_code, 409)                                           # can't skip Picked up
        self.assertEqual(self.admin.put(f"/api/admin/orders/{num}/status", json={"status": 2}).status_code, 403)                         # admin can't push it
        dl = J(self.r1.get("/api/rider/deliveries"))["deliveries"]; self.assertEqual((len(dl), dl[0]["state"], dl[0]["collect"]), (1, "Assigned", dl[0]["collect"]))
        self.assertEqual(self.r1.post(f"/api/rider/deliveries/{num}/pickup").status_code, 200)
        self.assertEqual(self.r1.post(f"/api/rider/deliveries/{num}/pickup").status_code, 409)
        self.assertEqual(self.o1.post(f"/api/owner/orders/{num}/assign-rider", json={"rider_id": ids["Rider2 Test"]}).status_code, 409)   # no reassign after pickup
        self.assertEqual(self.o1.post(f"/api/owner/orders/{num}/cancel").status_code, 409)
        self.assertEqual(J(self.cus.get("/api/orders"))["orders"][0]["rider"]["n"], "Rider1 Test")
        self.assertEqual(self.r1.post(f"/api/rider/deliveries/{num}/deliver").status_code, 200)
        o = J(self.cus.get("/api/orders"))["orders"][0]; self.assertEqual((o["status"], o["rstate"]), (2, "Delivered"))
        self.assertEqual(self.r1.post("/api/rider/deliveries/999999/pickup").status_code, 404)
        # owner order view: only own items, no payment, no phone
        oo = J(self.o1.get("/api/owner/orders"))["orders"]; self.assertEqual(oo[0]["id"], code); self.assertNotIn("phone", oo[0]); self.assertNotIn("method", oo[0])
        self.assertEqual(J(self.o2.get("/api/owner/orders"))["orders"], [])                                                                # 7: other owner sees none

    # 7, 12, 17: private feedback
    def test_50_feedback_privacy(self):
        code = self.order["id"]
        r = self.cus.post("/api/reviews/food", json={"order": code, "store": "Test Grill", "name": "Test Dish", "rating": 2, "comment": "cold fries"}); self.assertEqual(r.status_code, 200, J(r))
        self.assertEqual(self.cus.post("/api/reviews/delivery", json={"order": code, "rating": 4, "speed": "ontime", "comment": "ok"}).status_code, 200)
        fb = J(self.o1.get("/api/owner/feedback")); self.assertEqual(fb["feedback"]["food"][0]["comment"], "cold fries"); self.assertEqual(len(fb["feedback"]["delivery"]), 1)
        self.assertEqual(J(self.o2.get("/api/owner/feedback"))["feedback"]["food"], [])
        for k in ("food", "delivery"):
            fid = fb["feedback"][k][0]["id"]
            self.assertEqual(self.o2.put(f"/api/owner/feedback/{k}/{fid}/reply", json={"reply": "x"}).status_code, 404)
            self.assertEqual(self.o1.put(f"/api/owner/feedback/{k}/{fid}/reply", json={"reply": "Sorry!"}).status_code, 200)
        # legacy store feedback is not visible to a new owner
        self.assertTrue(all(x["target"] == "Test Dish" for x in J(self.o1.get("/api/owner/feedback"))["feedback"]["food"]))
        for p in ("/api/owner/feedback", "/api/owner/orders", "/api/owner/menu", "/api/owner/store", "/api/owner/summary"):
            self.assertEqual(self.admin.get(p).status_code, 403, p)
        self.assertEqual(self.admin.put("/api/owner/feedback/food/1/reply", json={"reply": "x"}).status_code, 403)
        for p in ("/admin/feedback", "/admin/menu", "/admin/stores", "/api/admin/feedback", "/api/admin/menu", "/api/admin/stores"):    # 17: removed routes
            for c in (self.admin, self.o1, self.cus, self.anon): self.assertEqual(c.get(p).status_code, 404, p)
        for m, p in (("put", "/api/admin/feedback/food/1/reply"), ("delete", "/api/admin/feedback/food/1"), ("post", "/api/admin/menu"), ("post", "/api/admin/stores"), ("delete", "/api/admin/stores/1")):
            self.assertIn(getattr(self.admin, m)(p, json={}).status_code, (404, 405), p)
        blob = str(J(self.admin.get("/api/admin/summary"))) + str(J(self.admin.get("/api/admin/orders"))) + str(J(self.admin.get("/api/admin/verification")))
        self.assertNotIn("cold fries", blob)

    # 16: role tampering
    def test_60_role_tampering(self):
        c = client()
        for bad in ({"account": "admin"}, {"role": "admin"}, {"account": "customer", "role": "admin"}, {"account": "ADMIN"}, {"account": "owner", "role": "owner"}):
            b = dict(bad); r = reg(c, "evil", b.pop("account", "customer"), **b); self.assertEqual(r.status_code, 400, bad)
        self.assertEqual(padali.sqlite3.connect(padali.DB).execute("SELECT COUNT(*) FROM users WHERE username='evil'").fetchone()[0], 0)
        self.assertEqual(reg(c, "badrider", "rider", vehicle="Tank").status_code, 400)
        self.assertEqual(self.cus.put("/api/profile", json={"name": "A", "email": "a@a.com", "phone": "09123456789", "addr": "x", "role": "admin"}).status_code in (200, 400), True)
        self.assertEqual(self.cus.get("/api/me").get_json()["user"]["role"], "user")
        self.assertEqual(self.o1.get("/api/me").get_json()["user"]["role"], "owner")
        self.assertEqual(self.o1.get("/api/admin/summary").status_code, 403)
        self.assertEqual(self.admin.post("/api/admin/verification/%d/assign-owner" % self.sid1, json={"owner_id": 1}).status_code, 400)
        r = self.o1.get("/api/me").get_data(as_text=True); self.assertNotIn("hash", r); self.assertNotIn("password", r)

    # legacy stores: owner-less, assignment only by admin
    def test_70_legacy_stores(self):
        d = padali.sqlite3.connect(padali.DB)
        self.assertEqual(d.execute("SELECT COUNT(*) FROM stores WHERE owner_id IS NULL AND verification_status='approved'").fetchone()[0], 8)
        self.assertEqual(self.admin.post("/api/admin/verification/1/approve", json={}).status_code, 400)   # nothing to verify without an owner
        c = client(); reg(c, "owner4", "owner"); oid = J(c.get("/api/me"))["user"]["id"]
        self.assertEqual(self.o1.post("/api/admin/verification/1/assign-owner", json={"owner_id": oid}).status_code, 403)
        self.assertEqual(self.admin.post("/api/admin/verification/1/assign-owner", json={"owner_id": oid}).status_code, 200)
        c5 = client(); reg(c5, "owner5", "owner"); oid5 = J(c5.get("/api/me"))["user"]["id"]
        self.assertEqual(self.admin.post("/api/admin/verification/1/assign-owner", json={"owner_id": oid5}).status_code, 409)   # store already has an owner
        self.assertEqual(self.admin.post("/api/admin/verification/2/assign-owner", json={"owner_id": oid}).status_code, 400)    # owner already has a store
        self.assertEqual(J(c.get("/api/owner/store"))["store"]["name"], "Aling Nena's Carinderia")
        self.assertGreater(len(J(c.get("/api/owner/feedback"))["feedback"]["store"]), 0)                   # keeps its history
        self.assertEqual(len(J(c.get("/api/owner/menu"))["items"]), 6)

    # 18: migration kept every row
    def test_90_migration_preserved_data(self):
        d = padali.sqlite3.connect(padali.DB)
        for t in ("stores", "menu_items", "orders", "order_items", "reviews", "food_reviews", "delivery_reviews", "favorites"):
            self.assertGreaterEqual(d.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0], BEFORE[t], t)
        self.assertEqual(d.execute("SELECT password_hash FROM users WHERE username='admin'").fetchone(), BEFORE_ADMIN)   # admin untouched
        self.assertEqual([tuple(r) for r in d.execute("SELECT id,user_id,total,status,rider FROM orders WHERE id<=?", (BEFORE_OLD_ORDERS[-1][0],))], BEFORE_OLD_ORDERS)
        self.assertEqual(d.execute("SELECT COUNT(*) FROM users WHERE role='user' AND username IN ('oooo','saysay','mae')").fetchone()[0], 3)
        padali.init_db()                                                                                    # running it again changes nothing
        self.assertEqual(d.execute("SELECT COUNT(*) FROM stores WHERE owner_id IS NULL AND verification_status='approved'").fetchone()[0], 8 - 1)
        self.assertEqual(client().post("/api/login", json={"u": "saysay", "p": "wrong"}).status_code, 401)

if __name__ == "__main__":
    unittest.main()
