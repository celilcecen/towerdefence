import type { Strings } from "./en";

const can = (n: number): string => `${n} can`;

/** Türkçe metinler. Şekli `Strings` tipine uymak zorunda; eksik çeviri derleme hatasıdır. */
export const tr: Strings = {
  locale: "tr",
  languageName: "Türkçe",
  app: {
    title: "Gridlock",
    subtitle: "Son Kristal",
    tagline: "Kuleler aynı zamanda duvar. Canavarları yürüt.",
  },
  home: {
    continue: "Devam et",
    campaign: "Hikâye",
    classic: "Klasik",
    classicHint: "Geçit haritasında orijinal 15 dalga",
    howToPlay: "Nasıl oynanır",
    settings: "Ayarlar",
    stars: (n: number, total: number) => `★ ${n}/${total}`,
    source: "Nasıl yapıldı · GitHub'da kaynak kod",
  },
  map: {
    title: "Hikâye",
    back: "Geri",
    locked: "Kilitli",
    chapter: (n: number) => `Bölüm ${n}`,
    levelLabel: (n: number, name: string, stars: number) =>
      `Seviye ${n}: ${name}, ${stars === 0 ? "henüz kazanılmadı" : `${stars} yıldız`}`,
  },
  briefing: {
    speaker: "Muhafız Ilka",
    start: "Savun",
    back: "Harita",
    waves: (n: number) => `${n} dalga`,
    newThreats: "Yeni tehditler",
    newTools: "Yeni silahların",
  },
  hud: {
    lives: "Can",
    gold: "Altın",
    wave: "Dalga",
    menu: "Menü",
    speed: "Oyun hızı",
    startWave: (n: number) => `${n}. dalgayı başlat`,
    callEarly: (bonus: number) => `Erken çağır +${bonus}a`,
    waveRunning: "Dalga sürüyor",
    nextWave: "Sıradaki dalga",
    waveLabel: (n: number) => `${n}. dalga`,
    boardLabel: "Oyun alanı. Bir kule seç, sonra inşa etmek için bir kareye dokun.",
    buildTowers: "Kule inşa et",
    powers: "Güçler",
    powerReady: "Hazır",
    powerCooldown: (seconds: number) => `${seconds} sn`,
    powerAim: "Nişan almak için alana dokun. İptal için güce tekrar dokun.",
    hotkey: (key: string) => `Kısayol ${key}`,
  },
  hints: {
    pickTower: "Aşağıdan bir kule seç, sonra bir kareye dokunup inşa et.",
    tapTile: "İnşa etmek için boş bir kareye dokun. Yeşil uygun demek.",
    startWhenReady: "Düşmanlar kulelerinin etrafından dolaşır. Hazır olunca dalgayı başlat.",
  },
  panel: {
    label: "Seçili kule",
    close: "Kule panelini kapat",
    title: (name: string, level: number, max: number) => `${name} · seviye ${level}/${max}`,
    next: (text: string) => `Sonraki: ${text}`,
    maxed: "Tamamen yükseltildi",
    upgrade: (cost: number) => `Yükselt · ${cost}a`,
    maxLevel: "En üst seviye",
    sell: (refund: number) => `Sat · +${refund}a`,
    targeting: "Hedefleme",
    targets: { first: "Önde", last: "Arkada", strongest: "En güçlü", closest: "En yakın" },
  },
  stats: {
    damage: (n: number) => `${n} hasar`,
    splash: (n: number) => `${n} alan hasarı`,
    beam: (n: number) => `${n} ışın`,
    pulse: (n: number, slow: number) => `${n} hasar, %${slow} yavaşlatma`,
    chain: (n: number, jumps: number) => `${n} hasar, ${jumps} sekme`,
    range: (n: number) => `menzil ${n}`,
    rate: (perSecond: string) => `${perSecond}/sn`,
    groundOnly: "yalnız kara",
  },
  roles: {
    rapid: "Seri atış",
    area: "Alan hasarı",
    slows: "Çevresini yavaşlatır",
    longPierce: "Uzun menzil, zırh deler",
    pierce: "Zırh deler",
    single: "Tek hedef",
    chain: "Düşmandan düşmana seker",
    artillery: "Uzun menzilli topçu",
  },
  traits: {
    boss: "Boss",
    fast: "Hızlı",
    slow: "Yavaş",
    armored: "Zırhlı",
    basic: "Sıradan",
    flying: "Duvarların üstünden uçar",
    heals: "Dostlarını iyileştirir",
    splits: "Ölünce bölünür",
    lives: (n: number) => `−${can(n)}`,
  },
  pause: {
    title: "Duraklatıldı",
    resume: "Devam et",
    restart: "Seviyeyi yeniden başlat",
    settings: "Ayarlar",
    quit: "Haritaya dön",
    quitClassic: "Menüye dön",
  },
  result: {
    victory: "Zafer",
    defeat: "Yenildin",
    classicWon: (waves: number, lives: number) =>
      `${waves} dalganın hepsi durduruldu, ${can(lives)} kaldı.`,
    classicLost: (wave: number) => `Labirent ${wave}. dalgada düştü.`,
    lost: (wave: number) => `Kristal ${wave}. dalgada düştü. Daha uzun bir labirent dene.`,
    newBest: "Yeni rekor!",
    best: (text: string) => `En iyi: ${text}`,
    bestWon: (lives: number) => `${can(lives)} ile zafer`,
    bestWave: (wave: number) => `${wave}. dalgaya ulaşıldı`,
    starsLabel: (n: number) => `3 üzerinden ${n} yıldız`,
    next: "Sonraki seviye",
    retry: "Tekrar dene",
    map: "Harita",
    menu: "Menü",
    playAgain: "Tekrar oyna",
    campaignComplete: "Hikâye tamamlandı",
  },
  settings: {
    title: "Ayarlar",
    sfx: "Ses efektleri",
    music: "Müzik",
    haptics: "Titreşim",
    language: "Dil",
    auto: "Cihaz dili",
    resetProgress: "Hikâye ilerlemesini sıfırla",
    resetConfirm: "Tüm yıldızlar ve açılan seviyeler silinsin mi? Bu geri alınamaz.",
    resetDone: "İlerleme sıfırlandı.",
    privacy: "Gizlilik politikası",
    close: "Tamam",
    version: (v: string) => `Sürüm ${v}`,
  },
  help: {
    title: "Nasıl oynanır",
    lead: "Canavarlar kırmızı yarıktan yeşil kristaline yürüyor. Onları vurmak ve mümkün olan en uzun yola hapsetmek için kule inşa et.",
    steps: [
      ["Bir kule seç:", "alttaki çubuktan."],
      [
        "Boş bir kareye dokun",
        "ve inşa et. Kuleler duvardır: düşmanlar etraflarından dolaşır, ama yolu asla tamamen kapatamazsın.",
      ],
      ["Dalgayı başlat.", "Kristale ulaşan her düşman can götürür."],
      [
        "Güçlerini kullan:",
        "dalga kontrolden çıkınca. Kendine güveniyorsan dalgaları erken çağırıp bonus altın kazan.",
      ],
    ],
    towers: "Kulelerin",
    enemies: "Düşmanlar",
    keys: "1–6 inşa · Boşluk sıradaki dalga · U yükselt · S sat · P duraklat · F hız · Esc iptal",
    close: "Anladım",
  },
  speakers: {
    ilka: "Muhafız Ilka",
    scout: "Yardımcın Pell",
    tyrant: "Yarık Tiranı",
  },
  coach: {
    next: "İleri",
    gotIt: "Anladım",
    letsGo: "Hadi başlayalım",
    skip: "Eğitimi atla",
    offGuide: "Parlayan kareye inşa et.",
    stepOf: (n: number, total: number) => `${n}/${total}`,
    replay: "Eğitimi ve ipuçlarını tekrar göster",
    replayed: "Eğitim ve ipuçları yeniden gösterilecek.",
    steps: {
      welcome:
        "Canavarlar kırmızı yarıktan çıkıp yeşil kristaline yürüyor. Oraya ulaşan her biri sana can kaybettirir.",
      pick: "Seçmek için Ok kulesine dokun.",
      place: "Şimdi oraya inşa etmek için parlayan kareye dokun.",
      walls:
        "Okların nasıl büküldüğünü gördün mü? Kuleler duvardır. Canavarlar etraflarından dolaşmak zorunda ve uzayan yol kulelerine ateş etmek için daha çok zaman kazandırır.",
      more: "Yolu daha da uzatmak için parlayan karelere iki Ok daha kur.",
      start: "Hazırsın. Gelsinler diye dalgayı başlat düğmesine dokun.",
      watch:
        "Her öldürme altın kazandırır. Kristale ulaşan her canavar can götürür. Dalgayı temizlersen bonus kazanırsın.",
      inspect: "Dalga temizlendi! Şimdi kulelerinden birine dokun.",
      upgrade: "Onu yükselt: daha sert vurur, daha uzağa erişir.",
      finish:
        "İhtiyacın olan her şey bu. Uzun bir labirent kur, hazır olunca dalgaları başlat ve kristali koru.",
    },
    tips: {
      flyer:
        "Uçanlar duvarlarını umursamaz, doğrudan kristale gider. Onları sadece ateş gücü durdurur; rotalarına kule diz.",
      healer:
        "Şifacı yakınındaki her canavarı iyileştirir. Önce onu öldür: bir kuleyi En güçlü'ye ayarla ya da üstüne güç kullan.",
      splitter: "Kuluçkalar ölünce yavrulara bölünür. Alan hasarı ve zincirleme kuleler sürüyü temizler.",
      boss: "Bir boss geliyor. Kristale ulaşırsa bir anda 20 can kaybedersin. Onu yürüt ve elindeki her şeyle vur.",
      power: "Gücün hazır. Önce ona, sonra alana dokun. Güçler yalnızca dalga sürerken dolar.",
      early:
        "Bu dalganın tüm canavarları çıktı. Kendine güveniyorsan bonus altın için sıradaki dalgayı şimdi çağır.",
    },
  },
  dialogue: {
    "c1-crossing": {
      first: "Geliyorlar! Sadece öncüler. Uzun yoldan yürüsünler.",
      brute: "Şu iri olan bir Dev. Zırhı küçük vuruşları siler, Topları ona çevir.",
      last: "Son dalga. Bunu tutarsak Geçit bizim!",
    },
    "c1-fords": {
      fords: "İki sığlıktan birden. Yolların birleştiği yerde bir Ayaz kulesi değerli saniyeler kazandırır.",
      meteor: "Kümeleniyorlar. Meteor tam bunun için!",
      last: "Nehir neredeyse temiz. Son bir hamle.",
    },
    "c1-mill": {
      mill: "Değirmen yolu zaten dolambaçlı. Onlar için daha da kötüleştirelim.",
      warden: "Küçük inşaatçı. Gardiyanım duvarlarını toz edecek.",
    },
    "c2-lake": {
      wisps: "Buzun üstünde Ruhlar! Gölün üstünden dümdüz uçuyorlar!",
      cold: "Soğuk seni kurtarmayacak. Bu dünyada hiçbir şey kurtarmayacak.",
    },
    "c2-pass": {
      mender: "Şu yeşil ışığı görüyor musun? Bir Şifacı. Önce onu öldürmezsen yanında hiçbir şey ölmez.",
      focus: "Önce şifacılar, gerisi kendiliğinden düşer.",
    },
    "c2-gate": {
      harriers: "Zırhlı kanatlar! Şimşekler ve Kuleler, hemen!",
      gate: "Tuttuğun her kapı, düşüşünü daha gürültülü yapar.",
      freeze: "İki Gardiyan. İşler kötüye giderse alanı Buz Kilidi ile dondur.",
    },
    "c3-cinder": {
      brood: "Kuluçkalar! Birini patlatırsan bir sürü fışkırır. Alan hasarıyla vur!",
      forges: "Demirhaneler hâlâ sıcak. Havanlar öfkemizi alanın öbür ucuna taşıyacak.",
    },
    "c3-molten": {
      heat: "Adımına dikkat, buranın zemini erimiş. Onlar için de öyle.",
      burn: "Yan, inşaatçı. Kül Diyarı benim.",
    },
    "c3-keep": {
      keep: "Eski surlar onları tek kapıya yönlendiriyor. O kapıyı mezara çevir.",
      walls: "Duvar mı? Ben bin duvar yıktım.",
      hold: "Kül Diyarı için son an. Dayan!",
    },
    "c4-edge": {
      welcome: "Demek küçük inşaatçı kapıma kadar geldi. Her şeyin kıyısına hoş geldin.",
      split: "İki kristal, her birine iki yol. Hiçbir tarafı sahipsiz bırakma.",
    },
    "c4-spire": {
      center: "İki taraftan da geliyorlar. Kristalin etrafına bir kale kur!",
      spire: "Bütün dünyayı duvarla çeviremezsin.",
    },
    "c4-heart": {
      arrive: "Yeter. Son kristali kendim alacağım.",
      believe: "Izgara Ustası. Kurduğun her labirent seni buraya getirdi. Sana inanıyorum.",
      final: "Yarık'ın önünde diz çök!",
    },
  },
  ending: {
    title: "Yarık kapandı",
    text: "Gökyüzü ölü ovanın üstünde kendini dikti ve Yeşilova'nın kristalleri birer birer yeniden parlamaya başladı. Oradaki yolların hâlâ tuhaf desenlerle kıvrıldığı, çocukların tozun içinde çakıl taşlarından küçük labirentler kurup Izgara Ustası'nın eve dönmesini beklediği söylenir.",
    credits: "Oynadığın için teşekkürler.",
    continue: "Devam",
  },
  errors: {
    "out-of-bounds": "Orası oyun alanının dışında.",
    "not-buildable": "Oraya inşa edemezsin.",
    "occupied-by-enemy": "Yolda bir düşman var.",
    "blocks-path": "Bu labirenti tamamen kapatır. Düşmanların her zaman bir geçişe ihtiyacı var.",
    "game-over": "Oyun bitti.",
    "unknown-tower-type": "Böyle bir kule yok.",
    "unknown-tower": "O kule artık yok.",
    "insufficient-gold": "Yeterli altın yok.",
    "max-level": "Zaten en üst seviyede.",
    "invalid-targeting": "Bilinmeyen hedefleme modu.",
    "wave-in-progress": "Bu dalganın tüm düşmanları çıkana kadar bekle.",
    "no-more-waves": "Bu son dalgaydı.",
    "unknown-power": "Bu güç burada kullanılamaz.",
    "power-not-ready": "Bu güç hâlâ doluyor.",
    "no-wave-active": "Güçler yalnızca dalga sırasında kullanılabilir.",
  },
  towers: {
    bolt: { name: "Ok", summary: "Ucuz ve seri. Her labirentin bel kemiği." },
    cannon: {
      name: "Top",
      summary: "Düştüğü yerdeki herkese hasar veren yavaş gülleler. Uçanları vuramaz.",
    },
    frost: {
      name: "Ayaz",
      summary: "Etrafına soğuk dalgalar yayar, yakındaki her şeyi yavaşlatır.",
    },
    spire: { name: "Kule", summary: "Zırhı delen uzun menzilli ışın." },
    arc: { name: "Şimşek", summary: "Sıkışık düşmanlar arasında seken yıldırım." },
    mortar: {
      name: "Havan",
      summary: "Tüm alana ağır mermiler fırlatır. Uçanları vuramaz.",
    },
  },
  enemies: {
    runner: "Koşucu",
    grunt: "Er",
    brute: "Dev",
    warden: "Gardiyan",
    wisp: "Ruh",
    mender: "Şifacı",
    harrier: "Akıncı",
    brood: "Kuluçka",
    broodling: "Yavru",
    tyrant: "Yarık Tiranı",
  },
  powers: {
    meteor: {
      name: "Meteor",
      summary: "İstediğin noktaya meteor indir. Karadakileri de uçanları da vurur.",
    },
    frostbind: { name: "Buz Kilidi", summary: "Tüm alanı birkaç saniyeliğine dondur." },
  },
  chapters: {
    greenreach: {
      name: "Yeşilova",
      subtitle: "Yarık açılıyor",
      intro:
        "Dün gece Yeşilova'nın üstünde gökyüzü yarıldı. Şafakta Oyuklar yürüyüşe geçmişti bile. Buradan başkente kadar her köy kristali onlar için bir lokma.",
    },
    frostmarch: {
      name: "Ayaz Yaylası",
      subtitle: "Buzun üstünde kanatlar",
      intro:
        "Dağların ötesinde Ayaz Yaylası karın altında sessiz. Oyuklar bizi buraya kadar izledi ve uçmayı öğrendiler.",
    },
    ashlands: {
      name: "Kül Diyarı",
      subtitle: "Yanan yol",
      intro:
        "Kül Diyarı bir zamanlar demirhanelerin ülkesiydi. Şimdi Oyuklar közlerin arasında üreyor ve kuluçkaları biz yakamadan büyüyor.",
    },
    rift: {
      name: "Yarık",
      subtitle: "Yarayı kapat",
      intro:
        "Gökteki yara ölü bir ovanın üstünde asılı. Doğmuş her Oyuk oradan sürünerek çıkıyor ve kalbinde Tiran bekliyor.",
    },
  },
  levels: {
    "c1-crossing": {
      name: "Geçit",
      brief: [
        "Gelebildin, Izgara Ustası. Oyuklar kristalimize hep en kısa yoldan gider.",
        "O yüzden onlara kısa yol bırakma. İnşa ettiğin her kule bir duvar. Onları yürüt, yürürken de vur.",
      ],
      victory: "Geçit sağlam. Ama bunlar sadece öncüleriydi.",
    },
    "c1-fords": {
      name: "İkiz Sığlık",
      brief: [
        "Nehrin iki sığlığından aynı anda geçiyorlar.",
        "Başkent Ayaz kuleleri gönderdi: yolların birleştiği yere koy. Artık bir Meteor'un da var. Önce ona, sonra alana dokun.",
      ],
      victory: "Nehir yeniden berrak. Eski değirmen yolunda devasa bir şey görülmüş.",
    },
    "c1-mill": {
      name: "Eski Değirmen Yolu",
      brief: [
        "Bu orduyu bir Gardiyan yönetiyor. Zırhlı ve yavaş. Kristale ulaşırsa bir anda yirmi can kaybederiz.",
        "Kule tipi zırhı deler. Onları labirentin derinine kur ve o canavarı yürütmeye devam et.",
      ],
      victory: "Gardiyan düştü. Pençelerinde buz vardı. Oyuklar kuzeyden gelmiş.",
    },
    "c2-lake": {
      name: "Donmuş Göl",
      brief: [
        "Ruhlar. Duvarların ve suyun üstünden dümdüz uçarlar, labirentin onları yavaşlatmaz. Sadece ateş gücü yavaşlatır.",
        "Yarıklarından kristale uzanan çizgiyi izle. Şimşek kuleleri sıkışmış her şeyin arasında yıldırım zinciri kurar.",
      ],
      victory: "Göl sakin. Yukarıdaki geçitte bir şey Oyukları hayatta tutuyor.",
    },
    "c2-pass": {
      name: "Solgun Geçit",
      brief: [
        "Şifacılar sürüyle birlikte yürür ve yakınlarındaki her Oyuğu iyileştirir.",
        "Önce onları öldür. Bir kuleyi En güçlü ya da En yakın'a ayarla ve Meteor'unu bir Şifacının etrafındaki kalabalığa sakla.",
      ],
      victory: "Geçit bizim. Sürüyle kuzey arasında yalnızca Buzul Kapısı kaldı.",
    },
    "c2-gate": {
      name: "Buzul Kapısı",
      brief: [
        "Akıncılar: zırhlı uçanlar. Arkalarından iki Gardiyan kapıya geliyor.",
        "Dağ muhafızları bize Buz Kilidi'ni verdi. Tüm alanı dondurur. Her şeyin ters gittiği ana sakla.",
      ],
      victory: "Kapı sağlam. Doğuda buzullar kırmızı kanıyor. Kül Diyarı yanıyor.",
    },
    "c3-cinder": {
      name: "Kor Tarlaları",
      brief: [
        "Kuluçkalar ölünce bir yavru sürüsüne dönüşür. Alan hasarı sürüyü temizler.",
        "Eski demirhaneler hâlâ çalışıyor: Havanlar tüm alana erişir. Uçanları vuramazlar, Şimşeklerini elde tut.",
      ],
      victory: "Tarlalar yine kül oldu, sadece kül. Sürü lav geçidinden akıyor.",
    },
    "c3-molten": {
      name: "Erimiş Geçit",
      brief: [
        "Geçidin köşesinden geliyorlar ve kristale giden yol uzun.",
        "Daha da uzat. Sıcak taşa attıkları her adım ölüme bir adım daha.",
      ],
      victory: "Geçit soğuyor. Kül Diyarı'ndaki son kalemiz kuşatma altında.",
    },
    "c3-keep": {
      name: "Yanan Kale",
      brief: [
        "Eski kale kristalinin etrafında hâlâ ayakta. Surları sürüyü tek bir kapıya yönlendiriyor.",
        "Kapıyı tut ve Yarık'a giden yol sonunda açılsın.",
      ],
      victory: "Onları Yarık'ın kendisine kadar geri sürdük. Her şey orada bitecek.",
    },
    "c4-edge": {
      name: "Yarığın Kıyısı",
      brief: [
        "İki yarık, iki kristal, dört yol. Sürü bölünecek, sen de bölünmek zorundasın.",
        "Labirentlerine güven. Haftalardır labirentten başka bir şey inşa etmedin.",
      ],
      victory: "Kıyı tutuldu. Oyuklar ovanın ortasındaki kulenin etrafında toplanıyor.",
    },
    "c4-spire": {
      name: "Oyuk Kule",
      brief: [
        "Kristalimiz ovanın tam ortasında ve iki taraftan da geliyorlar.",
        "Bir kale inşa et. Artık bütün yollar merkeze çıkıyor.",
      ],
      victory: "Kule sessiz. Geriye yalnızca Yarık'ın kalbi ve orada yaşayan şey kaldı.",
    },
    "c4-heart": {
      name: "Yarığın Kalbi",
      brief: [
        "İşte an geldi, Izgara Ustası. Yarık Tiranı son kristale geliyor.",
        "Düştüğünde içinden dört Dev çıkar, hazır ol. Yarık'ı kapat, Yeşilova adını şarkılarla ansın.",
      ],
      victory: "Yarık kapanıyor. Gökyüzü iyileşiyor. Teşekkürler, Izgara Ustası. Artık dinlen.",
    },
  },
};
