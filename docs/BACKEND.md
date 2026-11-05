# Backend arxitekturasi

- **NestJS 12 (ESM)**, `backend/src`:
  - `auth/` — JWT (access + refresh), global `AuthGuard` (token + `@Perm()`), ruxsatlar katalogi va standart rollar.
  - `users/` — foydalanuvchilar va rollar (owner qoidalari).
  - `catalog/` — 5 ta katalog uchun umumiy CRUD (zod validatsiya, tannarxni yashirish).
  - `stock/` — barcha qoldiq o'zgarishlari `StockService.apply()` orqali (`SELECT … FOR UPDATE`, yetmasa xato, o'rtacha tannarx).
  - `finance/` — savdo/xarid tasdiqlash va bekor qilish, faktura, to'lov FIFO taqsimoti.
  - `requests/` — zayavka jarayoni (`workflow.ts` holatlar va mas'ullar, `pricing.ts` tannarx formulasi, `requests.service.ts` amallar), bildirishnomalar.
  - `documents/` — shartnoma shablonlari, HTML render (`{{placeholder}}`, qiymatlar escape qilinadi), shartnoma va akt ro'yxatlari;
    `amount-words.ts` — summa so'z bilan (o'zbek lotin / rus, butun so'm); `pdf.ts` — HTML → pdfmake konverter va server PDF
    (brauzer/Chromium yo'q, Roboto TTF: kirill + lotin; `ʻ` → `‘`); `scans.ts` — imzolangan skanlar diskda (`UPLOAD_DIR`, `UPLOAD_MAX_MB`, tur magic bytes bo'yicha, generatsiya qilingan nom).
  - `deliveries/` — yetkazish yozuvlari, haydovchi (faqat o'zinikini ko'radi), yo'l varaqasi, holatlar; logistika xarajati zayavka tannarxiga qo'shiladi.
  - `system/` — sozlamalar, bildirishnomalar, audit, health.
  - `common/` — Prisma, xatolar filtri (Prisma xatolari → 404/409), Decimal → son, zod pipe, hujjat raqamlash (`Counter`), audit.
- **Prisma 7 + PostgreSQL**: `backend/prisma/schema.prisma`, migratsiyalar `prisma/migrations`, seed `prisma/seed.ts` (idempotent).
- Pul: `Decimal(18,2)`, miqdor: `Decimal(18,3)`; JSON'da son bo'lib qaytadi.
- Har bir biznes amal bitta tranzaksiya; zayavka qatori ham `FOR UPDATE` bilan bloklanadi.
- **Ombor zaxirasi**: konfiguratsiya tasdiqlanganda ombordagi qatorlar `StockBalance.reservedQty` ga band qilinadi (`RequestItem.reservedQty` — qator bo'yicha);
  mavjud = `qty − reservedQty`, savdo / hisobdan chiqarish / boshqa zayavka faqat mavjuddan oladi. Qoldiq qatorlari `FOR UPDATE` bilan `productId` tartibida bloklanadi (deadlock yo'q).
  Xariddan qabul qilingan tovar ham band; yig'ishda band → chiqim, qaytarishda qayta band; bekor qilishda band yechiladi.
- Testlar: `backend/test/*.e2e.ts` (node:test + supertest) alohida test bazasida to'liq jarayonni rollar bilan o'tkazadi (zaxira raqobati, PDF, skan, yetkazish);
  `backend/test/*.test.ts` — unit testlar (summa so'z bilan).
