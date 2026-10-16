# Tercüme Odası

Kişisel Rusça çalışma odası. iPhone'da Safari ile açılıp "Ana Ekrana Ekle" ile uygulama olarak kurulur; kurulduktan sonra internetsiz çalışır.

Adres: https://melissaaskdemir-pixel.github.io/Terc-me-Odas-/

## v0.1

- Masa: günün seti, günlük halka, seri ve seri dondurma, bilinen kelime sayacı, ısı haritası, seri iddiası, Pazartesi brifingi
- Çalış > Kelime: yazarak cevap, Bilmiyorum akışı, ipucu, sola kaydırınca "biliyorum"
- Kart tipleri: kelime, fiil çifti, yönetim (boşluk doldurma), kollokasyon, eş anlamlı serisi, sade → resmî, bağlaç
- Hata sınıflandırıcı: yapı, son ek, imla (OpenCorpora çekim verisiyle)
- FSRS-5 aralıklı tekrar, hedef başarıya göre yeni kart seçimi
- Önceden üretilmiş sesler (Silero, Aidar), internetsiz çalar
- Arşiv: hata defteri, istatistik, haftalık rapor, ayarlar, yedek, kişisel paket içe aktarma

Bakanlık terimleri gibi açık lisanslı olmayan içerik bu sitede yayımlanmaz; kişisel paket dosyasıyla sadece telefona yüklenir.

## Yapı

- `index.html`, `css/`, `js/`: uygulama (derleme adımı yok)
- `js/i18n/tr.js`: arayüz metinleri (ileride başka diller için ayrı dosya)
- `data/kendi.json`: kendi kartlar; `data/morph.json`: çekim verisi
- `audio/a/`: Aidar sesleri
- `sw.js`: internetsiz çalışma için servis çalışanı

## Kaynaklar ve lisanslar

- Çekimler: OpenCorpora sözlüğü (pymorphy3 ile), CC BY-SA
- Vurgu: OpenRussian sözlüğü, CC BY-SA
- Ses: Silero TTS v5.4, ticari olmayan kullanım (CC BY-NC-SA 4.0)
- Yazı tipleri: ParaType PT Serif, PT Sans, PT Mono, SIL Open Font License 1.1 (fonts/OFL.txt)
