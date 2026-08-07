/**
 * SLD V3 — typografia i deterministyczny pomiar tekstu (SLD_CAD_SPEC_V3 §2, P7).
 *
 * Layout NIE mierzy tekstu w DOM — używa deterministycznej formuły (jedna
 * prawda dla buildu, testów node'owych i renderu), żeby ten sam ENM dawał
 * identyczną geometrię wszędzie. Formuła skalibrowana dla sans-serif
 * (średnia szerokość glifu ≈ 0.62 × fontSize; cyfry/wielkie litery szersze —
 * współczynnik obejmuje typowe etykiety energetyczne PL).
 */

export type LabelClass = 't1' | 't2' | 't3' | 't4';

/**
 * KD-11 (regresja użytkowa z oględzin odbioru KD-8) — KLASA ZNACZENIOWA
 * etykiety, ROZŁĄCZNA od klasy typograficznej (`LabelClass`).
 *
 * DLACZEGO OSOBNE POJĘCIE. Po podniesieniu progu czytelności 6 → 9 px (KD-8
 * poz. 5) rysunek rozwiniętego GPZ przy kadrze „Dopasuj widok" nie niósł
 * ŻADNEGO podpisu („Ukryto 35 opisów"). Rysunek techniczny bez TOŻSAMOŚCI
 * elementów (nazwa transformatora, napięcie szyny/sekcji, nazwa źródła,
 * oznaczenie pola) jest bezużyteczny — nie da się z niego odczytać, CO się
 * rysuje. Poprzedni stan (próg 6 px) był zły inaczej: nieczytelna zbitka
 * wszystkiego. Rozstrzygnięcie: dwie klasy z OSOBNYMI regułami widoczności.
 *
 *  - `'tozsamosc'` — nazwa elementu, napięcie szyny/sekcji, oznaczenie pola,
 *    nazwa źródła/stacji. Widoczna wszędzie tam, gdzie widoczny jest jej
 *    element; poniżej progu czytelności renderowana w rozmiarze MINIMALNYM
 *    czytelnym (skalowana niezależnie od kamery — jak minimalny rozmiar
 *    symboli `MIN_SYMBOL_SCREEN_PX`), a NIE ukrywana.
 *  - `'dane'` — parametry (Yd11, uk%, Pk, przekroje, długości, nastawy) i
 *    adnotacje. Podlegają progowi czytelności jak dotąd (ukrywanie z
 *    licznikiem „Ukryto N opisów", który liczy WYŁĄCZNIE tę klasę).
 *
 * Klasa jest DANĄ SCENY (deklarowaną przez wytwórcę etykiety w
 * `compose/*`/`layout/labels.ts`), nigdy nie jest zgadywana z TREŚCI tekstu —
 * dwa wiersze tej samej klasy typograficznej mogą mieć różne klasy znaczeniowe
 * (np. `t2`: „SN systemowe 110 kV" = nazwa źródła = tożsamość, „Yd11 · 25 MVA"
 * = parametry = dane).
 */
export type LabelRole = 'tozsamosc' | 'dane';

