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
| CRUD | `/contract-templates` | `templates.manage` | `{{placeholder}}` lar: `/contract-templates/placeholders`; noma'lum maydon yoki `{{itemsTable}}` yo'q bo'lsa 400 |
| GET | `/contracts`, `/acts` | | |
| GET | `/notifications` · POST `/notifications/:id/read`, `/notifications/read-all` | login | |
| GET/PUT | `/settings` | login / `settings.manage` | kompaniya, avans %, ustama %, muddat, QQS % |
| GET | `/audit` | `audit.view` | |
| GET | `/health` | — | |
