Padali - Ordering Management System (Flask + SQLite)

1. python -m venv venv
2. venv\Scripts\activate        (Windows)   |   source venv/bin/activate   (Mac/Linux)
3. pip install -r requirements.txt
4. python app.py
5. Open http://127.0.0.1:5000  (landing page)

SQLite database (oms.db) is created automatically on first run, with 8 pretend stores and 47 dishes already loaded.
An older oms.db still works: it is upgraded automatically (your old dishes are moved into the new stores).

STORES, PHOTOS, SPECIAL REQUEST (new)
  - /menu now shows every store in the area (change AREA at the top of app.py). Tap a store to see its dishes, or search any store/dish.
  - One cart can hold dishes from many stores. Delivery fee is P49 per store.
  - "Special request" on /menu: the customer types any food from any store, with quantity and estimated price. It goes in the cart and
    the order as a special request (admin sees it tagged). The customer is charged the estimate; the rider confirms the real price.
  - Dish photos: on start, photos.py downloads a real photo for each dish from Wikimedia Commons in the background (needs internet).
    Saved in static/img/food/<dish-name>.jpg, credits in static/img/food/CREDITS.txt. Run `python photos.py` to do it manually.
    Wrong picture? Put your own JPG with the same file name there, or paste an image link in Admin > Menu > Photo link.
    No photo yet = the dish icon is shown. Set PADALI_NO_PHOTOS=1 to turn the auto download off.
  - Admin > Menu: every dish now has a Store and an optional Photo link.

Set SECRET_KEY as an environment variable before deploying.

PAGES  (one HTML file + one JS file each, easy to debug)
  URL          template               script (static/js)
  /            landing.html           landing.js
  /login       login.html             common.js, login.js
  /register    register.html          common.js, register.js
  /app         home.html (Overview)   common.js, shell.js, home.js
  /menu        menu.html              common.js, shell.js, menu.js
  /favorites   favorites.html         common.js, shell.js, favorites.js
  /orders      orders.html            common.js, shell.js, orders.js
  /profile     profile.html           common.js, shell.js, profile.js
  /checkout    checkout.html          common.js, shell.js, checkout.js
  /receipt     receipt.html           common.js, shell.js, receipt.js

  _layout.html = shared sidebar, header and cart drawer for all logged-in pages.
  common.js = helpers, shell.js = user/menu/cart/favorites shared by logged-in pages.
  Dark/light switch: theme.js + static/css/switch.css. Styles: style.css (app + auth + dashboard photo bg), landing.css (landing).