export interface LabelTypography {
  readonly fontSize: number;
  readonly fontWeight: number;
  /**
   * PROPORCJE (zgłoszenie właściciela 2026-08-07 „brak proporcji, grubości") —
   * SUFIT POWIĘKSZENIA AWARYJNEGO: ile razy pismo tej klasy wolno powiększyć
   * ponad rozmiar naturalny, gdy kamera zeszła poniżej progu czytelności
   * (`minReadableFontSize`). Patrz `enlargedFontSizeWithinProportion`.
   *
   * DLACZEGO SUFIT MUSI ISTNIEĆ (pomiar, nie przypuszczenie). Powiększenie
   * awaryjne jest KOMPENSACJĄ: przypina napis do `MIN_READABLE_LABEL_SCREEN_PX`
   * na ekranie, podczas gdy RYSUNEK kurczy się razem z kamerą. Stosunek
   * napis:symbol rośnie więc jak 1/skala i nie ma żadnego ograniczenia. Pomiar
   * na fixturze 53 stacji (`scripts/pomiar_proporcje.tsx`, stan PRZED):
   * oznacznik aparatu (t4, 8 j.św.) obok symbolu 24 j.św. daje stosunek 0,33
   * przy pracy z bliska, ale **2,82** przy skali dopasowania i **7,50** przy
   * dolnym krańcu zoomu; nazwa stacji (t1, 13 j.św.) obok zwiniętego bloku
   * 48 j.św. — 1,39 przy dopasowaniu i **3,75** przy `MIN_SCALE`. Właściciel
   * zmierzył okiem „napis 3–4× wyższy od symbolu, który opisuje" — to jest ta
   * sama liczba.
   *
   * SKĄD KONKRETNE KROTNOŚCI. Typografia (13/11/9/8) i gabaryty glifów
   * (48/32/24/16) były dobierane RAZEM — naturalny stosunek napis:obiekt każdej
   * klasy leży w paśmie 0,27…0,38, czyli około 1:3. Sufit stawiamy tam, gdzie
   * napis przestaje być „mniejszy albo porównywalny" z tym, co opisuje
   * (kanon rysunku wykonawczego, IEC 60617 / rysunek jednokreskowy SN):
   * **stosunek napis:najmniejszy opisywany obiekt ≤ 1,5**. Stąd, per klasa:
   *
   *   t1 → 5,5× (13 → 71,5 j.św.; wobec zwiniętego bloku stacji 48 → **1,49**)
   *   t2 → 4,0× (11 → 44 j.św.;   wobec symbolu DER 32 → **1,38**)
   *   t3 → 3,5× ( 9 → 31,5 j.św.; wobec symbolu aparatu 24 → **1,31**)
   *   t4 → 3,0× ( 8 → 24 j.św.;   wobec symbolu aparatu 24 → **1,00**)
   *
   * Sufit NIE dotyczy pracy z bliska: powyżej progu czytelności pismo ma
   * rozmiar NATURALNY i rośnie razem z rysunkiem, więc stosunek napis:symbol
   * jest tam stały (zmierzone 0,33–0,38 od skali 1,0 do `MAX_SCALE` — hipoteza
   * „im głębszy zoom, tym bardziej litery przygniatają rysunek" jest POMIAREM
   * OBALONA; proporcje pękają w drugą stronę, przy oddalaniu).
   */
  readonly maxEnlargement: number;
}

/** Jedyne dozwolone klasy typograficzne rysunku (spec §2). */
export const LABEL_TYPOGRAPHY: Readonly<Record<LabelClass, LabelTypography>> = {
  // nazwy stacji / GPZ — opisują BLOK (zwinięty glif stacji 48 j.św. na L0)
  t1: { fontSize: 13, fontWeight: 700, maxEnlargement: 5.5 },
  // parametry: kVA, typ·przekrój·długość, kV — najmniejszy opisywany: DER 32 j.św.
  t2: { fontSize: 11, fontWeight: 600, maxEnlargement: 4 },
  // podpisy portów (kier./odg.), oznaczenie pola — najmniejszy opisywany: aparat 24 j.św.
  t3: { fontSize: 9, fontWeight: 700, maxEnlargement: 3.5 },
  // adnotacje i oznaczniki aparatu (Q/QE/T/F) — opisują symbol aparatu 24 j.św.
  t4: { fontSize: 8, fontWeight: 600, maxEnlargement: 3 },
};

