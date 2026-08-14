/**
 * SLD V3 — KD-11: PLAN RENDEROWANIA ETYKIET DLA DANEJ SKALI KAMERY.
 *
 * DLACZEGO ISTNIEJE. Po podniesieniu progu czytelności 6 → 9 px (KD-8 poz. 5)
 * rysunek rozwiniętego GPZ przy kadrze „Dopasuj widok" nie niósł ŻADNEGO
 * podpisu — wskaźnik mówił „Ukryto 35 opisów", a rysunek techniczny bez
 * TOŻSAMOŚCI elementów (nazwa transformatora, napięcie szyny/sekcji, nazwa
 * źródła, oznaczenie pola) nie mówi, CO przedstawia. Rozstrzygnięcie karty:
 * dwie klasy znaczeniowe z osobnymi regułami widoczności (`core/text.ts`
 * `LabelRole`):
 *
 *   - `'dane'`      — próg czytelności jak dotąd: poniżej progu etykieta ZNIKA
 *                     i liczy się do wskaźnika „Ukryto N opisów";
 *   - `'tozsamosc'` — NIE znika: poniżej progu jest renderowana pismem
 *                     powiększonym do rozmiaru MINIMALNEGO CZYTELNEGO
 *                     (`minReadableFontSize`), czyli skalowanym NIEZALEŻNIE od
 *                     kamery — dokładnie tak, jak K11-B traktuje minimalny
 *                     rozmiar symboli (`MIN_SYMBOL_SCREEN_PX`).
 *
 * DLACZEGO W WARSTWIE RENDERU, NIE W SCENIE. Plan zależy od SKALI KAMERY,
 * a scena musi zostać deterministyczna (te same wejścia = ta sama geometria i
 * ten sam hash). Kamera do sceny nie należy — tak samo jak sam próg czytelności
 * (`core/text.ts`), egzekwowany tu od KD-8.
 *
 * ZAKAZ KOLIZJI (rozstrzygnięcie karty §3: „kolizja = defekt, nie kompromis").
 * Powiększenie pisma powiększa prostokąt, więc plan przechodzi przez TE SAME
 * mechanizmy, co reszta rysunku:
 *   (a) KIERUNEK WZROSTU — prostokąt rośnie OD kotwicy (`OwnedLabel.placement`):
 *       podpis nad szyną rośnie w GÓRĘ, więc prześwit `BUSBAR_LABEL_PATH_CLEARANCE`
 *       (KD-8) zostaje zachowany; podpis pod symbolem rośnie w DÓŁ itd.;
 *   (b) PASMO ETYKIET — wiersze pasma nazw (`ownerKind:'station-name'`) są
 *       przestawiane od góry pasma z powiększonymi wysokościami, więc nie
 *       nachodzą na siebie nawzajem (wiersze ukryte nie zajmują miejsca);
 *   (c) SKRACANIE ZACHOWUJĄCE CZŁON ROZRÓŻNIAJĄCY (`shortenPreservingIdentity`,
 *       `core/text.ts`, S9-7/audyt C-6) — gdy powiększona etykieta koliduje,
 *       jest skracana do NAJDŁUŻSZEJ postaci, która kolizji nie ma
 *       (wyszukiwanie połówkowe po DOSTĘPNEJ SZEROKOŚCI, nie po liczbie
 *       glifów: całe człony odpadają od końca, a ostatnią formą jest skrót
 *       środkowy z zachowanym członem rozróżniającym);
 *   (d) ZMIANA STRONY KOTWICY (S9-7) — gdy powiększony prostokąt nie mieści
 *       się po stronie zadeklarowanej przez scenę, plan próbuje strony
 *       PRZECIWNEJ (napis znad szyny idzie pod szynę). Prześwit od kotwicy
 *       zostaje ten sam, bo prostokąt nadal rośnie OD niej — zmienia się
 *       tylko zwrot. To stopień swobody TAŃSZY niż utrata tożsamości;
 *   (e) PIERWSZEŃSTWO — rozstrzyganie w porządku `labelResolutionOrder`
 *       (`layout/declutter.ts`, ta sama reguła co declutter sceny): symbol
 *       zawsze wygrywa z etykietą, etykieta o wyższym priorytecie wygrywa z
 *       niższą. Etykieta, dla której nawet najkrótsza postać koliduje po
 *       OBU stronach, NIE jest rysowana — plan zwraca ją jawnie
 *       (`droppedIdentity`), żeby wyrocznia odbioru mogła pilnować, że na
 *       skalach produkcyjnych ten zbiór jest PUSTY (a nie żeby cicho zgubić
 *       tożsamość).
 *
 * S9-7 (audyt C-4, TWARDA PODŁOGA EKRANOWA). Do wersji sprzed tej karty plan
 * miał czwarty stopień ustępstwa: „powrót do rozmiaru NATURALNEGO w oryginalnym
 * slocie sceny" — etykieta, której powiększona postać nigdzie nie pasowała,
 * była rysowana pismem naturalnym. Zmierzone skutki na sieci fixturowej:
 * 35 nazw stacji o wysokości 1,4 px ekranu przy dolnym krańcu zoomu (L0 @0,05)
 * i 1 podpis szyny 5,6 px na L1 @0,51. Rysowanie napisu, którego z definicji
 * nie da się przeczytać, jest gorsze niż jego brak: zajmuje miejsce, blokuje
 * sąsiadów w declutterze i FAŁSZUJE deklarację „tożsamość jest czytelna
 * wszędzie". Ten stopień został USUNIĘTY — plan albo rysuje napis nie mniejszy
 * niż `MIN_READABLE_LABEL_SCREEN_PX` na ekranie, albo go nie rysuje i mówi o
 * tym wprost (`droppedIdentity` + wskaźnik „Ukryto N opisów"). Własność ma
 * PRZYPIĘTĄ wyrocznię: `plannedLabelsBelowScreenFloor` niżej.
 *
 * PROPORCJE (zgłoszenie właściciela 2026-08-07 „brak proporcji, grubości") —
 * DRUGA GRANICA TEJ SAMEJ PARY. S9-7 zamknęła granicę DOLNĄ i zostawiła górną
 * otwartą: powiększenie awaryjne przypina napis do 9 px ekranu, podczas gdy
 * rysunek kurczy się razem z kamerą, więc stosunek napis:symbol rósł jak
 * 1/skala (pomiar na fixturze 53 stacji: oznacznik aparatu **2,82×** wysokości
 * symbolu przy skali dopasowania, **7,50×** przy `MIN_SCALE`; nazwa stacji
 * **3,75×** zwiniętego bloku przy `MIN_SCALE`). Od tej karty rozmiar pisma
 * wychodzi z JEDNEJ funkcji spełniającej OBIE granice naraz
 * (`core/text.ts` `enlargedFontSizeWithinProportion`), a etykieta, dla której
 * spełnić obu się nie da, trafia do `droppedIdentity` — tak samo jak ta, dla
 * której zabrakło miejsca. Wyrocznia: `plannedLabelsAboveProportionCeiling`.
 *
 * RAMKA-TNIE-PODPISY (zgłoszenie właściciela 2026-08-08 „ramka przecina
 * podpisy stacji") — TRZECIA GRANICA: OBRYS ARKUSZA. Poprzednie dwie pilnowały
 * ROZMIARU pisma; POŁOŻENIA względem krawędzi rysunku nie pilnowała żadna.
 * Arkusz jest jednak wyprowadzony z REZERWACJI etykiet (`labelReservationRect`
 * → `scene.bbox` → `sheet/outline.ts` `sheetSizeFor`), a rezerwacja liczona
 * jest pismem NATURALNYM — więc każde powiększenie awaryjne wypychało tusz
 * poza ramkę, którą sam wyznaczył. POMIAR stanu przed (kadr 1800×1100,
 * `scripts/pomiar_ramka.tsx`): nazwa stacji ostatniego wiersza schodzi
 * 36,7 j.św. pod dolną krawędź na L0 @0,181 (długi ciąg: 52,3 j.), podpis pola
 * „FT1 · transformatorowe" wychodzi 282 j. za prawą krawędź na L2 @0,30,
 * a opis zbiorczy GPZ 39,5 j. przed lewą — przy KAŻDEJ skali roboczej, bo tam
 * pismo nie jest nawet powiększane (tekst jest po prostu szerszy od slotu).
 * Od tej karty obrys arkusza jest przeszkodą w `wolne()` — tej samej rangi co
 * symbol i tor — więc przelew rozwiązują ISTNIEJĄCE stopnie swobody (zmiana
 * strony kotwicy, skracanie), a napis, którego zmieścić się nie da, trafia do
 * `droppedIdentity` i do licznika „Ukryto N opisów". Wyrocznia:
 * `plannedLabelsOutsideSheet`.
 *
 * Czysta funkcja: brak DOM/Date/losowości (P7) — ten sam wynik w renderze,
 * teście i runnerze odbioru.
 */

