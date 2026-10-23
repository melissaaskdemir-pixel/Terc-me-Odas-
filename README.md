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

## v0.2–v0.4

- Okuma çekirdeği: haberde ve Vikipedi'de sık geçen 687 kelime; normal yazma kartı olarak günün setine ve turlara girer, her kartta gerçek örnek cümle ve sesi
- Okuma: uyarlanmış ve özgün paragraflar, cümle sesleri, kelimeye dokununca sözlük
- Sözlük: internetsiz arama, çekim tabloları, sıklık sırası
- Kapsam: kelime dağarcığı tahmini ve testi
- YDS: üretilmiş denemeler, serbest soru çözme ve açıklamalı alıştırma bankası, kalem ve silgi
- Önekler: 20 öneğin anlamları, 31 kök ailesi (294 kart), kurallar
- Ses: dikte (kelime kelime puan, imla defteri); insan sesi kaynağı Tatoeba gönüllülerinin kayıtları
- Yazma: biçim, sade → resmî ve çeviri kartları
- Gramer haritası: A1–C2 konu iskeleti, madde madde işaretleme

## Yapı

- `index.html`, `css/`, `js/`: uygulama (derleme adımı yok)
- `js/i18n/tr.js`: arayüz metinleri (ileride başka diller için ayrı dosya)
- `data/kendi.json`: kendi kartlar; `data/cekirdek.json`: okuma çekirdeği; `data/morph.json`: çekim verisi
- `audio/a/`: Aidar sesleri
- `sw.js`: internetsiz çalışma için servis çalışanı

## Kaynaklar ve lisanslar

- Çekimler: OpenCorpora sözlüğü (pymorphy3 ile), CC BY-SA
- Vurgu: OpenRussian sözlüğü, CC BY-SA
- Okuma çekirdeği (data/cekirdek.json): kelime listesi Leipzig Corpora Collection (rus_news_2022_100K, rus_wikipedia_2021_100K) üzerinde sayıldı; örnek cümlelerin çoğu Rusça Vikipedi'den alındı (CC BY-SA 4.0), bu yüzden dosya da CC BY-SA 4.0'dır. Türkçe anlamlar, çeviriler ve 'örnek' etiketli cümleler bu projenin.
- Ses: Silero TTS v5.4, ticari olmayan kullanım (CC BY-NC-SA 4.0)
- Dikte insan sesi: Tatoeba (https://tatoeba.org) gönüllülerinin kayıtları; cümleler CC BY 2.0 FR, sesler okuyanın lisansıyla (CC BY 4.0, CC BY-NC 4.0, CC0 1.0). Okuyanlar: fjay69, Inego, EugeneGS, retr0ra1n, Shady_arc, Alex_M, namikiri, lovermann. Her klibin okuyanı, lisansı ve cümle numarası data/insan.json içinde ve uygulamada cümlenin altında. Sesler kırpıldı, ses düzeyi eşitlendi ve AAC'ye dönüştürüldü.
- Yazı tipleri: ParaType PT Serif, PT Sans, PT Mono, SIL Open Font License 1.1 (fonts/OFL.txt)