/**
 * Próg CZYTELNOŚCI pisma w pikselach EKRANU (V12K-218, karta R2-B audytu).
 *
 * Poniżej tej wysokości tekst przestaje być tekstem — staje się szarym pyłem,
 * który zaśmieca rysunek, niczego nie komunikując. Audyt R2 zmierzył, że przy
 * wpasowaniu sieci 52 stacji w kadr 1920 px skala spada do ≈0,17, więc etykieta
 * t1 (13 px świata) ma na ekranie 2,2 px, a t4 — 1,4 px. Dotyczy KAŻDEGO
 * poziomu detalu, bo fit-to-content dużej sieci schodzi poniżej wszystkich
 * progów histerezy LOD (`canvas/camera.ts`), dla których dobierano rozmiary.
 *
 * KD-8 poz. 5 — PRÓG PODNIESIONY 6 → 9 px (ocena właściciela: „opisy przy
 * zoomie rozwinięcia nieczytelne mimo mechanizmu »Ukryto N opisów«").
 * Dawne 6 px było granicą, przy której znak jest jeszcze ROZRÓŻNIALNY JAKO
 * KSZTAŁT — a to za mało: rysunek techniczny ma być CZYTANY, nie oglądany.
 * Przy 6 px etykieta t4 („Sekcja 1 · 15 kV" ma 8 px świata) przechodziła próg
 * już przy skali 0,75, gdzie realnie zlewa się w szary pasek — dokładnie to
 * właściciel zobaczył na zrzucie rozwinięcia GPZ. 9 px to dolna granica, przy
 * której cyfry i wielkie litery polskiego zapisu rysunkowego („15 kV",
 * „Sekcja 1") są rozpoznawalne bez powiększania; nadal ŚWIADOMIE niżej niż
 * komfort czytania łańcuchów parametrów z modelu histerezy (t2 ≈ 11 px ekranu
 * przy wejściu w L2) — tam chodzi o czytanie ciągiem, tu o pojedynczy odczyt.
 *
 * Egzekwowane w WARSTWIE RENDERU (`canvas/SldCanvasV3.tsx`), nie w scenie:
 * scena musi zostać deterministyczna (te same wejścia = ten sam hash), a próg
 * zależy od kamery, która do sceny nie należy.
 */
export const MIN_READABLE_LABEL_SCREEN_PX = 9;

/**
 * S9-7 (audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` C-4) — TWARDA PODŁOGA
 * ODBIORU: żaden napis NARYSOWANY na rysunku nie może mieć na ekranie mniej niż
 * tyle pikseli. Wartość jest PROGIEM WYROCZNI (`sld_v3_acceptance.mjs`
 * `screen_text_floor_probe`), a nie parametrem układu — układ celuje w
 * `MIN_READABLE_LABEL_SCREEN_PX` (9), więc podłoga ma 1 px zapasu i pęka
 * dopiero wtedy, gdy któryś mechanizm PRZESTANIE utrzymywać próg czytelności
 * (a nie wtedy, gdy ktoś przesunie próg o pół piksela).
 *
 * DLACZEGO ODRĘBNA STAŁA. Audyt zmierzył na L0 sieci dużej 114 ze 165 napisów o
 * wysokości 2 px — a mechanizm KD-11 (`canvas/labelLegibility.ts`) DEKLAROWAŁ,
 * że tożsamość nigdy nie spada poniżej progu. Deklaracja bez PRZYPIĘTEJ
 * wyroczni jest fałszywą pewnością (reguła KLASA §4), więc podłoga dostaje
 * własną, mierzalną stałą i własną sondę — osobno dla napisów sceny i dla
 * napisów ramki arkusza (`sheet/Frame.tsx`).
 */
export const MIN_TEXT_SCREEN_PX = 8;

/**
 * S9-7 — rozmiar pisma [px ŚWIATA], przy którym napis ma na ekranie DOKŁADNIE
 * `screenPx` niezależnie od skali kamery. Używane przez napisy APARATU
 * ARKUSZA (ramka, znaczniki stref, podziałka, poziom szczegółu, legenda) —
 * te NIE są treścią rysunku, tylko jego oprawą: mają być tej samej wielkości
 * na ekranie przy każdym zoomie (jak pasek stanu), a nie rosnąć razem z
 * geometrią.
 *
 * ROZRÓŻNIENIE (rozstrzygnięcie karty S9-7, zapisane tutaj, bo tu stoją obie
 * reguły):
 *  - APARAT ARKUSZA → rozmiar STAŁY na ekranie (`screenFixedFontSize`);
 *  - TREŚĆ RYSUNKU (etykiety sceny) → rozmiar naturalny z PODŁOGĄ na ekranie
 *    (`minReadableFontSize`) — rysunek jest artefaktem skalowanym, a podpis
 *    ma nie spaść poniżej czytelności; podnoszenie go PONAD rozmiar naturalny
 *    przy zoomie do środka rozsypywałoby proporcje rysunku technicznego.
 *
 * Skala niewiarygodna (≤0/NaN — viewport 0×0 przed pierwszym pomiarem układu)
 * ⇒ `screenPx` bez kompensacji (parytet z `isLabelReadableAtScale`: brak
 * pomiaru nie jest dowodem niczego).
 */