ADMIN PANEL
  Log in at /login with   username: admin   password: 123456   (created automatically; it opens /admin)
  /admin            admin_dashboard.html   admin.js, admin_dashboard.js   KPIs, 7-day sales, best sellers, status/type/payment breakdown, recent orders (refreshes every 15s)
  /admin/orders     admin_orders.html      admin_orders.js               all orders, search + filters, change status or cancel, "new order" alert (refreshes every 10s)
  /admin/menu       admin_menu.html        admin_menu.js                 add / edit / delete dishes, switch a dish on or off
  /admin/customers  admin_customers.html   admin_customers.js            registered customers with order count and total spent
  _admin_layout.html = shared admin sidebar/header. Styles: static/css/admin.css. Admin API: /api/admin/* (admin only).
  Change the admin password before deploying (see init_db() in app.py).

UI + FEATURES v2
  - Calmer neumorphism (softer highlights, light/dark), almost no animation. Print-friendly receipt (Print button on /receipt).
  - Stores: star ratings + customer reviews, open/closed badge, sort (Recommended / Top rated / Fastest), category tiles across all stores, "Surprise me".
  - Customers can rate each store after an order is Completed (Orders page). Some sample reviews are pre-loaded.
  - Overview: live order tracker (updates by itself), popular dishes (real best sellers), top rated stores.
  - Checkout: delivery address per order.
  - Admin > Stores (new): add / edit / delete stores, switch open or closed, see rating, dishes and sales per store.
    A closed store cannot receive orders. Admin dashboard has "Sales by store".

UI v3
  - Padali logo is in the sidebar, login/register, landing page, browser tab (favicon) and the printed receipt (static/img/logo-*.png).
  - Background photo is blurred and dimmed, so it is easy on the eyes. Dark mode follows your device until you pick one with the toggle.
  - Dish cards turn into a - 1 + stepper after you add them. Floating cart bar shows items, stores and total. The cart shows how much more you need for SAVE50.

FEATURES v4
  - Live rider tracking: every delivery order gets a pretend rider (name, vehicle, plate, rating) and a map where the rider moves from the store
    to the customer. Shown on Overview, Orders and the receipt. Timing is for demo (Preparing 2 min, On the way 3 min, then Completed) unless the admin changes the status.
  - Padali Rewards: 1 point per P10 on COMPLETED orders. Tiers Bronze / Silver (150 pts) / Gold (400 pts). 100 points = P10 off at checkout. Cancelled orders give the points back.
  - Rider tip (P10/P20/P50) on delivery, schedule an order (now, 30 min, 1 h, 2 h), and customers can cancel an order while it is still Preparing.
  - Admin: rider, tip and scheduled time shown in Orders, and an Export CSV button (opens in Excel / Google Sheets).
  - Background photo is back to normal (no blur).

LIVE MAP OF CANTILAN, SURIGAO DEL SUR (v5)
  - AREA, AREA_CENTER (town center 9.3356, 125.9769) and DELIVERY_RADIUS_KM are at the top of app.py.
  - Real OpenStreetMap map (pmap.js, no library). Needs internet to show the tiles and the road route (free OSRM service). Without internet the markers still show
    and the route is a straight line. OpenStreetMap asks for light use only, so this is fine for a school demo, not for a big public launch.
  - Checkout (Delivery): the customer taps the map or presses "Use my location" to drop a pin. Pins farther than 15 km from the town center are refused.
    The map shows the distance from the store and a rough travel time.
  - Tracking: the rider moves from the store pin to the customer pin along the road route (Overview, Orders, receipt).
  - Admin > Stores: tap the map to place each store's pin. The 8 sample stores are FICTIONAL and their pins are only approximate points near the
    poblacion barangays (Lininti-an, Magosilom), so move them to wherever you want.

UI v6 + PROFILE PHOTO + COMMENTS + PLANNER
  - UI: whole app restyled (style.css rewritten). Still neumorphism, same background photos but sharp (not blurred) and only dimmed a little so
    it is not glaring. NO animation or transition anywhere (a rule at the end of style.css, landing.css and the theme switch has none either).
  - Profile photo: Profile > "Choose from gallery". The browser crops it square and shrinks it (320 px JPEG), the server saves it in
    static/uploads/avatars/ and keeps the path in users.avatar. It shows in the header and next to your comments. "Remove" deletes it.
  - THREE separate comments after an order is Completed (Orders page > "Rate this order"):
      1. Delivery time  (stars + Faster / On time / Took a while + comment)   table delivery_reviews
      2. The food       (stars + comment, for each dish)                      table food_reviews
      3. The store      (stars + comment, for each store)                     table reviews
    Customers read them on the store page (tabs: Store / Food / Delivery time) and on every dish ("read comments" opens a window).
    Some sample comments are pre-loaded. Old databases are upgraded automatically.
  - Admin > Feedback (new): ratings per kind, delivery on-time %, dishes that need attention, customer favorites, peak ordering hours
    (weekday x hour), every comment with Reply (customer sees "Padali: ...") and Delete.
  - WOW feature, Kain Tayo Planner (/planner): the customer enters a budget, how many people and what they crave. Padali builds three plans from
    stores that are open now (cheapest, best rated, barkada mix), counts the delivery fee per store, shows the cost per person and adds the whole
    plan to the cart in one tap. Pure code, no internet needed.

ORDERS TABS + RETURN / REFUND + PAYMENT LOGOS (v7)
  - /orders now has tabs: To pay (cash, pay on arrival) / To ship (paid by card or e-wallet, being prepared) / To receive (out for delivery) /
    Completed / Return/Refund / Cancelled. Each tab shows how many orders it holds.
  - Return / Refund: on a Completed order (within 7 days) the customer taps "Return / Refund", picks Refund only or Return and refund, a reason and
    optional details. The order moves to the Return/Refund tab and shows Requested > Approved > Refunded (or Not approved with the reason).
    Admin > Orders: filter "Return / refund", buttons Approve / Mark refunded / Reject (a reason is required to reject).
    A refunded order is removed from revenue, customer spend and reward points (points used on it are given back).
    Needs new columns on orders (ret_*): added automatically to an older oms.db on start.
  - Payment: e-wallet choices are GCash, Maya, PayPal (logo tiles; GCash/Maya ask for a mobile number, PayPal asks for its email). Card shows a live card preview and the Visa / Mastercard / JCB logos.
    Logo files go in static/img/pay/ (see the README.txt there). Without the files the name shows as a badge.

STORE APPLICATION + STORE OWNER (v8)
  A customer can ask to put their own store on Padali. The admin decides. If approved, the account becomes a Store Owner.
  1. Customer: sidebar > "My Store" (/sell). Fills in store name, type of food, description, address, contact number, optional delivery time and
     permit number, and taps the map for the store pin. Status: Pending / Approved / Rejected (the reason is shown, and they can fix it and apply again).
     They can withdraw a pending application. One pending application at a time, one store per owner, no duplicate store names.
  2. Admin: sidebar > "Applications" (/admin/applications). Sees the details, a map, who the applicant is (orders completed, total spent) and quick
     checks (name free, pin inside the delivery area, permit given, description clear). Approve = the store is created and goes live,
     the applicant's role becomes "owner". Reject = a reason (5+ characters) is required and the applicant reads it.
  3. Store Owner (logs in to /owner, can still order food through "Order food" like a customer):
       /owner           Dashboard: open/closed switch, sales today, orders, active orders, total sales, average order, rating, 7-day sales,
                        best sellers, rating breakdown, tips (empty menu, unanswered comments...) and recent orders
       /owner/store     edit store details and the map pin (the store NAME is locked because orders and comments are linked to it)
       /owner/menu      add / edit / delete dishes, switch dishes on or off (only the owner's own store)
       /owner/orders    orders that include the owner's dishes (only their items and total, no phone and no payment details)
       /owner/feedback  the three kinds of comments about the owner's store (store, food, delivery time), dishes that need attention,
                        customer favorites, delivery on-time %, when customers order (weekday x hour) and a Reply box for every comment
  Rules: an owner can not order from or rate their own store. If the admin deletes an owner's store (Admin > Stores), the owner goes back to a
  normal customer account and may apply again. The 8 sample stores have no owner and are still managed by the admin exactly as before.
  Admin > Stores now shows the owner's name. Admin > Customers also lists owners (they are customers too).
  API: /api/store-application (customer), /api/admin/applications/* (admin), /api/owner/* (owner only, every query is limited to the owner's own store).
  Tests: python -m unittest tests.test_store_applications -v   (uses a copy of oms.db). New files: sell.html/js, owner.js, store.css,
  owner_*.html/js and admin_verification.html/js (these owner_* files were not connected to anything before; they are rewritten).
