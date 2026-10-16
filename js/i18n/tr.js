// Türkçe arayüz metinleri
export default {
  // sekmeler
  'tab.masa': 'Masa', 'tab.calis': 'Çalış', 'tab.okuma': 'Okuma', 'tab.sozluk': 'Sözlük', 'tab.arsiv': 'Arşiv',

  // kart tipleri
  'type.kelime': 'Kelime', 'type.kalip': 'Kalıp', 'type.baglac': 'Bağlaç', 'type.terim': 'Terim', 'type.cift': 'Fiil çifti',
  'type.yonetim': 'Yönetim', 'type.koll': 'Kollokasyon', 'type.esanlam': 'Eş anlamlı', 'type.register': 'Sade → resmî',

  // çalışma ekranı
  'st.answer': 'Cevap', 'st.close': 'Oturumu kapat', 'st.combo': 'KOMBO ×{n}', 'st.yourAnswer': 'Cevabın', 'st.again': 'Geri geldi',
  'st.new': 'Yeni kart', 'st.dontKnow': 'Bilmiyorum', 'st.hint': 'İpucu', 'st.hintAria': 'İpucu: bir harf daha göster', 'st.send': 'Gönder',
  'st.card': 'Kart', 'st.series': '{s} SERİSİ', 'st.swipe': 'Biliyorsan sola kaydır.', 'st.keyboard': 'Klavye Latin harfte. Rusça klavyeye geç; bu deneme sayılmadı.',
  'st.next': 'Devam', 'st.held': 'Durdu. Devam için Devam\'a bas.', 'st.retype': 'Doğrusunu bir kez yaz', 'st.claim': 'Bence doğruydu',
  'st.typeOnce': 'Bir kez yaz, aklında kalsın', 'st.claimed': 'Bu yazım artık bu kartta doğru sayılacak.',
  'st.partner': 'görünüş çifti', 'st.userAlt': 'senin eklediğin yazım', 'st.youWrote': 'Senin cevabın', 'st.answerIs': 'Cevap',
  'st.correct': 'Doğrusu', 'st.partnerNote': 'Doğru. Bu kartın beklediği biçim: {w}', 'st.gov': 'Yönetim', 'st.pair': 'Görünüş çifti',
  'st.neutral': 'Sade karşılığı', 'st.aspectNote': 'impf.: süreç, tekrar, genel olgu (ne yapıyordu, ne yapar). pf.: tek seferlik, sonuca varan eylem (ne yaptı, ne yapacak).',
  'st.seriesAll': 'Serinin tamamı', 'st.stressWrong': 'Vurgu yanlış', 'st.stressNoted': 'Not alındı; haftalık rapora eklenecek.', 'st.listen': 'Dinle',

  // sonuç etiketleri
  'v.ok': 'DOĞRU', 'v.imla': 'İMLA', 'v.sonek': 'SON EK', 'v.yapi': 'YAPI', 'v.bil': 'BİLMİYORUM',
  'lg.yapi': 'yapı', 'lg.sonek': 'son ek', 'lg.imla': 'imla', 'lg.ok': 'doğru',

  // hata açıklamaları
  'why.tsya': '-тся ile -ться karıştı. Şahıslı fiilde -тся (он занимается), mastarda -ться (заниматься).',
  'why.znak': 'Yumuşatma ya da ayırma işareti (ь, ъ) eksik ya da fazla.',
  'why.double': 'Çift harf hatası (нн / н, сс / с gibi).',
  'why.vowel': 'Ünlü hatası; çoğunlukla vurgusuz hecede. Kelimeyi dinleyip kökünü hatırla.',
  'why.spell': 'Yazım hatası: kelime doğru, harfler yanlış.',
  'why.hyphen': 'Tire ya da bitişik yazım farkı.',
  'why.order': 'Kelimeler doğru, sıra farklı.',
  'why.miss': 'Eksik kelime: {w}',
  'why.extra': 'Fazla kelime: {w}',
  'why.aspect': 'Görünüş çiftinin öteki üyesini yazdın.',
  'why.form': '{t}: {tt}. Gereken {e}: {et}.',
  'why.ending': 'Kök doğru, son ek yanlış.',
  'why.word': 'Farklı bir kelime yazdın.',

  // oturum sonu
  'end.kicker': 'СЕАНС ЗАКРЫТ', 'end.title': 'Oturum tamam', 'end.answers': 'cevap', 'end.acc': 'doğru', 'end.pts': 'puan',
  'end.new': 'yeni kart', 'end.combo': 'en uzun kombo', 'end.ring': 'halka', 'end.errs': 'Hatalar',
  'end.streakOk': 'Seri bugün de sürdü: {n} gün.', 'end.streakNeed': 'Seriyi bugün sürdürmek için {n} kart daha.',
  'end.goal': 'Günlük halka tamamlandı.', 'end.milestone': 'Seri {n} güne ulaştı. Dosya açıldı.', 'end.freeze': 'Bir seri dondurma kazandın (en çok 2).',
  'end.more': '20 kart daha', 'end.empty': 'Bugün gösterilecek kart kalmadı. Halkayı kapatmak için yeni kart hakkını artırabilirsin.', 'end.enough': 'Bugünlük yeter',

  // masa
  'm.freezes': '{n} seri dondurma', 'm.freezeN': '· {n} dondurma',
  'kind.gunun': 'GÜNÜN SETİ', 'kind.mini': 'MİNİ SET', 'kind.tur': 'TUR', 'kind.hata': 'HATA DEFTERİ', 'kind.liste': 'SÖZLÜKTEN', 'm.streakTitle': 'Seri: en az 5 kart çalışılan art arda günler',
  'm.streak': 'Seri {n} gün', 'm.ringLabel': 'Günlük halka {n} / {g}', 'm.known': 'Bilinen kelime',
  'm.knownDelta': '+{n} bu hafta', 'm.learning': '{n} kart öğreniliyor', 'm.openSet': 'Günün setini aç', 'm.continueSet': 'Günün setine devam',
  'm.extraSet': 'Ekstra tur', 'm.cardsLeft': '{n} kart', 'm.plus20': '+20 kart', 'm.plan': 'Bugün: {due} tekrar, {nw} yeni kart hakkı',
  'm.mini': '{n} kartlık mini set: seriyi koru', 'm.ptsToday': 'puan bugün', 'm.acc7': 'doğruluk, 7 gün', 'm.best': 'en uzun seri',
  'm.lKelime': 'Kelime', 'm.lDue': '{n} tekrar', 'm.lOkuma': 'Okuma dosyaları', 'm.lHata': 'Hata defteri', 'm.lHataN': '{n} kart',
  'm.yds': 'YDS tahmini', 'm.ydsNote': 'Son ölçüm: 2021 denemesi. YDS bölümü açılınca (v0.3) bu puan denemelerle güncellenecek.',
  'm.bet': 'Seri iddiası', 'm.betOffer': '7 gün üst üste halkayı kapatırsan bir seri dondurma kazanırsın. Kaybedersen hiçbir şey eksilmez.',
  'm.betStart': 'İddiaya gir', 'm.betConfirm': '7 gün boyunca her gün halkayı kapatmaya var mısın?', 'm.betYes': 'Varım', 'm.betNo': 'Sonra',
  'm.betActive': 'İddia sürüyor', 'm.betRule': 'Her kare bir gün: halka kapandıysa dolar.', 'm.betWon': 'Son iddiayı kazandın; dondurma eklendi.',
  'm.betLost': 'Son iddia kaçtı. Yenisine girebilirsin.', 'm.heat': 'Son 18 hafta', 'm.brief': 'Geçen haftanın brifingi',
  'm.heavy': 'Tekrar yükü halkadan fazla; yeni kartlar kendiliğinden azaldı.',
  'm.installK': 'Uygulama olarak kur', 'm.install': 'Safari\'de Paylaş düğmesine dokun, "Ana Ekrana Ekle"yi seç. Ana ekrandan açınca internetsiz çalışır ve ilerlemen kalıcı olur.',
  'm.installClose': 'Kapat',
  'm.freezeUsed': 'Kaçırılan {n} gün için seri dondurma kullanıldı; serin korundu.',

  // brifing
  'b.week': 'HAFTA', 'b.activity': 'Faaliyet: {n} cevap, {active} aktif gün, halka {goal} gün kapandı.',
  'b.accuracy': 'İlk denemede doğruluk %{p}. Yeni kart: {nw}. Puan: {pts}.',
  'b.errors': 'Kayıplar: yapı {y}, son ek {s}, imla {i}, bilmiyorum {b}.',
  'b.best': 'En verimli gün: {d}, {n} cevap.',
  'b.focus.yapi': 'Bu hafta odak: yapı hataları. Hata defterinden "yapı" kartlarını tekrar et; eksik kelime ve görünüş karışıklığına dikkat.',
  'b.focus.sonek': 'Bu hafta odak: son ekler. Yönetim kartları (+Ins, +Dat, +Gen) öne alınacak.',
  'b.focus.imla': 'Bu hafta odak: imla. Kartı dinleyip yazmak en çok burada işe yarar.',
  'b.focus.none': 'Kayıp yok denecek kadar az. Yeni kart hakkını artırmayı düşünebilirsin.',
  'b.close': 'Tamam',

  // çalış
  'c.kicker': 'ÇALIŞMA DOSYALARI', 'c.title': 'Çalış', 'c.kelime': 'Kelime', 'c.open': 'AÇIK',
  'c.decks': 'Desteler', 'c.types': 'Kart tipi', 'c.tAll': 'Karışık', 'c.tKelime': 'Kelime', 'c.tCift': 'Fiil çifti', 'c.tYonetim': 'Yönetim',
  'c.tKoll': 'Kollokasyon', 'c.tEsanlam': 'Eş anlamlı', 'c.counts': '{due} tekrar bekliyor · {nw} yeni kart · bugün kalan yeni hakkı {allow}',
  'c.start': '{n} kartlık tur başlat', 'c.noNew': 'Bugünkü yeni kart hakkın doldu. İstersen bugüne özel artır.', 'c.extra10': '+10 yeni kart',
  'c.extraAdded': 'Bugün için 10 yeni kart eklendi.', 'c.errs': 'Son hatalarını çalış ({n} kart)', 'c.soon': 'Sıradaki bölümler',
  'c.onek': 'Önekler', 'c.gramer': 'Gramer haritası', 'c.yazma': 'Yazma: çeviri, register, form', 'c.ses': 'Ses: dikte, gölgeleme', 'c.yds': 'YDS',
  'c.soonNote': 'Her bölüm açıldığında tek başına ya da karışık çalışılabilecek.',

  // okuma
  'o.kicker': 'OKUMA ODASI', 'o.title': 'Okuma',
  'o.body': 'Okuma odası bir sonraki sürümde açılıyor. İlk dosya Karadeniz enerji güvenliği.',
  'o.f1': 'Açınca kaldığın paragraf; seçim yok.', 'o.f2': 'Paragraf başına 2–3 ön kelime, en çok 1–2 bilinmeyen.',
  'o.f3': 'Cümle çözücü: iskelet, ortaç öbeği, isim zinciri.', 'o.f4': 'Her cümle Xenia sesiyle; dokunulan kelime Aidar ile.',
  'o.f5': 'Uyarlama metinden haftalar sonra orijinale.',

  // sözlük
  's.kicker': 'SÖZLÜK', 's.title': 'Sözlük', 's.ph': 'Rusça ya da Türkçe ara', 's.info': '{n} kartta arar. İnternetsiz çalışır.',
  's.hits': '{n} sonuç', 's.none': 'Sonuç yok.', 's.note': 'Tam sözlük ve tüm kelimeler için çekim tabloları v0.2\'de geliyor. Şimdilik kart kelimelerinin çekimi gösterilir.',
  's.stNew': 'yeni', 's.stKnown': 'biliniyor', 's.stLearning': 'öğreniliyor', 's.state': 'Durum', 's.dueNow': 'tekrar zamanı geldi',
  's.dueIn': '{n} gün sonra tekrar', 's.close': 'Kapat', 's.study': 'Şimdi çalış',
  'f.inf': 'mastar', 'f.pm': 'geçmiş eril', 'f.pf': 'geçmiş dişil', 'f.pn': 'geçmiş nötr', 'f.pp': 'geçmiş çoğul', 'f.imp': 'emir',
  'f.impp': 'emir çoğul', 'f.m': 'eril', 'f.f': 'dişil', 'f.n': 'nötr', 'f.pl': 'çoğul', 'f.sg': 'tekil',

  // arşiv
  'a.kicker': 'АРХИВ', 'a.title': 'Arşiv', 'a.bkNever': 'Hiç yedek alınmadı. Telefonun silinirse ilerlemen gider.',
  'a.bkOld': 'Son yedek {n} gün önce. Yeni yedek al.', 'a.bkNow': 'Yedeği indir', 'a.bkDot': 'yedek uyarısı',
  'a.tHata': 'Hata defteri', 'a.tStat': 'İstatistik', 'a.tRapor': 'Haftalık rapor', 'a.tAyar': 'Ayarlar',
  'a.eAll': 'Tümü', 'a.hataNote': 'Son 30 günün hataları. Her biri bir kartın hangi biçimde kaçtığını gösterir.',
  'a.studyErrs': 'Bu kartları çalış ({n})', 'a.noErr': 'Bu türde hata yok.',
  'a.sKnown': 'biliniyor', 'a.sLearning': 'öğreniliyor', 'a.sNew': 'henüz görülmedi', 'a.sAnswers': 'toplam cevap', 'a.sAcc7': 'doğruluk, 7 gün',
  'a.sAcc30': 'doğruluk, 30 gün', 'a.sPts': 'toplam puan', 'a.sBest': 'en uzun seri', 'a.sErr30': 'Hata dağılımı, 30 gün',
  'a.sByType': 'Kart tipine göre ilk denemede doğruluk, 30 gün', 'a.sDecks': 'Destelerde görülen kart',
  'a.rNote': 'Son 7 günün raporu. Paylaş ya da kopyala, sonra Claude\'a gönder; hatalarına göre yeni kartlar ve kişisel paket hazırlanır.',
  'a.rShare': 'Paylaş', 'a.rCopy': 'Kopyala', 'a.rCopied': 'Rapor kopyalandı.', 'a.rCopyFail': 'Kopyalanamadı; Paylaş\'ı dene.',
  'a.gGoals': 'Hedefler', 'a.halka': 'Günlük halka', 'a.halkaSub': 'günde cevap sayısı', 'a.yeni': 'Yeni kart', 'a.yeniSub': 'günde en çok',
  'a.gDecks': 'Desteler', 'a.deckSub': '{n} kart · yeni kart payı',
  'a.gSound': 'Ses', 'a.autoplay': 'Cevaptan sonra seslendir', 'a.rate': 'Konuşma hızı', 'a.voice': 'Kelime sesi', 'a.voiceSub': 'Xenia okuma odasıyla gelecek',
  'a.sfxStamp': 'Mühür sesi', 'a.sfxPaper': 'Kâğıt sesi', 'a.sfxType': 'Daktilo sesi',
  'a.gLook': 'Görünüm', 'a.theme': 'Tema', 'a.thDark': 'Karanlık', 'a.thPaper': 'Kâğıt', 'a.thAuto': 'Otomatik',
  'a.anim': 'Animasyonlar', 'a.animSub': 'kapalıyken mühürler anında belirir', 'a.advance': 'Doğru cevaptan sonra geçiş',
  'a.gAudio': 'Ses paketleri', 'a.audioNote': 'Sesler çalındıkça kendiliğinden saklanır. Metroda tümü hazır olsun istersen Wi-Fi\'dayken indir.',
  'a.dl': 'İndir', 'a.dlDone': 'İndirildi', 'a.dlOk': 'Sesler indirildi; internetsiz çalar.', 'a.dlFail': '{n} ses indirilemedi; sonra yeniden dene.',
  'a.gBackup': 'Yedek', 'a.bkNeverShort': 'Henüz yedek yok.', 'a.bkLast': 'Son yedek {n} gün önce.', 'a.restore': 'Yedekten geri yükle',
  'a.bkDone': 'Yedek hazır. Dosyalar\'a kaydettiğinden emin ol.', 'a.badFile': 'Bu dosya Tercüme Odası yedeği değil.',
  'a.restoreQ': '{d} tarihli yedek yüklenecek. Şimdiki ilerlemenin yerini alır.', 'a.restoreYes': 'Yükle', 'a.cancel': 'Vazgeç',
  'a.gPacks': 'Kişisel paketler', 'a.packNote': 'Bakanlık terimleri, YDS soruları ve basın metinleri gibi içerikler sitede yayımlanmaz; Claude\'un gönderdiği paket dosyasıyla sadece bu telefona yüklenir. Sesler paketin içindedir, internetsiz çalar.',
  'a.packImport': 'Paket içe aktar', 'a.packSub': '{n} kart · {s} ses · {d}', 'a.packReading': 'Paket okunuyor…', 'a.packDelQ': '"{a}" paketi silinsin mi? Kart ilerlemesi yedekte kalır.',
  'a.del': 'Sil', 'a.packOk': '"{a}" eklendi: {n} kart.', 'a.packBad': 'Paket okunamadı.',
  'a.gApp': 'Uygulama', 'a.versions': 'Uygulama {a} · içerik {c} · kayıt: {p}', 'a.persistOk': 'kalıcı', 'a.persistNo': 'geçici (gizli sekme?)',
  'a.update': 'Güncellemeleri denetle',
  'a.about': 'Kelime verisi: Melisa\'nın çalışma dosyaları ve Dışişleri Bakanlığı terminoloji listeleri. Çekimler: OpenCorpora (pymorphy3). Vurgu: OpenRussian (CC BY-SA). Ses: Silero TTS (ticari olmayan kullanım). Yazı tipleri: ParaType PT Serif, PT Sans, PT Mono (OFL).',

  // güncelleme ve hatalar
  'u.ready': 'Yeni sürüm hazır. Arşiv > Ayarlar > Güncellemeleri denetle.', 'u.none': 'Servis çalışanı yok.', 'u.latest': 'En güncel sürümdesin.',
  'u.offline': 'İnternet yok; sonra dene.',
  'err.render': 'Bu ekran açılırken bir hata oldu.', 'err.load': 'İçerik yüklenemedi. İlk açılışta internet gerekir.',
};