export function screenFixedFontSize(cls: LabelClass, scale: number): number {
  const naturalny = LABEL_TYPOGRAPHY[cls].fontSize;
  if (!Number.isFinite(scale) || scale <= 0) return naturalny;
  return naturalny / scale;
}

/** S9-7 — długość [px ŚWIATA] dająca na ekranie dokładnie `screenPx`. Ta sama
 *  kompensacja co `screenFixedFontSize`, dla ODSTĘPÓW aparatu arkusza
 *  (odsunięcie znacznika strefy od ramki, długość kreski podziału): gdyby
 *  rosło samo pismo, a odstępy zostały w świecie, napis wchodziłby na ramkę. */
export function screenFixedLength(worldPx: number, scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return worldPx;
  return worldPx / scale;
}

/** Czy etykieta danej klasy jest czytelna przy tej skali kamery [px ekranu na
 *  jednostkę świata]. Skala niewiarygodna (≤0, NaN — np. viewport 0×0 przed
 *  pierwszym pomiarem układu) NIE ukrywa niczego: brak pomiaru nie jest
 *  dowodem nieczytelności. */
export function isLabelReadableAtScale(cls: LabelClass, scale: number): boolean {
  if (!Number.isFinite(scale) || scale <= 0) return true;
  return LABEL_TYPOGRAPHY[cls].fontSize * scale >= MIN_READABLE_LABEL_SCREEN_PX;
}

/**
 * KD-11: czy etykieta ZNIKA przy tej skali. Znika WYŁĄCZNIE klasa `'dane'` i
 * wyłącznie poniżej progu czytelności — tożsamość nie znika NIGDY (jest
 * przeskalowana do rozmiaru minimalnego, patrz `minReadableFontSize`).
 * Jedyne miejsce, które wolno pytać o ukrycie etykiety (warstwa renderu ORAZ
 * licznik „Ukryto N opisów" — jedna prawda, bez dwóch reguł).
 */
export function isLabelHiddenAtScale(role: LabelRole, cls: LabelClass, scale: number): boolean {
  return role === 'dane' && !isLabelReadableAtScale(cls, scale);
}

/**
 * KD-11: rozmiar pisma [px ŚWIATA], w którym etykieta klasy `'tozsamosc'` ma
 * na ekranie dokładnie `MIN_READABLE_LABEL_SCREEN_PX`, gdy jej rozmiar
 * naturalny spadłby poniżej progu. Powyżej progu — rozmiar naturalny
 * (funkcja NIE powiększa etykiet czytelnych; skalowanie jest awaryjne, nie
 * domyślne). Skala niewiarygodna (≤0/NaN) ⇒ rozmiar naturalny, tak jak
 * `isLabelReadableAtScale` — brak pomiaru nie jest dowodem nieczytelności.
 *
 * To jest odpowiednik zasady K11-B dla PISMA: symbol poniżej progu zmienia
 * REPREZENTACJĘ (kamera przełącza LOD), a etykieta tożsamości — ROZMIAR
 * (rysunek bez nazw nie ma czego reprezentować zgrubniej).
 */
export function minReadableFontSize(cls: LabelClass, scale: number): number {
  const naturalny = LABEL_TYPOGRAPHY[cls].fontSize;
  if (!Number.isFinite(scale) || scale <= 0) return naturalny;
  return Math.max(naturalny, MIN_READABLE_LABEL_SCREEN_PX / scale);
}

