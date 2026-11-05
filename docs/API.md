# API

Asos: `/api`. Avtorizatsiya: `Authorization: Bearer <accessToken>`. Swagger: `/api/docs`.
Xatolar: `{ statusCode, message }` (400 validatsiya/biznes qoida, 401, 403 ruxsat yo'q, 404, 409 takror/bog'liq yozuv).

| Metod | Yo'l | Ruxsat | Izoh |
|---|---|---|---|
| POST | `/auth/login` | — | `{username,password}` → `{accessToken, refreshToken, user}` |
| POST | `/auth/refresh` | — | `{refreshToken}` (rotatsiya) |
| POST | `/auth/logout`, `/auth/change-password` | login | |
| GET | `/auth/me` | login | foydalanuvchi + ruxsatlar |
| GET/POST/PATCH/DELETE | `/users` | `users.view` / `users.manage` | |
| GET | `/roles`, `/permissions` | `roles.view` | |
| POST/PATCH/DELETE | `/roles` | `roles.manage` (Owner) | |
| CRUD | `/products`, `/customers`, `/suppliers`, `/employees`, `/warehouses` | `*.view` / `*.manage` | `costPrice` faqat `costs.view` bilan; `price` narx ruxsati yo'q (injener) foydalanuvchiga yuborilmaydi |
| GET | `/stock-balance`, `/movements` | `stock.view` | |
| POST | `/movements` | `stock.move` | `{type: transfer|writeoff, fromWarehouseId, toWarehouseId?, productId, qty}` |
| GET/POST | `/sale-orders` | `sales.view` / `sales.create` | `{customerId, warehouseId, items:[{productId,qty,price}], confirm}` |
| POST | `/sale-orders/:id/confirm` · `/cancel` | `sales.confirm` · `sales.cancel` | |
| GET/POST | `/purchase-orders` (+ `/:id/confirm`, `/:id/cancel`) | `purchases.*` | |
| GET/POST | `/invoices` | `invoices.view` / `invoices.create` | |
| GET/POST | `/payments` | `payments.view` / `payments.create` | mijoz/yetkazuvchi → FIFO taqsimot; `requestId` → zayavka to'lovi |
| GET | `/requests`, `/requests/:id`, `/requests/statuses` | `requests.view` | narxlar ruxsatga qarab olib tashlanadi |
| POST | `/requests` | `requests.create` | |
| POST | `/requests/:id/<amal>` | bosqichga qarab | `take, configuration, submit-configuration, pricing, submit-pricing, review, customer-decision, contract, sign-contract, confirm-advance, procurement, submit-procurement, procurement-decision, receive, issue, return, finish-assembly, act, deliver, cancel, comment` |
| CRUD | `/contract-templates` | `templates.manage` | `{{placeholder}}` lar: `/contract-templates/placeholders` (shu jumladan `{{amountInWords}}` — o'zbekcha, `{{amountInWordsRu}}` — ruscha summa so'z bilan); noma'lum maydon yoki `{{itemsTable}}` yo'q bo'lsa 400 |
| GET | `/contracts`, `/acts` | | `status` (`draft`/`signed`), skan ma'lumoti |
| GET | `/contracts/:id/pdf`, `/acts/:id/pdf` | shartnoma / akt ro'yxati ruxsati | Serverda yaratilgan PDF (pdfmake, Roboto — kirill/lotin) |
| GET | `/requests/:id/invoice` · `/requests/:id/invoice/pdf` | `requests.contract` / `requests.advance` / `payments.view` | To'lov uchun hisob (HTML / PDF), shartnoma bo'lishi shart |
| POST | `/contracts/:id/scan` · `/acts/:id/scan` | `requests.contract` · `requests.act` | `multipart/form-data`, maydon `file`: PDF/JPG/PNG (tur fayl boshidagi baytlar bo'yicha), `UPLOAD_MAX_MB` (413), noto'g'ri tur 415. Skan = imzolangan: qoralama shartnoma CONTRACT bosqichida imzolanadi (qarz yoziladi → ADVANCE_PAYMENT), akt `signed`. Qayta yuklash faylni almashtiradi |
| GET | `/contracts/:id/scan` · `/acts/:id/scan` | ro'yxat ruxsati | Skanni yuklab olish |
| GET | `/deliveries` (`?requestId=&status=`) · `/deliveries/:id` | `deliveries.view` / `requests.deliver` — hammasi; `deliveries.drive` — faqat o'ziga biriktirilgan (boshqasi 404) | Narxsiz: `cost` faqat `costs.view` bilan; tovarlar — nom/soni |
| GET | `/drivers` | `requests.deliver` | Haydovchi bo'la oladigan foydalanuvchilar (`deliveries.drive`) |
| POST | `/requests/:id/deliveries` | `requests.deliver` | Faqat `DELIVERY` bosqichida, bitta ochiq yetkazish: `{driverId? \| driverName, driverPhone?, vehicleNumber?, address, plannedAt?, cost?, notes?}` |
| PATCH | `/deliveries/:id` | `requests.deliver` | Faqat `PLANNED` / `IN_TRANSIT` |
| POST | `/deliveries/:id/status` | `requests.deliver` yoki biriktirilgan haydovchi | `{status: IN_TRANSIT\|DELIVERED\|RETURNED, receivedBy?, comment?}`; `DELIVERED` (`receivedBy` majburiy) zayavkani COMPLETED qiladi; `RETURNED` (sabab majburiy) — yangi yetkazish rejalash mumkin |
| GET | `/deliveries/:id/waybill` · `/waybill/pdf` | yetkazishni ko'ra oladigan | Yo'l varaqasi (narxsiz) HTML / PDF |
| GET | `/notifications` · POST `/notifications/:id/read`, `/notifications/read-all` | login | |
| GET/PUT | `/settings` | login / `settings.manage` | kompaniya, avans %, ustama %, muddat, QQS % |
| GET | `/audit` | `audit.view` | |
| GET | `/health` | — | |