import { rectsOverlap, type V3Rect } from '../core/grid';
import { buildRectIndex, createRectIndex, type RectIndex } from '../core/rectIndex';
import {
  enlargedFontSizeWithinProportion,
  isLabelHiddenAtScale,
  isLabelReadableAtScale,
  LABEL_TYPOGRAPHY,
  measureTextWidth,
  MIN_READABLE_LABEL_SCREEN_PX,
  shortenPreservingIdentity,
} from '../core/text';
import { labelPriority, labelResolutionOrder } from '../layout/declutter';
import { lodClassOf, type OwnedLabel, type SimpleAnchorPlacement } from '../layout/labels';
import { rectWithinSheet, type SheetOutline } from '../sheet/outline';

/** Etykieta zaplanowana do narysowania — geometria EFEKTYWNA (po ewentualnym
 *  powiększeniu pisma i skróceniu tekstu), nie surowa z sceny. */
export interface PlannedLabel {
  /** Etykieta sceny (źródło prawdy o właścicielu/klasie/roli). */
  readonly label: OwnedLabel;
  /** Indeks w `scene.labels` — stabilny `data-testid` renderu. */
  readonly index: number;
  /** Tekst do narysowania (skrócony z wielokropkiem, gdy zabrakło miejsca). */
  readonly text: string;
  /** Rozmiar pisma [px ŚWIATA] — naturalny albo powiększony do minimum. */
  readonly fontSize: number;
  /**
   * Prostokąt TUSZU [świat] — dokładnie tyle, ile zajmą NARYSOWANE glify
   * (`prostokatTuszu` niżej), a nie slot, w którym stoją.
   *
   * RAMKA-TNIE-PODPISY: do tej karty pole znaczyło DWIE różne rzeczy —
   * dla etykiety powiększonej prostokąt tuszu, a dla etykiety w rozmiarze
   * naturalnym surowy slot sceny. Rozjazd był mierzalny: opis zbiorczy GPZ
   * („Widok zbiorczy · sekcje SN: 1 · …", `t3`) ma tusz 391 j.św. przy slocie
   * 296 j.św., więc malowany wychodził 39,5 j.św. na LEWO od arkusza — przy
   * KAŻDEJ skali roboczej, bo tam pismo nie jest nawet powiększane. Jedno pole
   * = jedno znaczenie: prostokąt jest tym, co widać.
   */
  readonly rect: V3Rect;
  /** `true`, gdy pismo powiększono ponad rozmiar klasy typograficznej. */
  readonly enlarged: boolean;
}

export interface LabelRenderPlan {
  /** Do narysowania, w ORYGINALNEJ kolejności sceny (stabilność `key`/testId). */
  readonly drawn: readonly PlannedLabel[];
  /** Etykiety klasy `'dane'` NIEnarysowane — próg czytelności albo brak
   *  miejsca po powiększeniu sąsiadów. Dokładnie ta liczba stoi we wskaźniku
   *  „Ukryto N opisów — przybliż, aby zobaczyć". */
  readonly hiddenDetail: readonly OwnedLabel[];
  /** Etykiety klasy `'tozsamosc'`, dla których nie znalazło się miejsce nawet
   *  po skróceniu — zbiór, który na sieciach kanonicznych MUSI być pusty
   *  (wyrocznia `accept:sld-v3`). Ostatnia deska ratunku przed kolizją. */
  readonly droppedIdentity: readonly OwnedLabel[];
}

