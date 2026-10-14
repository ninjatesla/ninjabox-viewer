# NinjaBox Viewer — sendMessage testi

Bu sürüm `tiktok-live-connector` içindeki `sendMessage()` yöntemini kullanarak, kullanıcı düğmeye bastığında tek bir canlı yayın yorumu göndermeyi dener.

## Railway Variables
Railway → Project → Service → Variables bölümüne ekle:
- `TIKTOK_LIVE_USERNAME` = `ninjaboxx`
- `TIKTOK_SESSION_ID` = yalnızca `ninjabaris100` hesabının kendi oturumundan alınan session ID
- `TIKTOK_TARGET_IDC` = aynı hesabın `tt-target-idc` cookie değeri
- `EULER_API_KEY` = Euler Stream hesabında oluşturulan API key
- `VIEWER_CONTROL_PASSWORD` = güçlü, benzersiz kontrol şifresi

Gizli değerleri GitHub dosyalarına, sohbet mesajlarına veya ekran görüntülerine koyma. Session ID, hesap oturumunu temsil eden hassas bir bilgidir; sızarsa oturumu kapatıp yenile.

## Kurulum
1. ZIP içindeki dosyaları mevcut `ninjatesla/ninjabox-viewer` deposundaki aynı yollarla değiştir (`package.json`, `server.js`, `public/index.html`) ve README'yi güncelle.
2. Railway otomatik deploy ayarlıysa yeni sürüm dağıtılır.
3. Railway Variables değerlerini ekle ve deployment'ın tamamlanmasını bekle.
4. `/health` adresinde `messageSendingConfigured: true` görünmeli.
5. Siteyi aç, kontrol şifresini ve test yorumunu gir, düğmeye bir kez bas.

## Sınırlar
Bu TikTok'un resmî API'si değildir; TikTok/Euler değişiklikleri nedeniyle çalışmayabilir. Bağlantı ve imzalama üçüncü taraf altyapı kullanabilir. Bu sürüm kullanıcı düğmesine basınca tek yorum gönderir; otomatik yorum döngüsü, otomatik beğeni veya hediye gönderimi içermez.