/**
 * PROPORCJE — JEDYNE wejście planu renderu po rozmiar pisma etykiety
 * TOŻSAMOŚCI: rozmiar [px ŚWIATA] spełniający OBIE granice naraz albo `null`,
 * gdy spełnić obu się nie da.
 *
 * DWIE GRANICE, JEDNO ŹRÓDŁO (reguła KLASA §3 „predykaty parami"). Do tej
 * karty istniała wyłącznie granica DOLNA (S9-7/8: „napis nie mniejszy niż
 * `MIN_READABLE_LABEL_SCREEN_PX` na ekranie, albo go nie ma"), a górnej nie
 * pilnował nikt — powiększenie awaryjne mogło urosnąć bez końca i przy
 * oddaleniu napis przygniatał aparat, który opisuje (pomiar: 2,82× przy
 * dopasowaniu, 7,50× przy `MIN_SCALE` — patrz `LabelTypography.maxEnlargement`).
 * Dwie granice pochodzące z dwóch miejsc rozjeżdżają się przy pierwszej
 * zmianie progu, więc obie mieszkają TUTAJ i wychodzą jedną wartością:
 *
 *   · pismo czytelne w rozmiarze naturalnym            ⇒ rozmiar naturalny;
 *   · nieczytelne, ale kompensacja mieści się w sufic­ie ⇒ rozmiar powiększony
 *     (dokładnie `MIN_READABLE_LABEL_SCREEN_PX` na ekranie);
 *   · nieczytelne i kompensacja przekroczyłaby sufit    ⇒ `null` — etykiety
 *     NIE rysujemy i mówimy o tym wprost (`droppedIdentity` + wskaźnik
 *     „Ukryto N opisów"). Napis czytelny, ale wielkości trzech aparatów obok
 *     siebie, nie jest rysunkiem technicznym — jest szyldem na rysunku.
 *
 * Skala niewiarygodna (≤0/NaN — viewport 0×0 przed pierwszym pomiarem układu)
 * ⇒ rozmiar naturalny (parytet z `isLabelReadableAtScale`: brak pomiaru nie
 * jest dowodem niczego, więc nie odbiera etykiety).
 */
export function enlargedFontSizeWithinProportion(cls: LabelClass, scale: number): number | null {
  const { fontSize: naturalny, maxEnlargement } = LABEL_TYPOGRAPHY[cls];
  if (!Number.isFinite(scale) || scale <= 0) return naturalny;
  const potrzebny = MIN_READABLE_LABEL_SCREEN_PX / scale;
  if (potrzebny <= naturalny) return naturalny;
  // Tolerancja 1e-9: sufit ma być osiągalny DOKŁADNIE na skali granicznej
  // (`MIN_READABLE_LABEL_SCREEN_PX / (naturalny · sufit)`), a nie o epsilon
  // arytmetyki zmiennoprzecinkowej za nią — inaczej granica pary byłaby
  // niedeterministyczna względem drogi dojścia do tej samej skali.
  return potrzebny <= naturalny * maxEnlargement + 1e-9 ? potrzebny : null;
}

/**
 * PROPORCJE — SKALA GRANICZNA klasy [px ekranu na j.św.]: poniżej niej pisma
 * tej klasy nie da się już narysować proporcjonalnie i etykieta tożsamości
 * wypada z rysunku (`enlargedFontSizeWithinProportion` zwraca `null`).
 *
 * Eksportowana, żeby wyrocznie i testy nie musiały odtwarzać tej arytmetyki u
 * siebie (dwie kopie formuły to gotowy rozjazd — ta sama zasada, dla której
 * `labelLegibility.ts` re-eksportuje `MIN_READABLE_LABEL_SCREEN_PX`).
 */
export function proportionCutoffScale(cls: LabelClass): number {
  const { fontSize, maxEnlargement } = LABEL_TYPOGRAPHY[cls];
  return MIN_READABLE_LABEL_SCREEN_PX / (fontSize * maxEnlargement);
}

/**
 * S9-7 (audyt C-6 „Skracanie etykiet do nieczytelności") — SEPARATOR CZŁONÓW
 * etykiety rysunku. Cała gramatyka opisów v3 składa etykietę z CZŁONÓW
 * rozdzielonych tą sekwencją („S07 ↔ S08 · Linia napowietrzna Al 120 mm² ·
 * l = 150 m", „Sekcja 1 · 15 kV", „GPZ Referencyjny 15 kV · 110/15 kV"), a
 * pierwszy człon jest w KAŻDYM przypadku członem ROZRÓŻNIAJĄCYM: relacją
 * przęsła, oznaczeniem sekcji, nazwą stacji/GPZ.
 */
const CZLON_SEPARATOR = ' · ';