/** Prostokąt etykiety o zadanej szerokości/wysokości, zakotwiczony jak slot
 *  oryginalny: rośnie OD kotwicy (`placement`), a w osi prostopadłej pozostaje
 *  wyśrodkowany względem slotu. Brak `placement` (etykiety klasy `'dane'`,
 *  które nigdy nie rosną) ⇒ wzrost symetryczny wokół środka slotu. */
function anchoredRect(slot: V3Rect, width: number, height: number, placement: OwnedLabel['placement']): V3Rect {
  const cx = slot.x + slot.width / 2;
  const cy = slot.y + slot.height / 2;
  switch (placement) {
    case 'above':
      // Dolna krawędź (od strony kotwicy) nieruchoma — rośnie w górę.
      return { x: cx - width / 2, y: slot.y + slot.height - height, width, height };
    case 'below':
      return { x: cx - width / 2, y: slot.y, width, height };
    case 'left':
      // Prawa krawędź (od strony kotwicy) nieruchoma — rośnie w lewo.
      return { x: slot.x + slot.width - width, y: cy - height / 2, width, height };
    case 'right':
      return { x: slot.x, y: cy - height / 2, width, height };
    default:
      return { x: cx - width / 2, y: cy - height / 2, width, height };
  }
}

interface Kandydat {
  readonly label: OwnedLabel;
  readonly index: number;
  readonly fontSize: number;
  readonly enlarged: boolean;
  /** Slot bazowy: prostokąt sceny albo — dla wierszy pasma nazw — prostokąt po
   *  przestawieniu pasma (patrz `przestawPasma`). */
  readonly slot: V3Rect;
  /** Tekst WYJŚCIOWY planu: pełny albo już skrócony do REZERWACJI właściciela
   *  (pasmo nazw ma własną szerokość slotu = szerokość kolumny stacji, więc
   *  powiększony wiersz nie ma prawa wyjść poza własną kolumnę). */
  readonly tekstBazowy: string;
}

/** Wysokość wiersza dla DOWOLNEGO rozmiaru pisma (ta sama formuła co
 *  `labelLineHeight`: pismo + interlinia 6 px świata). */
function wysokoscWiersza(fontSize: number): number {
  return fontSize + 6;
}

/** Rozciągłość prostokąta WZDŁUŻ tekstu [j.św.]. Etykieta obrócona (lateral,
 *  czytana z dołu) rozciąga się wzdłuż osi PIONOWEJ, więc jej „szerokością
 *  tekstu" jest `height` — ta sama umowa, co w `layout/labels.ts`
 *  (`tuszWSlocie`, `labelReservationRect`). */
function rozciagloscWzdluzTekstu(rect: V3Rect, rotated: boolean): number {
  return rotated ? rect.height : rect.width;
}

/**
 * RAMKA-TNIE-PODPISY — prostokąt TUSZU: dokładnie to, co pokryją narysowane
 * glify. JEDYNE miejsce w planie, które zamienia (tekst, pismo, obrót) na
 * geometrię — wcześniej robiły to dwa miejsca w dwóch konwencjach, przez co
 * etykieta w rozmiarze naturalnym miała w planie slot, a nie tusz.
 *
 * Obrót zamienia osie (rozciągłość tekstu idzie w pion, wysokość wiersza w
 * poziom). Do tej karty `anchoredRect` dostawał zawsze `measureTextWidth` jako
 * SZEROKOŚĆ, więc prostokąt powiększonej etykiety obróconej byłby
 * transponowany; dziś jest to nieosiągalne (wszystkie etykiety obrócone mają
 * klasę znaczeniową `'dane'`, a te nie są powiększane), ale zostawianie w tym
 * samym pliku drugiej konwencji osi jest dokładnie tym, czego zakazuje reguła
 * KLASA §5.
 *
 * `placement === undefined` ⇒ tusz WYŚRODKOWANY w slocie (tak rysuje
 * `SceneLabelNode`: `x`/`y` = środek prostokąta, `textAnchor=middle`,
 * `dominantBaseline=middle`) — to postać dla pisma NATURALNEGO, które nie
 * rośnie, więc nie ma od czego rosnąć. Pismo POWIĘKSZONE kotwiczy się stroną
 * (patrz `anchoredRect`).
 */
function prostokatTuszu(
  slot: V3Rect,
  text: string,
  fontSize: number,
  rotated: boolean,
  placement: OwnedLabel['placement'],
): V3Rect {
  const wzdluz = measureTextWidth(text, fontSize);
  const wpoprzek = wysokoscWiersza(fontSize);
  return anchoredRect(slot, rotated ? wpoprzek : wzdluz, rotated ? wzdluz : wpoprzek, placement);
}

const NAME_ROW_SUFFIX = /#name-row-\d+$/;

/**
 * PASMO ETYKIET (mechanizm (b)): wiersze jednego pasma nazw dostają nowe `y`
 * liczone od GÓRY pasma, z wysokościami efektywnymi — wiersz powiększony
 * przesuwa następne w dół zamiast na nie nachodzić, a wiersz nierysowany
 * (dane poniżej progu) nie zajmuje miejsca. Zwraca mapę indeks → slot.
 *
 * RAMKA-TNIE-PODPISY — PASMO TEŻ MA MIEŚCIĆ SIĘ W ARKUSZU. Przestawianie
 * kotwiczy pasmo GÓRĄ, więc powiększone wiersze rosną w DÓŁ; dla stacji
 * ostatniego wiersza arkusza pasmo dotyka dolnej krawędzi (rezerwacja kończy
 * się DOKŁADNIE na `bbox.height` — to ona tę krawędź wyznacza), więc urosnąć
 * w dół nie ma gdzie. Co gorsza, przestawienie ZABIERAŁO etykiecie stopień
 * swobody: slot dostawał już wysokość powiększoną, więc `anchoredRect` dla
 * strony `'above'` dawał ten sam prostokąt co `'below'` i ucieczka w górę
 * przestawała istnieć (pomiar: nazwy S51/S52/S53 na L0 @0,181 nie kolidowały
 * z NICZYM na rysunku, a mimo to wypadały). Dlatego całe pasmo, które po
 * przestawieniu wyszłoby poza arkusz, jest PRZESUWANE z powrotem do środka —
 * jako blok, bez rozrywania wierszy. Kolizję z rysunkiem, jeśli powstanie w
 * nowym miejscu, rozstrzyga niżej ta sama maszyneria co zawsze.
 */
