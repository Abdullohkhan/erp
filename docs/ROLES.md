# Rollar, ruxsatlar va zayavka jarayoni

Ruxsatlar ro'yxati: `backend/src/auth/permissions.ts` (frontendda nusxasi `frontend/src/app/permissions.ts`).
Rollar bazada saqlanadi; Owner ularni **Boshqaruv → Rollar va ruxsatlar** sahifasida o'zgartiradi.

## Standart rollar

| Rol | Kalit | Asosiy vazifa |
|---|---|---|
| Owner | `owner` | Barcha ruxsatlar (doim), rollar va ruxsatlarni boshqaradi |
| Admin | `admin` | Foydalanuvchilar, kataloglar, sozlamalar; rollarni o'zgartira olmaydi |
| Direktor | `director` | Hammasini ko'radi, narxni tasdiqlaydi, bekor qiladi |
| Sotuvchi | `seller` | Zayavka ochadi, mijoz bilan kelishadi, shartnoma va akt |
| Injener | `engineer` | Konfiguratsiya, ombordan olib yig'ish. **Narx/tannarx ko'rmaydi** |
| Deklarant | `declarant` | TN VED, boj, QQS, sertifikat — tannarx; katalogga mahsulot qo'shadi |
| Ta'minotchi | `procurement` | Yetkazuvchi, haqiqiy narx, logistika; yetkazib berish |
| Buxgalter | `accountant` | To'lovlar, avansni va ta'minot xarajatlarini tasdiqlaydi |
| Omborchi | `storekeeper` | Omborga qabul, ko'chirish, hisobdan chiqarish |

Qoidalar:
- Owner rolini o'zgartirib/o'chirib bo'lmaydi; owner foydalanuvchini faqat owner yarata/o'zgartira oladi; kamida bitta faol owner qoladi.
- Tizim rollarini o'chirib bo'lmaydi (ruxsatlarini o'zgartirish mumkin); yangi rol yaratish mumkin.
- Ruxsat o'zgarsa, foydalanuvchi interfeysi 30 soniya ichida yangilanadi (qayta kirish shart emas).

## Zayavka bosqichlari

| # | Holat | Kim bajaradi (ruxsat) | Amal | Keyingi holat |
|---|---|---|---|---|
| 1 | `NEW` | Injener (`requests.configure`) | Ishga olish (sotuvchi va direktorga "Injener ishlamoqda" bildirishnomasi) | CONFIGURATION |
| 2 | `CONFIGURATION` | Injener | Qismlar ro'yxati (katalogda yo'q → qizil; nomi/kodi katalogdagi mahsulotga aynan teng bo'lsa avtomatik bog'lanadi) | PRICING (sotib olinadigan bo'lsa) yoki REVIEW |
| 3 | `PRICING` | Deklarant (`requests.price`) | Katalogga bog'lash (bir xil nomli qatorlar birga bog'lanadi), TN VED, boj %, QQS %, aksiz %, bojxona yig'imi, sertifikat, laboratoriya, xizmat haqi, logistika → tannarx | REVIEW |
| 4 | `REVIEW` | Direktor (`requests.review`) | Ustama % / qo'lda narx | CUSTOMER_APPROVAL |
| 5 | `CUSTOMER_APPROVAL` | Sotuvchi (`requests.sell`) | Tasdiq / rad (→ REVIEW) | CONTRACT |
| 6 | `CONTRACT` | Sotuvchi (`requests.contract`) | Shablondan shartnoma, imzolash (mijoz qarzi yoziladi) | ADVANCE_PAYMENT |
| 7 | `ADVANCE_PAYMENT` | Buxgalter (`requests.advance`) | To'lov ≥ avans (standart 30%) bo'lsa tasdiqlaydi | PROCUREMENT yoki ASSEMBLY |
| 8 | `PROCUREMENT` | Ta'minotchi (`requests.procure`) | Yetkazuvchi, haqiqiy narx, logistika, boshqa xarajat | PROCUREMENT_APPROVAL |
| 9 | `PROCUREMENT_APPROVAL` | Buxgalter (`requests.approve_procurement`) | Tasdiq / qaytarish | RECEIVING |
| 10 | `RECEIVING` | Omborchi (`requests.receive`) | Omborga kirim (xarid hujjati, yetkazuvchi qarzi, faktura) | ASSEMBLY |
| 11 | `ASSEMBLY` | Injener (`requests.assemble`) | Ombordan olish / qaytarish, yig'ish tugadi | ACT |
| 12 | `ACT` | Sotuvchi (`requests.act`) | Dalolatnoma | DELIVERY |
| 13 | `DELIVERY` | Ta'minotchi (`requests.deliver`) | Yetkazildi (kim qabul qilgani majburiy) | COMPLETED |
| – | istalgan | Direktor (`requests.cancel`) | Bekor qilish (olingan qismlar omborga qaytadi, qarz qaytariladi) | CANCELLED |

Tannarx formulasi (dona): `narx + boj + aksiz + QQS + (bojxona yig'imi + sertifikat + laboratoriya + xizmat + logistika) / soni`, bunda boj = narx×boj%, aksiz = (narx+boj)×aksiz%, QQS = (narx+boj+aksiz)×QQS%.
Sotuv narxi = tannarx × (1 + ustama%). Barcha summalar butun so'mga yaxlitlanadi. Ombordan olinadigan qismlar tannarxi = ombordagi o'rtacha tannarx.