/**
 * S9-7 (audyt C-6) — SKRACANIE ZACHOWUJĄCE CZŁON ROZRÓŻNIAJĄCY.
 *
 * DLACZEGO NIE UCINANIE OD PRAWEJ (reguła sprzed tej karty, `fitLabelToWidth`,
 * USUNIĘTA razem z jedynym wołającym). Ucinanie od prawej po glifach robi z
 * „GPZ Referencyjny 15 kV · 110/15 kV" napis „GPZ R…", a z kodu stacji „S…" —
 * audyt zmierzył formy „S1…", „S2…", „S400", „S630", z których dwie ostatnie
 * czyta się jak MOC transformatora, nie jak nazwę stacji. Etykieta skrócona
 * tak, że nie da się z niej wskazać ELEMENTU, jest gorsza niż jej brak: nie
 * informuje, a zajmuje miejsce i udaje daną.
 *
 * REGUŁA (deterministyczna, bez zgadywania treści, NIGDY nie tnie w środku
 * wyrazu — cięcie śródwyrazowe jest źródłem form typu „S400"/„S630"):
 *  1. mieści się w całości ⇒ tekst pełny;
 *  2. inaczej odrzucamy CAŁE człony od KOŃCA, zostawiając zawsze co najmniej
 *     pierwszy — „S07 ↔ S08 · Linia … · l = 150 m" schodzi do „S07 ↔ S08 …",
 *     czyli do relacji, po której element się rozpoznaje;
 *  3. gdy nie mieści się nawet sam pierwszy człon, skracamy go W ŚRODKU z
 *     zachowaniem OGONA ROZRÓŻNIAJĄCEGO („Stacja SN-01" → „S…SN-01"): to jest
 *     przypadek nazwany wprost w karcie — dwadzieścia stacji „Stacja SN-…"
 *     wygląda identycznie, dopiero końcówka je rozróżnia. Ogon = ostatni
 *     wyraz, a gdy ostatnim wyrazem jest JEDNOSTKA MIARY — para „wartość +
 *     jednostka" („15 kV"), bo sama jednostka nie rozróżnia niczego;
 *  4. `…ogon` bez głowy, ale TYLKO gdy ogon nie jest samą parą wartość+
 *     jednostka: „…15 kV" udaje etykietę napięcia, a nie nazwę elementu —
 *     to dokładnie ta klasa pomyłki, którą audyt zmierzył na „S400"/„S630";
 *  5. `wyrazy początkowe …` — CAŁE wiodące wyrazy z wielokropkiem („GPZ …").
 *     Mniej informacji niż ogon, ale nadal prawdziwe słowa nazwy;
 *  6. `fragment…` — dopiero tu wolno przeciąć wyraz, i WYŁĄCZNIE ze znakiem
 *     skrócenia. Wadą z audytu nie jest sam fragment, tylko fragment BEZ ZNAKU
 *     („S400" czytane jak moc transformatora); fragment oznaczony „…" mówi
 *     wprost, że jest skrótem, a alternatywą na tym etapie jest brak podpisu;
 *  7. gdy nie mieści się nawet jeden znak z wielokropkiem ⇒ PUSTY tekst.
 *     Wołający (plan renderu) traktuje pusty wynik jak brak miejsca i etykiety
 *     NIE rysuje — uczciwy brak, policzony we wskaźniku „Ukryto N opisów".
 *
 * OGRANICZENIE NAZWANE: gdy element rozróżnia wyraz ze ŚRODKA nazwy („GPZ
 * *Referencyjny* 15 kV" vs „GPZ *Wschodni* 15 kV"), żadna forma mieszcząca
 * się w kilku glifach go nie przeniesie — wynikiem jest „GPZ …" plus wskaźnik
 * ukrycia. Rozróżnianie po ŚRODKU wymagałoby porównania z resztą zbioru
 * etykiet (wspólny przedrostek), czego ta funkcja świadomie nie robi: byłaby
 * wtedy zależna od sąsiadów, a więc niedeterministyczna względem pojedynczej
 * etykiety.
 *
 * Niezmiennik (przypięty testem `core/__tests__/typografiaEkranowa.test.ts`):
 * `measureTextWidth(wynik, fontSize) ≤ maxWidth` ORAZ każdy wynik różny od
 * tekstu pełnego NIESIE znak skrócenia „…" (nigdy fragment udający całość).
 */