function przestawPasma(kandydaci: readonly Kandydat[], sheet: SheetOutline): Map<number, V3Rect> {
  const pasma = new Map<string, Kandydat[]>();
  for (const k of kandydaci) {
    if (k.label.ownerKind !== 'station-name') continue;
    const klucz = k.label.ownerRef.replace(NAME_ROW_SUFFIX, '');
    const lista = pasma.get(klucz);
    if (lista) lista.push(k);
    else pasma.set(klucz, [k]);
  }
  const wynik = new Map<number, V3Rect>();
  for (const wiersze of pasma.values()) {
    // Kolejność wierszy = kolejność sceny (indeks rośnie razem z `#name-row-N`).
    const uporzadkowane = [...wiersze].sort((a, b) => a.index - b.index);
    const gora = Math.min(...uporzadkowane.map((k) => k.slot.y));
    let y = gora;
    const pas: { readonly index: number; readonly rect: V3Rect }[] = [];
    for (const k of uporzadkowane) {
      const height = k.enlarged ? wysokoscWiersza(k.fontSize) : k.slot.height;
      pas.push({ index: k.index, rect: { x: k.slot.x, y, width: k.slot.width, height } });
      y += height;
    }
    // Przesunięcie pasma jako bloku: najpierw w górę o wystawanie pod arkusz,
    // potem (gdy pasmo jest wyższe od miejsca nad nim) z powrotem do y=0.
    // Pasmo wyższe od CAŁEGO arkusza zostaje bez przesunięcia — nie ma dokąd
    // go przesunąć, a udawanie, że jest inaczej, byłoby cichym zerem.
    const przelew = Math.max(0, y - sheet.height);
    const korekta = Math.min(przelew, Math.max(0, gora));
    for (const { index, rect } of pas) {
      wynik.set(index, korekta === 0 ? rect : { ...rect, y: rect.y - korekta });
    }
  }
  return wynik;
}

interface Dopasowanie {
  readonly text: string;
  readonly rect: V3Rect;
  readonly fontSize: number;
  readonly enlarged: boolean;
}

/**
 * S9-7 (d): STRONY KOTWICY w kolejności ustępstw — zadeklarowana przez scenę,
 * potem przeciwna (napis znad szyny idzie pod szynę), na końcu dwie
 * prostopadłe. Prostokąt zawsze rośnie OD kotwicy, więc prześwit od toru/
 * symbolu jest zachowany na każdej z nich; zmienia się wyłącznie ZWROT.
 *
 * DLACZEGO CZTERY, A NIE DWIE. Pomiar na fixturze referencyjnej (L1 @0,51):
 * podpisy DER („PV 500 kW", 4 sztuki) nie mieszczą się ani pod symbolem, ani
 * nad nim — kolizja jest PIONOWA (powiększony wiersz jest wyższy od
 * rezerwacji pasma), więc żadne skracanie tekstu jej nie usuwa, a obie strony
 * pionowe są zajęte. Bez stron prostopadłych jedynym wyjściem byłoby albo
 * rysowanie pisma nieczytelnego (5,6 px ekranu — stan sprzed tej karty), albo
 * utrata tożsamości źródła na rysunku. Obie są gorsze niż podpis obok symbolu.
 *
 * `undefined` dla etykiet bez zadeklarowanej strony (klasa `'dane'`, która
 * nigdy nie rośnie, więc alternatywy nie potrzebuje) ⇒ pusta lista.
 */
function stronyWKolejnosci(placement: OwnedLabel['placement']): readonly SimpleAnchorPlacement[] {
  switch (placement) {
    case 'above':
      return ['above', 'below', 'right', 'left'];
    case 'below':
      return ['below', 'above', 'right', 'left'];
    case 'left':
      return ['left', 'right', 'above', 'below'];
    case 'right':
      return ['right', 'left', 'above', 'below'];
    default:
      return [];
  }
}

/**
 * Postać etykiety, która NIE koliduje ani z rysunkiem, ani z etykietą już
 * zachowaną — szukana w kolejności ustępstw od najlepszej do najgorszej:
 *
 *  1. pełny tekst pismem powiększonym do minimum czytelnego, po stronie
 *     zadeklarowanej przez scenę;
 *  2. tekst SKRÓCONY z zachowaniem członu rozróżniającego, pismem
 *     powiększonym — najdłuższa postać, która się mieści (wyszukiwanie
 *     POŁÓWKOWE po DOSTĘPNEJ SZEROKOŚCI; poprawne, bo prostokąt jest
 *     zakotwiczony, więc węższy daje prostokąt ZAWARTY w szerszym, a
 *     `shortenPreservingIdentity` jest nierosnąca względem szerokości);
 *  3. te same dwa kroki po kolejnych stronach kotwicy (`stronyWKolejnosci`).
 *
 * `null` = nie ma miejsca po ŻADNEJ stronie nawet dla najkrótszej formy
 * niosącej człon rozróżniający. Wołający wtedy etykiety NIE rysuje i mówi o
 * tym wprost — pisma NIE zmniejszamy poniżej progu czytelności (patrz
 * „TWARDA PODŁOGA EKRANOWA" w nagłówku pliku).
 */
