# Atoyo ERP + CRM

Kompyuter va komplektlovchi buyurtmalarini boshqarish tizimi ("Ombor CRM" jarayoni) va unga ulangan ERP: kataloglar, ombor, savdo, xarid, moliya, hisobotlar.

Muallif: [Abdullohkhan](https://t.me/Abdulloh_77700) · [abdulmajidsharipovlc@gmail.com](mailto:abdulmajidsharipovlc@gmail.com)

## Tuzilma (monorepo)

```
backend/    NestJS 12 + Prisma 7 + PostgreSQL — REST API (/api), JWT, rollar, biznes jarayon
frontend/   React 19 + Vite 8 + MUI 9 + Redux Toolkit — interfeys (uz / ru / en, dark / light)
docs/       ROLES.md (rollar va jarayon), API.md (endpointlar), BACKEND.md (arxitektura)
docker-compose.yml   PostgreSQL + API + nginx (frontend)
```

## Tez ishga tushirish (Docker)

```bash
cp .env.example .env        # parollar va maxfiy kalitlarni o'zgartiring
docker compose up --build   # http://localhost:8080
```
Birinchi ishga tushishda `SEED_OWNER_USERNAME` / `SEED_OWNER_PASSWORD` bilan **Owner** yaratiladi.

## Dasturchi uchun (lokal)

Kerak: Node.js 22+, PostgreSQL 16.

```bash
npm install
cp backend/.env.example backend/.env      # DATABASE_URL, JWT_* ni sozlang
npm run build -w backend && npm run db:setup   # migratsiya + seed (rollar, owner, demo ma'lumot)
npm run dev                                    # API :3001 + frontend :5173 (Vite /api ni proksi qiladi)
```

| Buyruq | Nima qiladi |
|---|---|
| `npm run dev` | backend (watch) + frontend birga |
| `npm test` | backend e2e (alohida test bazasi, `backend/.env.test`) + frontend unit testlar |
| `npm run lint` | ESLint + TypeScript ikkala qismda |
| `npm run build` | production build |
| `npm run db:migrate:dev -w backend` | sxema o'zgarganda yangi migratsiya |

Swagger: `http://localhost:3001/api/docs`.

### Demo hisoblar (`SEED_DEMO` yoqilganda, parol `Demo12345`)

`admin`, `director`, `seller1` (sotuvchi), `engineer` (injener), `declarant` (deklarant), `supply` (ta'minotchi), `accountant` (buxgalter), `storekeeper` (omborchi), `driver1` (haydovchi). Owner: `owner` / `.env` dagi parol.

## Asosiy jarayon — zayavka

Sotuvchi zayavka ochadi → **injener** konfiguratsiya qiladi (katalogda yo'q tovar qizil) → **deklarant** TN VED, boj, QQS, sertifikat, logistika bilan tannarxni hisoblaydi → **narx ko'rib chiqiladi** (ustama) → **buyurtmachi tasdiqlaydi** → **shartnoma** (shablondan, PDF/chop etish) → **avans** (standart 30%, kelmaguncha ish boshlanmaydi, buxgalter tasdiqlaydi) → **ta'minot** (yetkazuvchi, haqiqiy narx, logistika) → **buxgalter tasdiqlaydi** → **omborga qabul** → **injener ombordan olib yig'adi** → **dalolatnoma (akt)** → **yetkazib berish** (haydovchi, transport, yo'l varaqasi).

Hujjatlar (shartnoma, akt, to'lov hisobi, yo'l varaqasi) serverda **PDF** bo'lib yaratiladi (pdfmake, brauzersiz); summa so'z bilan (`{{amountInWords}}` o'zbekcha, `{{amountInWordsRu}}` ruscha). Imzolangan skan (PDF/JPG/PNG) yuklanadi va diskda saqlanadi (`UPLOAD_DIR`, `UPLOAD_MAX_MB`). Konfiguratsiya tasdiqlanganda ombordagi qismlar zayavkaga **band qilinadi** — boshqa zayavka yoki savdo ularni ololmaydi.

Har bosqichda faqat mas'ul rol amal bajaradi; bosqich o'zgarganda o'sha rol xodimlariga bildirishnoma boradi. Injener narxlarni umuman ko'rmaydi. Batafsil: [docs/ROLES.md](docs/ROLES.md).

## Rollar

Owner — eng yuqori rol: barcha ruxsatlar unda va faqat u **Boshqaruv → Rollar va ruxsatlar** sahifasida boshqa rollarning ruxsatlarini o'zgartira oladi, yangi rol yarata oladi. Qolgan rollar: Admin, Direktor, Sotuvchi, Injener, Deklarant, Ta'minotchi, Buxgalter, Omborchi, Haydovchi.

## Xavfsizlik

- Parollar bcrypt bilan, refresh token SHA-256 bilan saqlanadi; access token 15 daqiqa, refresh 7 kun (rotatsiya).
- Har bir endpoint ruxsat bilan himoyalangan; narx/tannarx ruxsati yo'q foydalanuvchiga **server** yubormaydi.
- Ombor, qarz, faktura o'zgarishlari bitta tranzaksiyada; qoldiq qatorlari `FOR UPDATE` bilan bloklanadi (band qilishda ham).
- Injener va haydovchi narx/tannarxni ko'rmaydi (server javobida yo'q); haydovchi faqat o'ziga biriktirilgan yetkazishlarni ko'radi.
- Yuklangan skan: tur fayl mazmunidan tekshiriladi, hajm cheklangan, nomi server tomonidan generatsiya qilinadi; yuklab olish ruxsat bilan.
- Login urinishlari cheklangan (5 ta xato → 5 daqiqa), Helmet, CORS, audit jurnali.