export function shortenPreservingIdentity(text: string, fontSize: number, maxWidth: number): string {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || fontSize <= 0) return text;
  const miesciSie = (kandydat: string): boolean => measureTextWidth(kandydat, fontSize) <= maxWidth;
  if (miesciSie(text)) return text;

  const czlony = text.split(CZLON_SEPARATOR);
  // (2) odrzucanie całych członów od końca — zawsze zostaje co najmniej pierwszy.
  for (let n = czlony.length - 1; n >= 1; n--) {
    const kandydat = `${czlony.slice(0, n).join(CZLON_SEPARATOR)} …`;
    if (miesciSie(kandydat)) return kandydat;
  }

  // Sam pierwszy człon — ZAWSZE ze znakiem skrócenia, nawet gdy mieści się w
  // całości: bez „…" czytelnik nie ma jak odróżnić „S12 · Sekcja 1" (pełna
  // treść) od „S12 · Sekcja 1 · 15 kV" obciętego do dwóch członów. Skrót bez
  // jawnego znaku jest tą samą wadą, co cięcie śródwyrazowe — udaje kompletną
  // daną (kontrakt sprawdzany testem `tozsamoscEtykiet.contract`).
  const pierwszy = czlony[0];
  const pierwszyZeZnakiem = czlony.length > 1 ? `${pierwszy} …` : pierwszy;
  if (miesciSie(pierwszyZeZnakiem)) return pierwszyZeZnakiem;
  const wyrazy = pierwszy.split(' ').filter((w) => w.length > 0);
  if (wyrazy.length === 0) return '';

  // Ogon rozróżniający: ostatni wyraz, a przy jednostce miary — para
  // „wartość + jednostka" (sama „kV" nie rozróżnia niczego).
  const ostatni = wyrazy[wyrazy.length - 1];
  const ogonJestJednostka = JEDNOSTKI_RYSUNKU.has(ostatni);
  const ogon =
    ogonJestJednostka && wyrazy.length >= 3 ? `${wyrazy[wyrazy.length - 2]} ${ostatni}` : ostatni;
  const ogonBezTresci = ogonJestJednostka || WARTOSC_Z_JEDNOSTKA.test(ogon);

  if (wyrazy.length > 1) {
    // (3) głowa skracana od najdłuższej do najkrótszej — pierwsza mieszcząca
    // się wygrywa. Zakres = długość pierwszego wyrazu (kilkanaście znaków),
    // więc pętla liniowa jest tańsza i czytelniejsza niż połówkowa.
    const glowa = wyrazy[0];
    for (let g = glowa.length; g >= 1; g--) {
      const kandydat = `${glowa.slice(0, g)}…${ogon}`;
      if (miesciSie(kandydat)) return kandydat;
    }
    // (4) sam ogon — tylko gdy niesie treść inną niż wartość z jednostką.
    if (!ogonBezTresci && miesciSie(`…${ogon}`)) return `…${ogon}`;
  }

  // (5) całe wyrazy wiodące z wielokropkiem — nigdy fragment wyrazu.
  for (let w = wyrazy.length - 1; w >= 1; w--) {
    const kandydat = `${wyrazy.slice(0, w).join(' ')} …`;
    if (miesciSie(kandydat)) return kandydat;
  }

  // (6) OSTATNIA deska: fragment pierwszego wyrazu ZAKOŃCZONY wielokropkiem
  // („pol…"). Wada nazwana w audycie to nie sam fragment, tylko fragment BEZ
  // ZNAKU, który udaje kompletną daną („S400" czytane jak moc) — dlatego ten
  // stopień jest osiągany dopiero po wyczerpaniu wszystkich form całowyrazowych
  // i ZAWSZE niesie „…". Bez niego etykieta w bardzo wąskim slocie znikałaby
  // całkowicie (pomiar: 2 podpisy pól GPZ i nazwa GPZ na sieci wielostacyjnej
  // przy kadrze „Dopasuj widok"), a rysunek bez podpisu pola nie mówi, czym to
  // pole jest — gorzej niż podpis oznaczony jako skrócony.
  const glowa = wyrazy[0];
  for (let g = glowa.length - 1; g >= 1; g--) {
    const kandydat = `${glowa.slice(0, g)}…`;
    if (miesciSie(kandydat)) return kandydat;
  }

  // (7) nie mieści się nawet jeden znak z wielokropkiem — uczciwy brak.
  return '';
}