function najlepszeDopasowanie(
  kandydat: Kandydat,
  zajete: RectIndex,
  obstacles: RectIndex,
  sheet: SheetOutline,
): Dopasowanie | null {
  const { label, fontSize, slot, tekstBazowy } = kandydat;
  const rotated = label.rotated === true;
  // S9-9: ten sam predykat co dotąd (`rectsOverlap` na obu zbiorach), tylko
  // liczony indeksem przestrzennym zamiast przeglądem liniowym — patrz
  // `core/rectIndex.ts`. Wynik bajtowo identyczny; koszt planu na sieci 160
  // stacji spada z ~0,94 s na ~0,02 s, czyli schodzi z budżetu klatki gestu.
  //
  // RAMKA-TNIE-PODPISY: trzeci człon — OBRYS ARKUSZA (`sheet/outline.ts`,
  // ta sama funkcja, z której `sheet/Frame.tsx` bierze prostokąt ramki).
  // Krawędź arkusza jest przeszkodą tej samej rangi co symbol i tor: napis,
  // przez który przechodzi ramka, jest tak samo nie do przeczytania jak napis
  // leżący na symbolu. Dzięki temu istniejące stopnie swobody (zmiana strony
  // kotwicy, skracanie) rozwiązują przelew SAME — napis znad dolnej krawędzi
  // idzie nad slot zamiast wyjść pod ramkę.
  const wolne = (rect: V3Rect): boolean =>
    rectWithinSheet(rect, sheet) && !obstacles.anyOverlap(rect) && !zajete.anyOverlap(rect);

  if (!kandydat.enlarged) {
    // Etykiety NIEpowiększone nie mają gdzie się przestawiać — ich slot jest
    // rozstrzygnięty declutterem przy budowie sceny. Prostokątem planu jest
    // jednak TUSZ (wyśrodkowany w slocie, tak jak go rysuje `SceneLabelNode`),
    // a nie sam slot: tekst został już skrócony do rozciągłości slotu
    // (`tekstBazowy`), więc tusz ⊆ slot ⊆ rezerwacja ⊆ arkusz.
    const tusz = prostokatTuszu(slot, tekstBazowy, fontSize, rotated, undefined);
    return tekstBazowy.length > 0 && wolne(tusz)
      ? { text: tekstBazowy, rect: tusz, fontSize, enlarged: false }
      : null;
  }

  // S9-9: `shortenPreservingIdentity` jest CZYSTĄ funkcją `(tekst, pismo,
  // szerokość)`, a `tekst`/`pismo` są w tym wywołaniu stałe — zmienia się sama
  // szerokość. Wyszukiwanie połówkowe niżej powtarza się dla KAŻDEJ ze stron
  // (`stronyWKolejnosci`, do czterech), startując z tego samego przedziału
  // `[1, hi]`, więc te same szerokości próbne liczone są po kilka razy.
  // Spamiętanie w obrębie JEDNEGO dopasowania (bez stanu modułu — czystość i
  // determinizm nietknięte) zdejmuje te powtórzenia. Pomiar S9-9: skracanie
  // było 47% kosztu planu po założeniu indeksu przestrzennego.
  const skroconeDo = new Map<number, string>();
  const skroc = (maxWidth: number): string => {
    const zapamietane = skroconeDo.get(maxWidth);
    if (zapamietane !== undefined) return zapamietane;
    const wynik = shortenPreservingIdentity(tekstBazowy, fontSize, maxWidth);
    skroconeDo.set(maxWidth, wynik);
    return wynik;
  };

  const proboj = (placement: OwnedLabel['placement']): Dopasowanie | null => {
    const prostokatDla = (text: string): V3Rect =>
      prostokatTuszu(slot, text, fontSize, rotated, placement);

    const pelny = prostokatDla(tekstBazowy);
    if (tekstBazowy.length > 0 && wolne(pelny)) {
      return { text: tekstBazowy, rect: pelny, fontSize, enlarged: true };
    }

    // (2) wyszukiwanie połówkowe po DOSTĘPNEJ SZEROKOŚCI [px świata].
    let lo = 1;
    let hi = Math.max(1, Math.ceil(measureTextWidth(tekstBazowy, fontSize)) - 1);
    let najlepszy: Dopasowanie | null = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const text = skroc(mid);
      if (text.length === 0) {
        lo = mid + 1; // za wąsko na jakąkolwiek formę — szukamy szerzej
        continue;
      }
      const rect = prostokatDla(text);
      if (wolne(rect)) {
        najlepszy = { text, rect, fontSize, enlarged: true };
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return najlepszy;
  };

  const strony = stronyWKolejnosci(label.placement);
  if (strony.length === 0) return proboj(label.placement);
  for (const strona of strony) {
    const dopasowanie = proboj(strona);
    if (dopasowanie) return dopasowanie;
  }
  return null;
}

/**
 * Plan renderu etykiet sceny dla skali kamery. `obstacles` to prostokąty
 * SYMBOLI i ODCINKÓW TORU tego poziomu szczegółu (`sceneObstacleRects`,
 * `scene/buildScene.ts`) — „tor elektryczny nie znika", więc rysunek ZAWSZE
 * wygrywa z etykietą (ta sama zasada, co `declutterLabels`).
 *
 * Skala niewiarygodna (≤0/NaN — np. viewport 0×0 przed pierwszym pomiarem
 * układu) ⇒ plan tożsamościowy: wszystko rysowane naturalnie, nic nie ukryte
 * (brak pomiaru nie jest dowodem nieczytelności — parytet z
 * `isLabelReadableAtScale`).
 */
export function planSceneLabels(
  labels: readonly OwnedLabel[],
  obstacles: readonly V3Rect[],
  scale: number,
  sheet: SheetOutline,
): LabelRenderPlan {
  if (!Number.isFinite(scale) || scale <= 0) {
    return {
      drawn: labels.map((label, index) => {
        const fontSize = LABEL_TYPOGRAPHY[label.labelClass].fontSize;
        const rotated = label.rotated === true;
        // Skrócenie do slotu jest NIEZALEŻNE od skali (wynika z tego, że tekst
        // nie mieści się we własnej rezerwacji), więc obowiązuje także tutaj —
        // inaczej ścieżka „brak wiarygodnego pomiaru" malowałaby napis poza
        // arkuszem dokładnie tak, jak robiła to ścieżka zwykła przed tą kartą.
        const text = shortenPreservingIdentity(
          label.text,
          fontSize,
          rozciagloscWzdluzTekstu(label.rect, rotated),
        );
        return {
          label,
          index,
          text,
          fontSize,
          rect: prostokatTuszu(label.rect, text, fontSize, rotated, undefined),
          enlarged: false,
        };
      }),
      hiddenDetail: [],
      droppedIdentity: [],
    };
  }

  const hiddenDetail: OwnedLabel[] = [];
  const droppedIdentity: OwnedLabel[] = [];
  const kandydaci: Kandydat[] = [];
  labels.forEach((label, index) => {
    const czytelna = isLabelReadableAtScale(label.labelClass, scale);
    // T2-LOD (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §„POLITYKA LOD nN",
    // wyjątek bezwzględny): `unresolved` OMIJA próg czytelności wprost —
    // etykieta elementu w stanie błędu/UNRESOLVED nigdy nie trafia do
    // `hiddenDetail`, niezależnie od klasy LOD, którą miałaby z konstrukcji
    // (`lodClassOf`). Reszta logiki (progi, powiększanie, kolizje) bez zmiany
    // — od tego miejsca w dół etykieta „unresolved" idzie tą samą ścieżką co
    // etykieta klasy `'tozsamosc'`/`'L0'` zawsze szła.
    if (label.unresolved !== true && isLabelHiddenAtScale(label.labelRole, label.labelClass, scale)) {
      hiddenDetail.push(label);
      return;
    }
    // PROPORCJE: rozmiar pisma z JEDNEGO źródła obu granic (`core/text.ts`
    // `enlargedFontSizeWithinProportion`) — `null` znaczy „czytelnie już się
    // nie da, a nieproporcjonalnie nie wolno". Do tej karty ten sam plan pytał
    // wyłącznie o granicę DOLNĄ (`minReadableFontSize`), więc powiększenie
    // rosło bez sufitu i przy oddaleniu napis przygniatał symbol (pomiar
    // 2,82× / 7,50×, patrz `LabelTypography.maxEnlargement`).
    const fontSize = czytelna
      ? LABEL_TYPOGRAPHY[label.labelClass].fontSize
      : enlargedFontSizeWithinProportion(label.labelClass, scale);
    if (fontSize === null) {
      // Tożsamość, której nie da się narysować proporcjonalnie — uczciwy brak,
      // policzony we wskaźniku „Ukryto N opisów" (`SldCanvasV3`), a nie napis
      // wielkości trzech aparatów obok siebie.
      droppedIdentity.push(label);
      return;
    }
    // (c) skracanie w PIERWSZEJ kolejności do REZERWACJI właściciela: wiersz
    // pasma nazw ma slot szerokości kolumny stacji, więc powiększone pismo
    // musi zmieścić się w tej kolumnie (inaczej wchodzi w kolumnę sąsiada).
    // Etykiety zakotwiczone punktowo (napięcie szyny, oznaczenie pola, DER)
    // rezerwacji z zapasem NIE mają — ich slot to sama szerokość tekstu w
    // rozmiarze naturalnym — więc ograniczeniem jest dla nich dopiero
    // rozstrzyganie kolizji niżej.
    // BLOK-PUSTY: rezerwacja jest teraz WŁASNYM polem etykiety
    // (`rezerwacjaSzerokosci`), a `rect` niesie sam TUSZ — do tej karty jedno
    // pole grało obie role, więc rama bloku stacji płaciła pełną szerokość
    // kolumny (716 j.św.) za napis szerokości 95 j.św. Sufit powiększania
    // ZOSTAJE dokładnie ten sam: dla wiersza pasma nazw to nadal szerokość
    // kolumny stacji. Brak rezerwacji ⇒ granicą jest sam tusz (etykieta
    // kotwiczona punktowo nie ma zapasu z definicji).
    //
    // RAMKA-TNIE-PODPISY — DRUGA gałąź pary: pismo NATURALNE też ma granicę, i
    // jest nią WŁASNY SLOT etykiety. Do tej karty gałąź `: label.text` nie
    // skracała niczego, więc napis szerszy od slotu był malowany „na wylot":
    // opis zbiorczy GPZ (`t3`, tusz 391 j.św., slot 296 j.św.) wychodził
    // 39,5 j.św. na lewo POZA ARKUSZ przy każdej skali roboczej. Scena o tym
    // WIEDZIAŁA — `tuszWSlocie` (`layout/labels.ts`) zostawia slot bez zmian,
    // gdy tekst się w nim nie mieści — ale nikt tej wiedzy nie konsumował.
    const rotated = label.rotated === true;
    const granicaTekstu =
      !czytelna && label.ownerKind === 'station-name'
        ? label.rezerwacjaSzerokosci ?? rozciagloscWzdluzTekstu(label.rect, rotated)
        : rozciagloscWzdluzTekstu(label.rect, rotated);
    // Etykiety zakotwiczone punktowo (napięcie szyny, oznaczenie pola, DER)
    // rezerwacji z zapasem NIE mają — ich slot to sama szerokość tekstu w
    // rozmiarze NATURALNYM — więc skracanie POWIĘKSZONEGO pisma do slotu
    // cofnęłoby całe powiększenie. Dla nich granicą zostaje dopiero
    // rozstrzyganie kolizji (razem z obrysem arkusza) niżej.
    const tekstBazowy =
      !czytelna && label.ownerKind !== 'station-name'
        ? label.text
        : shortenPreservingIdentity(label.text, fontSize, granicaTekstu);
    kandydaci.push({ label, index, fontSize, enlarged: !czytelna, slot: label.rect, tekstBazowy });
  });

  // ŚCIEŻKA SZYBKA I ZACHOWAWCZA: gdy ŻADNA etykieta nie wymaga powiększenia
  // (skala powyżej progu dla wszystkich klas), plan jest DOKŁADNIE tym, co
  // rysowano przed KD-11 — scena jest już rozstrzygnięta declutterem przy
  // budowie (`scene/buildScene.ts`), więc nie ma czego rozstrzygać ponownie.
  // Zero zmiany zachowania przy zoomie roboczym i zero kosztu O(n²) na kadrach
  // z tysiącem etykiet.
  if (kandydaci.every((k) => !k.enlarged)) {
    return {
      drawn: kandydaci.map((k) => ({
        label: k.label,
        index: k.index,
        // RAMKA-TNIE-PODPISY: `k.tekstBazowy`, nie `k.label.text` — ścieżka
        // szybka pomijała skrócenie do slotu, więc dokładnie tu ginęła jedyna
        // granica pisma naturalnego (i tędy uciekał opis zbiorczy GPZ).
        text: k.tekstBazowy,
        fontSize: k.fontSize,
        rect: prostokatTuszu(k.slot, k.tekstBazowy, k.fontSize, k.label.rotated === true, undefined),
        enlarged: false,
      })),
      hiddenDetail,
      // NIE `[]`: tożsamości odrzucone przez SUFIT PROPORCJI odpadają jeszcze
      // przed rozstrzyganiem kolizji, więc ścieżka szybka musi je przenieść
      // (inaczej wskaźnik „Ukryto N opisów" milczałby dokładnie tam, gdzie
      // napisy znikają z powodu proporcji).
      droppedIdentity,
    };
  }

  // (b) pasmo etykiet — wiersze pasma nazw przestawione przed rozstrzyganiem.
  const przestawione = przestawPasma(kandydaci, sheet);
  const zeSlotami = kandydaci.map((k) => ({ ...k, slot: przestawione.get(k.index) ?? k.slot }));

  // (d) pierwszeństwo — ta sama reguła, co declutter sceny.
  const kolejnosc = [...zeSlotami].sort((a, b) =>
    labelResolutionOrder(
      { priority: labelPriority(a.label), rect: a.slot, ownerRef: a.label.ownerRef },
      { priority: labelPriority(b.label), rect: b.slot, ownerRef: b.label.ownerRef },
    ),
  );

  // S9-9: przeszkody sceny indeksowane RAZ na plan (zbiór stały), „zajęte"
  // przyrostowo — jak w `declutterLabels`, jedna maszyneria dla obu.
  const obstacleIndex = buildRectIndex(obstacles);
  const zajete = createRectIndex();
  const zaplanowane = new Map<number, PlannedLabel>();
  for (const kandydat of kolejnosc) {
    const dopasowanie = najlepszeDopasowanie(kandydat, zajete, obstacleIndex, sheet);
    if (!dopasowanie || dopasowanie.text.length === 0) {
      // T2-LOD: `unresolved` idzie do `droppedIdentity`, NIGDY do
      // `hiddenDetail` — nawet gdy przyczyną braku miejsca jest KOLIZJA (nie
      // próg zoomu). Ten sam kubełek co `'tozsamosc'`/`'L0'`: licznik „Ukryto
      // N opisów" liczy WYŁĄCZNIE L1/L2 (`layout/labels.ts` `lodClassOf`), w
      // KAŻDEJ gałęzi planu, nie tylko w gałęzi progu czytelności wyżej.
      if (kandydat.label.labelRole === 'tozsamosc' || kandydat.label.unresolved === true) {
        droppedIdentity.push(kandydat.label);
      } else {
        hiddenDetail.push(kandydat.label);
      }
      continue;
    }
    zajete.add(dopasowanie.rect);
    zaplanowane.set(kandydat.index, {
      label: kandydat.label,
      index: kandydat.index,
      text: dopasowanie.text,
      fontSize: dopasowanie.fontSize,
      rect: dopasowanie.rect,
      enlarged: dopasowanie.enlarged,
    });
  }

  const drawn: PlannedLabel[] = [];
  labels.forEach((_, index) => {
    const p = zaplanowane.get(index);
    if (p) drawn.push(p);
  });
  return { drawn, hiddenDetail, droppedIdentity };
}

/** Skrót używany przez wyrocznie: pary etykiet NARYSOWANYCH, których
 *  prostokąty efektywne nachodzą na siebie. Na poprawnym planie ZAWSZE puste
 *  (plan rozstrzyga kolizje z konstrukcji) — wyrocznia istnieje po to, żeby
 *  ta własność była MIERZONA, a nie deklarowana. */
export function plannedLabelCollisions(
  plan: LabelRenderPlan,
): readonly { readonly a: string; readonly b: string }[] {
  const kolizje: { a: string; b: string }[] = [];
  for (let i = 0; i < plan.drawn.length; i++) {
    for (let j = i + 1; j < plan.drawn.length; j++) {
      if (rectsOverlap(plan.drawn[i].rect, plan.drawn[j].rect)) {
        kolizje.push({ a: plan.drawn[i].label.ownerRef, b: plan.drawn[j].label.ownerRef });
      }
    }
  }
  return kolizje;
}

/**
 * S9-7 (audyt C-4) — WYROCZNIA TWARDEJ PODŁOGI EKRANOWEJ: etykiety
 * NARYSOWANE, których pismo ma na ekranie mniej niż `floorScreenPx`.
 *
 * Na poprawnym planie ZAWSZE pusta — plan albo utrzymuje próg czytelności
 * (`MIN_READABLE_LABEL_SCREEN_PX`), albo etykiety nie rysuje. Wyrocznia
 * istnieje po to, żeby ta własność była MIERZONA na każdym poziomie
 * szczegółu i przy każdej skali kamery, a nie deklarowana w komentarzu
 * (reguła KLASA §4: „deklaracja bez testu = fałszywa pewność" — poprzednia
 * wersja planu deklarowała dokładnie to i nie utrzymywała tego w 36
 * przypadkach na fixturze referencyjnej).
 *
 * Skala niewiarygodna (≤0/NaN) ⇒ zbiór pusty: brak pomiaru nie jest dowodem
 * nieczytelności (parytet z `isLabelReadableAtScale`, `core/text.ts`).
 */
export function plannedLabelsBelowScreenFloor(
  plan: LabelRenderPlan,
  scale: number,
  floorScreenPx: number,
): readonly { readonly ownerRef: string; readonly screenPx: number }[] {
  if (!Number.isFinite(scale) || scale <= 0) return [];
  return plan.drawn
    .map((p) => ({ ownerRef: p.label.ownerRef, screenPx: p.fontSize * scale }))
    .filter((p) => p.screenPx < floorScreenPx - 1e-9);
}

/** S9-7 — próg, którego plan pilnuje od środka (`minReadableFontSize`).
 *  Re-eksport, żeby wołający wyroczni nie musiał sięgać po dwie stałe z
 *  dwóch modułów i nie powstała druga, rozjeżdżająca się prawda. */
export { MIN_READABLE_LABEL_SCREEN_PX };

/**
 * PROPORCJE — WYROCZNIA SUFITU: etykiety NARYSOWANE, których pismo przekracza
 * sufit powiększenia swojej klasy (`LABEL_TYPOGRAPHY[cls].maxEnlargement`).
 *
 * Na poprawnym planie ZAWSZE pusta — plan albo mieści się w obu granicach,
 * albo etykiety nie rysuje. Drugi koniec pary do `plannedLabelsBelowScreenFloor`
 * (tamta pilnuje podłogi, ta sufitu); istnieje dlatego, że deklaracja „napis
 * nigdy nie przygniata rysunku" bez PRZYPIĘTEGO strażnika jest fałszywą
 * pewnością — dokładnie ten błąd audyt zmierzył przy poprzedniej wersji planu
 * (reguła KLASA §4).
 *
 * Zwraca zmierzoną KROTNOŚĆ względem rozmiaru naturalnego, żeby raport odbioru
 * mówił „ile razy", a nie tylko „gdzieś pękło". Skala niewiarygodna (≤0/NaN)
 * ⇒ zbiór pusty (parytet z `plannedLabelsBelowScreenFloor`).
 */
export function plannedLabelsAboveProportionCeiling(
  plan: LabelRenderPlan,
  scale: number,
): readonly { readonly ownerRef: string; readonly enlargement: number }[] {
  if (!Number.isFinite(scale) || scale <= 0) return [];
  return plan.drawn
    .map((p) => ({
      ownerRef: p.label.ownerRef,
      enlargement: p.fontSize / LABEL_TYPOGRAPHY[p.label.labelClass].fontSize,
      sufit: LABEL_TYPOGRAPHY[p.label.labelClass].maxEnlargement,
    }))
    .filter((p) => p.enlargement > p.sufit + 1e-9)
    .map(({ ownerRef, enlargement }) => ({ ownerRef, enlargement }));
}

/**
 * RAMKA-TNIE-PODPISY — WYROCZNIA OBRYSU ARKUSZA: etykiety NARYSOWANE, których
 * TUSZ wychodzi poza prostokąt arkusza (ten sam, który `sheet/Frame.tsx`
 * rysuje jako `sld-sheet-border`).
 *
 * Na poprawnym planie ZAWSZE pusta — plan albo mieści napis w arkuszu, albo go
 * nie rysuje. Istnieje dlatego, że zdanie „ramka nie przecina podpisów" bez
 * PRZYPIĘTEGO strażnika jest fałszywą pewnością (reguła KLASA §4): defekt żył
 * w repozytorium mimo kompletu wyroczni czytelności, proporcji i kolizji, bo
 * ŻADNA z nich nie pytała o krawędź rysunku.
 *
 * Zwraca PRZELEW w jednostkach świata (największy z czterech kierunków), żeby
 * raport odbioru mówił „o ile", a nie tylko „gdzieś pękło".
 */
export function plannedLabelsOutsideSheet(
  plan: LabelRenderPlan,
  sheet: SheetOutline,
): readonly { readonly ownerRef: string; readonly overflow: number }[] {
  return plan.drawn
    .filter((p) => !rectWithinSheet(p.rect, sheet))
    .map((p) => ({
      ownerRef: p.label.ownerRef,
      overflow: Math.max(
        -p.rect.x,
        -p.rect.y,
        p.rect.x + p.rect.width - sheet.width,
        p.rect.y + p.rect.height - sheet.height,
      ),
    }));
}

/** Etykiety NARYSOWANE, które nachodzą na jakikolwiek prostokąt rysunku
 *  (symbol albo odcinek toru). Na poprawnym planie puste — patrz `plannedLabelCollisions`. */
export function plannedLabelObstacleCollisions(
  plan: LabelRenderPlan,
  obstacles: readonly V3Rect[],
): readonly string[] {
  return plan.drawn
    .filter((p) => obstacles.some((r) => rectsOverlap(p.rect, r)))
    .map((p) => p.label.ownerRef);
}

/**
 * T2-LOD (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §„POLITYKA LOD nN") —
 * WYROCZNIA POLITYKI LOD (1/2): etykiety klasy `'L0'` (`layout/labels.ts`
 * `lodClassOf`) obecne w `hiddenDetail` — czyli policzone we wskaźniku
 * „Ukryto N opisów". Na poprawnym planie ZAWSZE pusta, z KONSTRUKCJI:
 * `hiddenDetail` powyżej rośnie WYŁĄCZNIE gdy `isLabelHiddenAtScale` zwróci
 * `true`, a ta funkcja jest `true` WYŁĄCZNIE dla `labelRole==='dane'`
 * (`core/text.ts`) — a `lodClassOf` mapuje `role==='tozsamosc'` na `'L0'`
 * 1:1 i `unresolved===true` na `'L0'` z pominięciem `hiddenDetail` wprost.
 * Wyrocznia istnieje po to, żeby ta własność była MIERZONA (reguła KLASA §4:
 * „deklaracja bez testu = fałszywa pewność"), nie deklarowana w komentarzu.
 */
export function hiddenDetailContainsL0(plan: LabelRenderPlan): readonly string[] {
  return plan.hiddenDetail.filter((label) => lodClassOf(label) === 'L0').map((label) => label.ownerRef);
}

/**
 * T2-LOD — WYROCZNIA POLITYKI LOD (2/2): etykiety NARYSOWANE, których
 * `lodClassOf` jest `'L0'`, ale które są `unresolved !== true` I nie mają
 * `labelRole==='tozsamosc'` — czyli L0 „przez przypadek" (klasyfikacja
 * niespójna z tabelą `LOD_CLASS_BY_OWNER_KIND`/regułą pasma nazw). Na
 * poprawnym planie ZAWSZE pusta; strażnik przed CICHYM rozjazdem dwóch źródeł
 * prawdy (`labelRole` vs `lodClassOf`), których param KLASA §3 zabrania mieć
 * niezależnie — patrz `layout/labels.ts` `lodClassOf`.
 */
export function labelsWithInconsistentL0Classification(
  labels: readonly OwnedLabel[],
): readonly string[] {
  return labels
    .filter((label) => {
      const lod = lodClassOf(label);
      const oczekiwane = label.unresolved === true || label.labelRole === 'tozsamosc';
      return (lod === 'L0') !== oczekiwane;
    })
    .map((label) => label.ownerRef);
}
