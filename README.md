# راه‌اندازی سایت روی Railway (پورت 8080)

همه‌ی فایل‌ها کنار هم در همین یک پوشه هستند و هیچ پوشه‌ی دیگری داخلش نیست.

## آپلود در GitHub
1. یک ریپازیتوری جدید در GitHub بسازید.
2. گزینه‌ی **Add file → Upload files** را بزنید.
3. **همه‌ی فایل‌های داخل این پوشه** را با هم انتخاب کنید و بکشید داخل صفحه، بعد **Commit changes**.

## اتصال به Railway
1. **New Project → Deploy from GitHub repo** و ریپازیتوری را انتخاب کنید.
2. بعد از اتمام Build، در **Settings → Networking → Generate Domain** پورت را **8080** وارد کنید.

## بررسی سلامت
آدرس `/health` باید متن `ok` برگرداند.

## اطلاعات تماس
در فایل `index.html` عبارت `const CONFIG` را پیدا کنید و مقادیر را پر کنید (phone، email، address، hours، whatsapp، instagram، telegram). تا وقتی خالی هستند، در سایت نمایش داده نمی‌شوند.