/** S9-7 — ZAMKNIĘTA lista jednostek zapisu rysunku (człon, który sam z siebie
 *  NIE rozróżnia elementu). Używana wyłącznie przez `shortenPreservingIdentity`
 *  do wyznaczenia ogona rozróżniającego; każda pozycja występuje w realnych
 *  etykietach v3 (`layout/lineLabel.ts`, `layout/measure.ts`, `compose/*`). */
const JEDNOSTKI_RYSUNKU: ReadonlySet<string> = new Set([
  'V', 'kV', 'kVA', 'MVA', 'kW', 'MW', 'kvar', 'Mvar', 'A', 'kA', 'm', 'km', 'mm²', 'Ω', '%', 'Hz',
]);

/** S9-7 — „liczba + jednostka" jako CAŁY ogon (np. „15 kV", „630 kVA"): forma,
 *  której nie wolno pokazać samej, bo czyta się ją jak daną techniczną, a nie
 *  jak nazwę elementu (audyt C-6: „S400"/„S630" wyglądają jak moce). */
const WARTOSC_Z_JEDNOSTKA = /^\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)? [^\s]+$/u;

/**
 * Liczba w POLSKIM zapisie rysunku: całkowita bez miejsc dziesiętnych („20"),
 * ułamkowa z PRZECINKIEM („0,4", „10,5", „9,62"). Bez zer nieznaczących.
 *
 * DLACZEGO TU, A NIE PRZY KAŻDEJ ETYKIECIE. Rysunek miał trzy równoległe
 * konwencje: tabliczka danych systemu formatowała po polsku („Ik″ 9,62 kA"),
 * etykieta linii tak samo („10,5 kV"), a etykiety szyn wstawiały liczbę
 * SUROWO — więc szyna nN wychodziła jako „Szyna nN · 0.4 kV" (kropka), obok
 * „Odbiór ΣP 0,4 MW" (przecinek) w tej samej tabliczce stacji. Zmierzone na
 * zrzucie audytu V12K-234. Jedna funkcja zamiast trzech konwencji.
 *
 * Zaokrąglenie do DWÓCH miejsc, nie jednego: szyna 0,69 kV nie może stać się
 * „0,7 kV" — zaokrąglenie napięcia znamionowego to zmiana danej, nie zapisu.
 *
 * Szerokość etykiety liczy `measureLabelWidth` z DŁUGOŚCI tekstu, a przecinek
 * i kropka mają tę samą długość — więc ta konwencja nie rusza geometrii ani
 * hashy sceny.
 */
export function liczbaRysunkuPl(value: number): string {
  if (Number.isInteger(value)) return value.toFixed(0);
  // Zera nieznaczace usuwane WSZYSTKIE, nie jedno: `replace(/0$/, '')` zostawialo
  // „12,0" dla 11.999 i „0,0" dla 0.001 — a wartosc NIEZEROWA pokazana jako zero to
  // dokladnie to, czego kanon zabrania. Po obcieciu zer moze zostac sama czesc
  // calkowita (wtedy nie ma przecinka).
  const dwaMiejsca = value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return dwaMiejsca.replace('.', ',');
}

const AVG_GLYPH_WIDTH_FACTOR = 0.62;

/** Deterministyczna szerokość tekstu [px świata] przy DOWOLNYM rozmiarze pisma
 *  — jedna formuła dla klas typograficznych (`measureLabelWidth` niżej) i dla
 *  pisma przeskalowanego do rozmiaru minimalnego (KD-11, `minReadableFontSize`). */
export function measureTextWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * AVG_GLYPH_WIDTH_FACTOR);
}

/** Deterministyczna szerokość etykiety [px świata]. */
export function measureLabelWidth(text: string, cls: LabelClass): number {
  return measureTextWidth(text, LABEL_TYPOGRAPHY[cls].fontSize);
}

/** Wysokość wiersza etykiety [px świata] (fontSize + interlinia). */
export function labelLineHeight(cls: LabelClass): number {
  return LABEL_TYPOGRAPHY[cls].fontSize + 6;
}
