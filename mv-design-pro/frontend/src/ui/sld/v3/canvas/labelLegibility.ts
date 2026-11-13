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
 *   - `'dane'`      — widoczne, gdy pismo jest czytelne na ekranie (próg
 *                     z histerezą, `canvas/gestoscInformacji.ts`, karta
 *                     SLD-SKALA-I-NAWIGACJA R3); poniżej progu ich nie ma —
 *                     bez licznika ukrytych opisów;
 *   - `'tozsamosc'` — NIE znika z powodu skali: poniżej progu rysuje się
 *                     w stałym rozmiarze ekranowym (`minReadableFontSize`;
 *                     ranga pola — w granicy sufitu proporcji), w CAŁOŚCI, bez
 *                     wielokropka (R4). Kolizję rozstrzyga ranga: GPZ > stacja
 *                     > sekcja > pole, remis — ref (`kolejnoscRozstrzygania`);
 *                     przegrana trafia do podpowiedzi uchwytu
 *                     (`tozsamosciWPodpowiedzi`).
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
 *       `core/text.ts`, S9-7/audyt C-6) — WYŁĄCZNIE dla danych (R4: tożsamość
 *       stoi w całości albo ustępuje) — gdy powiększona etykieta koliduje,
 *       jest skracana do NAJDŁUŻSZEJ postaci, która kolizji nie ma
 *       (wyszukiwanie połówkowe po DOSTĘPNEJ SZEROKOŚCI, nie po liczbie
 *       glifów: całe człony odpadają od końca, a ostatnią formą jest skrót
 *       środkowy z zachowanym członem rozróżniającym);
 *   (d) ZMIANA STRONY KOTWICY (S9-7) — gdy powiększony prostokąt nie mieści
 *       się po stronie zadeklarowanej przez scenę, plan próbuje strony
 *       PRZECIWNEJ (napis znad szyny idzie pod szynę). Prześwit od kotwicy
 *       zostaje ten sam, bo prostokąt nadal rośnie OD niej — zmienia się
 *       tylko zwrot. To stopień swobody TAŃSZY niż utrata tożsamości;
 *   (e) PIERWSZEŃSTWO — rozstrzyganie w porządku `kolejnoscRozstrzygania`
 *       (ranga tożsamości, priorytet rodzaju z `layout/declutter.ts`, ref):
 *       symbol zawsze wygrywa z etykietą, tożsamość wyższej rangi wygrywa
 *       z niższą. Tożsamość, która nie mieści się po ŻADNEJ stronie, NIE jest
 *       rysowana — plan zwraca ją jawnie (`tozsamosciWPodpowiedzi`), kanwa
 *       wpisuje ją do podpowiedzi uchwytu;
 *   (f) USTĄPIENIE SKRACALNEGO SĄSIADA (karta GPZ-MODEL, `ustapSasiadow`) —
 *       zanim tożsamość trafi do podpowiedzi, plan sprawdza, czy jej
 *       stronę zajmują wyłącznie etykiety, które po odsunięciu znów znajdą
 *       miejsce (zwykle skrócone); jeśli tak, oddają je. Liczba narysowanych
 *       etykiet rośnie, żadna nie wypada.
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
 * tym wprost (`tozsamosciWPodpowiedzi`). Własność ma
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
 * spełnić obu się nie da, trafia do podpowiedzi — tak samo jak ta, dla
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
 * podpowiedzi uchwytu (tożsamość) albo nie jest rysowany (dane). Wyrocznia:
 * `plannedLabelsOutsideSheet`.
 *
 * Czysta funkcja: brak DOM/Date/losowości (P7) — ten sam wynik w renderze,
 * teście i runnerze odbioru.
 */

import { rectsOverlap, type V3Rect } from '../core/grid';
import { WIERSZ_BLOKU_PRZEKAZNIKA, kolumnyBlokuWPismie } from '../core/kolumnyBloku';
import { buildRectIndex, createRectIndex, createRectItemIndex, type RectIndex, type RectItemIndex } from '../core/rectIndex';
import { blokKrawedzi, zasiegWierszaWRamce } from '../symbols/blokZabezpieczen';
import { MARGINES_TLA_POLA_GPZ } from '../compose/gpzAdnotacje';
import {
  enlargedFontSizeWithinProportion,
  fontSizeForScreenFloorWithinProportion,
  isLabelReadableAtScale,
  LABEL_TYPOGRAPHY,
  measureTextWidth,
  minReadableFontSize,
  MIN_READABLE_LABEL_SCREEN_PX,
  shortenPreservingIdentity,
} from '../core/text';
import { labelPriority, labelResolutionOrder } from '../layout/declutter';
import { wyrownanieEtykiety, type OwnedLabel, type SimpleAnchorPlacement, type WyrownanieTekstu } from '../layout/labels';
import { rectWithinSheet, type SheetOutline } from '../sheet/outline';
import { czytelnyNaEkranie, klasaInformacjiEtykiety } from './gestoscInformacji';
import { wnetrzePolRysowane } from './oknoRenderu';

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
  /** Strona, po której etykieta stoi względem kotwicy w TYM planie — strona zastępcza, gdy plan
   *  przeniósł etykietę (`stronyWKolejnosci`); `undefined` = strona zadeklarowana przez scenę
   *  (`label.placement`). Trafia do węzła tekstu (`wyrownanieEtykiety`, zaczep w krawędzi). */
  readonly strona?: SimpleAnchorPlacement;
  /** R4 — nazwa stacji/GPZ z PIERWSZEŃSTWEM (zaznaczona, z alarmem), dla której żadna pozycja
   *  nie była wolna od rysunku: stoi w swoim slocie mimo przeszkody (nazwa zaznaczonej stacji
   *  i stacji z alarmem jest ZAWSZE narysowana). Innych napisów nadal nie przykrywa. */
  readonly naRysunku?: true;
}

export interface LabelRenderPlan {
  /** Do narysowania, w ORYGINALNEJ kolejności sceny (stabilność `key`/testId). */
  readonly drawn: readonly PlannedLabel[];
  /** Tożsamości NIEnarysowane w tej skali (R4): przegrały kolizję z tożsamością
   *  wyższej rangi albo z rysunkiem, albo (ranga pola) ich pismo przekroczyłoby
   *  sufit proporcji. Nie giną — kanwa wpisuje je do podpowiedzi uchwytu
   *  w miejscu slotu sceny (`canvas/hitAreas.ts`), a nawigator czyta je z tej
   *  samej listy. Dane poniżej progu czytelności nie są tu wymieniane: ich brak
   *  jest regułą gęstości informacji (R3), nie stratą. */
  readonly tozsamosciWPodpowiedzi: readonly TozsamoscWPodpowiedzi[];
}

/** Tożsamość nienarysowana w tej skali — etykieta sceny i jej indeks (`data-testid`
 *  uchwytu `sld-v3-label-⟨indeks⟩`, ten sam co dla etykiety narysowanej). */
export interface TozsamoscWPodpowiedzi {
  readonly label: OwnedLabel;
  readonly index: number;
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
  /** K2b §0.2 (b): kandydat powiększony do podłogi OPISÓW CELU KADRU niesie tu
   *  swoją postać standardową (bez podłogi celu). Gdy postać celu nie znajdzie
   *  miejsca, plan próbuje standardowej — podłoga celu nigdy nie odbiera
   *  rysunkowi napisu, który bez niej by się narysował. `null` = postaci
   *  standardowej nie ma (próg czytelności albo sufit proporcji), więc brak
   *  miejsca dla postaci celu kończy się tym samym kubełkiem co bez podłogi. */
  readonly zapasowy?: Kandydat | null;
}

/**
 * K2b §0.2 (b) — PODŁOGA OPISÓW CELU KADRU. Etykiety należące do wykadrowanego
 * celu (`nalezy`) rysują się pismem nie mniejszym niż `screenPx` na ekranie, o ile
 * mieści się to w suficie proporcji klasy (`fontSizeForScreenFloorWithinProportion`),
 * także gdy bez podłogi byłyby ukryte progiem czytelności. Poza suficiem —
 * zachowanie bez podłogi (pierwszeństwo kompletności kadru, kryterium (a)).
 * Tworzy ją wyłącznie `zakresKadru.ts` (`podlogaOpisowCelu`) — ten sam obiekt
 * dostaje plan renderu kanwy i tusz etykiet kamery (predykaty parami).
 */
export interface PodlogaOpisowCelu {
  readonly screenPx: number;
  readonly nalezy: (label: OwnedLabel) => boolean;
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

/** Odmiana kroju etykiety (CSS font-weight) z jej klasy typograficznej — ta sama, którą
 *  rysuje `SceneLabelNode`; pomiar tuszu (`measureTextWidth`) liczy posuwy tej odmiany. */
function wagaPisma(label: Pick<OwnedLabel, 'labelClass'>): number {
  return LABEL_TYPOGRAPHY[label.labelClass].fontWeight;
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
 * rośnie, więc nie ma od czego rosnąć. Wyjątek: wiersz bloku z
 * `OwnedLabel.wyrownanieTekstu` — tusz przy krawędzi slotu, w której render
 * kotwiczy tekst (`layout/labels.ts::zaczepTekstuEtykiety`). Pismo POWIĘKSZONE
 * kotwiczy się stroną (patrz `anchoredRect`).
 */
function prostokatTuszu(
  slot: V3Rect,
  text: string,
  fontSize: number,
  fontWeight: number,
  rotated: boolean,
  placement: OwnedLabel['placement'],
  wyrownanie?: WyrownanieTekstu,
): V3Rect {
  const wzdluz = measureTextWidth(text, fontSize, fontWeight);
  const wpoprzek = wysokoscWiersza(fontSize);
  const rect = anchoredRect(slot, rotated ? wpoprzek : wzdluz, rotated ? wzdluz : wpoprzek, placement);
  // Wiersz bloku w piśmie naturalnym (`placement === undefined`): tusz skróconego tekstu
  // przy tej krawędzi slotu, w której render kotwiczy tekst (`zaczepTekstuEtykiety`) —
  // wiersze kolumny zachowują wspólną krawędź także po skróceniu.
  if (placement !== undefined || rotated || wyrownanie === undefined) return rect;
  return { ...rect, x: wyrownanie === 'poczatek' ? slot.x : slot.x + slot.width - rect.width };
}

/**
 * K2b×K3 — STRONA ZASTĘPCZA PRZY SYMBOLU. Prostokąt tuszu po stronie `placement`
 * OBRYSU symbolu, przy którym etykieta stoi (`OwnedLabel.obrysKotwicy`), z tym
 * samym prześwitem, jaki scena dała stronie zadeklarowanej (zmierzonym między
 * obrysem a slotem sceny — jedno źródło, bez drugiej stałej).
 *
 * DLACZEGO NIE OD SLOTU. Strona zastępcza liczona od slotu (`prostokatTuszu`)
 * dla etykiety „pod symbolem" to prostokąt wyśrodkowany na slocie: „nad"
 * kończy się na dolnej krawędzi slotu, „z prawej" zaczyna się na jego lewej
 * krawędzi. Dopóki pismo rosło tylko do progu czytelności, prostokąt był niski
 * i mijał symbol; podłoga opisów celu kadru (K2b, do 4× rozmiaru klasy t2)
 * daje wiersz wyższy niż prześwit pod symbolem, więc KAŻDA strona zastępcza
 * nachodziła na własny symbol etykiety i odpadała z definicji. Pomiar na
 * fiksturze referencyjnej po K3 (L1, skala 0,3, kadr stacji): 11 podpisów DER
 * rysowanych poniżej 13 px, choć sufit proporcji klasy dopuszcza podłogę.
 */
type WyrownaniePrzySymbolu = 'srodek' | 'poczatek' | 'koniec';
/** Kolejność wyrównań wzdłuż boku obrysu: wyśrodkowany, potem do krawędzi
 *  początkowej (góra / lewo), potem do końcowej (dół / prawo). Wiersz pisma
 *  powiększonego bywa wyższy od symbolu, więc wyśrodkowany wystaje nad i pod
 *  obrys — wyrównanie do krawędzi zostawia wolną jedną ze stron (pomiar: dwa
 *  źródła nN obok siebie, podpis lewego nad symbolem, prawego z prawej). */
const WYROWNANIA_PRZY_SYMBOLU: readonly WyrownaniePrzySymbolu[] = ['srodek', 'poczatek', 'koniec'];

function prostokatPrzySymbolu(
  label: OwnedLabel,
  obrys: V3Rect,
  text: string,
  fontSize: number,
  placement: SimpleAnchorPlacement,
  wyrownanie: WyrownaniePrzySymbolu,
): V3Rect {
  const rotated = label.rotated === true;
  const wzdluz = measureTextWidth(text, fontSize, wagaPisma(label));
  const wpoprzek = wysokoscWiersza(fontSize);
  const width = rotated ? wpoprzek : wzdluz;
  const height = rotated ? wzdluz : wpoprzek;
  const slot = label.rect;
  const przeswitSceny = (() => {
    switch (label.placement) {
      case 'below':
        return slot.y - (obrys.y + obrys.height);
      case 'above':
        return obrys.y - (slot.y + slot.height);
      case 'right':
        return slot.x - (obrys.x + obrys.width);
      case 'left':
        return obrys.x - (slot.x + slot.width);
      default:
        return 0;
    }
  })();
  const przeswit = Math.max(0, przeswitSceny);
  // Położenie wzdłuż boku obrysu: oś pozioma dla stron „nad/pod", pionowa dla
  // „z lewej/z prawej".
  const x =
    wyrownanie === 'srodek'
      ? obrys.x + obrys.width / 2 - width / 2
      : wyrownanie === 'poczatek'
        ? obrys.x
        : obrys.x + obrys.width - width;
  const y =
    wyrownanie === 'srodek'
      ? obrys.y + obrys.height / 2 - height / 2
      : wyrownanie === 'poczatek'
        ? obrys.y
        : obrys.y + obrys.height - height;
  switch (placement) {
    case 'above':
      return { x, y: obrys.y - przeswit - height, width, height };
    case 'below':
      return { x, y: obrys.y + obrys.height + przeswit, width, height };
    case 'left':
      return { x: obrys.x - przeswit - width, y, width, height };
    case 'right':
      return { x: obrys.x + obrys.width + przeswit, y, width, height };
  }
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

/** Klucz pasma etykiety: wiersze nazw stacji (`#name-row-N`) albo wiersze jednego bloku
 *  przekaźnika; `null` — etykieta poza pasmem. */
function kluczPasma(label: OwnedLabel): string | null {
  if (label.ownerKind === 'station-name') return `nazwy:${label.ownerRef.replace(NAME_ROW_SUFFIX, '')}`;
  const blok = blokWiersza(label);
  return blok === null ? null : `blok:${blok}`;
}

/** Ref pola-właściciela wiersza bloku zabezpieczeń (= `meta.ownerRef` symbolu bloku i `blok`
 *  krawędzi jego ramki, `symbols/blokZabezpieczen.ts::blokKrawedzi`); `null` — inna etykieta. */
function blokWiersza(label: OwnedLabel): string | null {
  return label.ownerKind === 'protection' && WIERSZ_BLOKU_PRZEKAZNIKA.test(label.ownerRef)
    ? label.ownerRef.replace(WIERSZ_BLOKU_PRZEKAZNIKA, '')
    : null;
}

/** Zbiór, z którym prostokąt planu nie może kolidować (indeks przestrzenny albo widok indeksu
 *  dla jednego kandydata — wiersz bloku nie widzi krawędzi własnej ramki). */
type ZbiorKolizji = Pick<RectIndex, 'anyOverlap'>;

/** Wynik przestawienia pasm: slot po przesunięciu pasma o przelew pod arkusz oraz slot bez
 *  tego przesunięcia (pasmo od swojej góry w scenie). */
interface PrzestawionePasma {
  readonly zKorekta: Map<number, V3Rect>;
  readonly bezKorekty: Map<number, V3Rect>;
}

/**
 * Karta SLD-SKALA-I-NAWIGACJA (R4, zgłoszenie z karty pól SN „obrys arkusza ucina opis
 * przy prawej krawędzi”) — czy prostokąt TUSZU mieści się w arkuszu dla tej etykiety.
 * Dane i tożsamość rangi pola — w obrysie sceny (`rectWithinSheet`): ich pismo ma
 * sufit proporcji, a obrys obejmuje ich pełne brzmienie (`prostokatArkuszaEtykiety`).
 * Nazwa GPZ, nazwa stacji i oznaczenie sekcji (ranga ≥ 2) mają stały rozmiar ekranowy
 * bez sufitu, więc ich tusz w świecie rośnie jak 1/skala i przy oddaleniu wychodzi poza
 * obrys wyznaczony pismem naturalnym; krawędź prawa i dolna jej nie odbiera — arkusz
 * rośnie razem z nią (`obrysArkuszaPlanu`, ramka `sheet/Frame.tsx`). Krawędź lewa
 * i górna (początek układu arkusza) obowiązuje każdą etykietę.
 */
function wArkuszu(rect: V3Rect, sheet: SheetOutline, label: OwnedLabel): boolean {
  if (rangaTozsamosci(label) < 2) return rectWithinSheet(rect, sheet);
  return rect.x >= -1e-9 && rect.y >= -1e-9;
}

/**
 * Obrys arkusza po planie (R4): obrys sceny powiększony w prawo i w dół o tusz
 * narysowanych tożsamości rangi ≥ 2 (`wArkuszu`). Ramka arkusza rysuje się po nim,
 * więc żaden napis tożsamości nie jest przecięty krawędzią. Przy skali, przy której
 * nic nie wystaje (eksport w skali rysunku, praca z bliska), równy obrysowi sceny.
 */
export function obrysArkuszaPlanu(plan: LabelRenderPlan, sheet: SheetOutline): SheetOutline {
  let width = sheet.width;
  let height = sheet.height;
  for (const p of plan.drawn) {
    if (rangaTozsamosci(p.label) < 2) continue;
    width = Math.max(width, p.rect.x + p.rect.width);
    height = Math.max(height, p.rect.y + p.rect.height);
  }
  return width === sheet.width && height === sheet.height ? sheet : { width, height };
}

function przestawPasma(kandydaci: readonly Kandydat[], sheet: SheetOutline): PrzestawionePasma {
  const pasma = new Map<string, Kandydat[]>();
  for (const k of kandydaci) {
    const klucz = kluczPasma(k.label);
    if (klucz === null) continue;
    const lista = pasma.get(klucz);
    if (lista) lista.push(k);
    else pasma.set(klucz, [k]);
  }
  const wynik = new Map<number, V3Rect>();
  const bezKorekty = new Map<number, V3Rect>();
  for (const [klucz, wiersze] of pasma) {
    // Karta UX-04/POLE-LINIOWE-WZORZEC (blok przekaźnika): wiersze bloku stoją w odstępie
    // `ODSTEP_WIERSZY_KODOW_EAZ` od siebie; pismo podłogi celu kadru (13 px → wiersz 19 j.św.)
    // jest wyższe od tego odstępu, więc powiększone wiersze nachodziły na siebie i plan
    // przenosił kolejny wiersz na drugą stronę okręgu (wiersz poza blokiem i ramką). Blok to
    // pasmo jak nazwy stacji, z jedną różnicą: wiersz NIE wchodzi wyżej niż w scenie (y =
    // max(y sceny, dół poprzedniego)) — pismo naturalne zostaje bajtowo w miejscu sceny.
    const blok = klucz.startsWith('blok:');
    // Kolejność wierszy: nazwy — kolejność sceny (indeks rośnie razem z `#name-row-N`); blok —
    // pozycja w scenie (odniesienia stoją pod kodami niezależnie od kolejności dopisania).
    const uporzadkowane = [...wiersze].sort((a, b) => (blok ? a.slot.y - b.slot.y || a.slot.x - b.slot.x || a.index - b.index : a.index - b.index));
    const gora = Math.min(...uporzadkowane.map((k) => k.slot.y));
    let y = gora;
    const pas: { readonly index: number; readonly rect: V3Rect }[] = [];
    // Odbiór B-02 pkt 7: kody bloku w KOLUMNACH — komórki jednego wiersza sceny (wspólne `y`)
    // dzielą wiersz pasma (jedno `y`, wysokość najwyższej), a kolumny przesuwają się w prawo
    // o przyrost szerokości poprzedniej kolumny (`kolumnyBlokuWPismie` — to samo źródło co zapas
    // szerokości kolumny pola GPZ). Dawniej każda komórka była osobnym wierszem pasma, więc
    // powiększone pismo układało dwie kolumny w jedną (prawa komórka zjeżdżała między wiersze).
    const xKomorek = blok
      ? kolumnyBlokuWPismie(
          uporzadkowane.map((k) => ({
            x: k.slot.x,
            y: k.slot.y,
            width: k.slot.width,
            szerokoscPisma: k.enlarged ? measureTextWidth(k.tekstBazowy, k.fontSize, wagaPisma(k.label)) : k.slot.width,
          })),
        )
      : null;
    for (let i = 0; i < uporzadkowane.length; ) {
      const wiersz = blok ? uporzadkowane.filter((k, j) => j >= i && k.slot.y === uporzadkowane[i].slot.y) : [uporzadkowane[i]];
      const height = Math.max(...wiersz.map((k) => (k.enlarged ? wysokoscWiersza(k.fontSize) : k.slot.height)));
      const yWiersza = blok ? Math.max(wiersz[0].slot.y, y) : y;
      wiersz.forEach((k, j) => {
        const x = xKomorek ? xKomorek[i + j] : k.slot.x;
        pas.push({ index: k.index, rect: { x, y: yWiersza, width: k.slot.width, height: k.enlarged ? wysokoscWiersza(k.fontSize) : k.slot.height } });
      });
      y = yWiersza + height;
      i += wiersz.length;
    }
    // Przesunięcie pasma jako bloku: najpierw w górę o wystawanie pod arkusz,
    // potem (gdy pasmo jest wyższe od miejsca nad nim) z powrotem do y=0.
    // Pasmo wyższe od CAŁEGO arkusza zostaje bez przesunięcia — nie ma dokąd
    // go przesunąć, a udawanie, że jest inaczej, byłoby cichym zerem.
    const przelew = Math.max(0, y - sheet.height);
    const korekta = Math.min(przelew, Math.max(0, gora));
    for (const { index, rect } of pas) {
      wynik.set(index, korekta === 0 ? rect : { ...rect, y: rect.y - korekta });
      bezKorekty.set(index, rect);
    }
  }
  return { zKorekta: wynik, bezKorekty };
}

interface Dopasowanie {
  readonly text: string;
  readonly rect: V3Rect;
  readonly fontSize: number;
  readonly enlarged: boolean;
  /** Strona kotwicy dopasowania (`PlannedLabel.strona`). */
  readonly strona?: SimpleAnchorPlacement;
}

/**
 * S9-7 (d): STRONY KOTWICY w kolejności ustępstw — zadeklarowana przez scenę,
 * potem przeciwna (napis znad szyny idzie pod szynę), na końcu dwie
 * prostopadłe. Prostokąt zawsze rośnie OD kotwicy, więc prześwit od toru/
 * symbolu jest zachowany na każdej z nich; zmienia się wyłącznie ZWROT.
 *
 * K2b×K3: dla etykiety stojącej przy SYMBOLU (`OwnedLabel.obrysKotwicy`) strony
 * inne niż zadeklarowana liczone są od OBRYSU symbolu (`prostokatPrzySymbolu`),
 * a nie od slotu — inaczej „nad" i „z boku" etykiety „pod symbolem" leżały na
 * tym symbolu, gdy tylko wiersz pisma był wyższy od prześwitu pod nim (pismo
 * podłogi opisów celu kadru). Przypięte: `__tests__/stronyPrzySymbolu.test.ts`.
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
 *  2. pełny tekst po KOLEJNYCH stronach kotwicy (`stronyWKolejnosci`);
 *  3. dopiero gdy pełny tekst nie mieści się po ŻADNEJ stronie — tekst
 *     SKRÓCONY z zachowaniem członu rozróżniającego, pismem powiększonym,
 *     po stronach w tej samej kolejności: najdłuższa postać, która się mieści
 *     (wyszukiwanie POŁÓWKOWE po DOSTĘPNEJ SZEROKOŚCI; poprawne, bo prostokąt
 *     jest zakotwiczony, więc węższy daje prostokąt ZAWARTY w szerszym, a
 *     `shortenPreservingIdentity` jest nierosnąca względem szerokości).
 *
 * W2C-PLAN-ETYKIET: do tej karty kroki 2 i 3 szły w odwrotnej kolejności
 * (skracanie po stronie zadeklarowanej PRZED zmianą strony), choć nagłówek
 * pliku (d) nazywa zmianę strony stopniem TAŃSZYM niż utrata tożsamości.
 * Zmierzony skutek na scenie toru DER-SN (L2 @1,02): identyfikator
 * przekładnika „TV1" stykał się powiększonym o 1 j.św. tuszem z symbolem TR
 * blokowego po lewej i był rysowany jako „T…" — czyli znak czytany jak
 * transformator — mimo że po prawej stronie kotwicy miał wolne miejsce na
 * pełny tekst. Krótki identyfikator aparatu nie ma członu, który dałoby się
 * odciąć bez utraty znaczenia.
 *
 * `null` = nie ma miejsca po ŻADNEJ stronie nawet dla najkrótszej formy
 * niosącej człon rozróżniający. Wołający wtedy etykiety NIE rysuje i mówi o
 * tym wprost — pisma NIE zmniejszamy poniżej progu czytelności (patrz
 * „TWARDA PODŁOGA EKRANOWA" w nagłówku pliku).
 */
function najlepszeDopasowanie(
  kandydat: Kandydat,
  zajete: ZbiorKolizji,
  obstacles: ZbiorKolizji,
  sheet: SheetOutline,
): Dopasowanie | null {
  const { label, fontSize, slot, tekstBazowy } = kandydat;
  const rotated = label.rotated === true;
  const wzdluzSzyny = label.ownerKind === 'busbar-voltage';
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
    wArkuszu(rect, sheet, label) && !obstacles.anyOverlap(rect) && !zajete.anyOverlap(rect);

  if (!kandydat.enlarged) {
    // Etykiety NIEpowiększone nie mają gdzie się przestawiać — ich slot jest
    // rozstrzygnięty declutterem przy budowie sceny. Prostokątem planu jest
    // jednak TUSZ (wyśrodkowany w slocie, tak jak go rysuje `SceneLabelNode`),
    // a nie sam slot: tekst został już skrócony do rozciągłości slotu
    // (`tekstBazowy`), więc tusz ⊆ slot ⊆ rezerwacja ⊆ arkusz.
    const tusz = prostokatTuszu(slot, tekstBazowy, fontSize, wagaPisma(label), rotated, undefined, wyrownanieEtykiety(label));
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
    const wynik = shortenPreservingIdentity(tekstBazowy, fontSize, wagaPisma(label), maxWidth);
    skroconeDo.set(maxWidth, wynik);
    return wynik;
  };

  // K2b×K3: `przyObrysie` — strona zastępcza etykiety stojącej przy symbolu,
  // liczona od OBRYSU symbolu (`prostokatPrzySymbolu`), w trzech wyrównaniach
  // wzdłuż boku obrysu (środek, początek, koniec). Inaczej — od slotu sceny.
  const geometria = (
    placement: OwnedLabel['placement'],
    przyObrysie: boolean,
  ): {
    readonly wyrownania: readonly (WyrownaniePrzySymbolu | null)[];
    readonly prostokatDla: (text: string, wyrownanie: WyrownaniePrzySymbolu | null) => V3Rect;
  } => {
    const obrys = label.obrysKotwicy;
    // Napis szyny (`busbar-voltage`): obrysem jest ODCINEK SZYNY, więc strona zadeklarowana
    // też ma wyrównania wzdłuż obrysu — napis przesuwa się wzdłuż własnej szyny (początek,
    // środek, koniec), zanim przejdzie na jej drugą stronę (R4: bez wielokropka).
    const przySymbolu =
      przyObrysie && obrys !== undefined && placement !== undefined && (placement !== label.placement || wzdluzSzyny);
    return {
      wyrownania: przySymbolu ? WYROWNANIA_PRZY_SYMBOLU : [null],
      prostokatDla: (text, wyrownanie) =>
        przySymbolu && wyrownanie !== null && placement !== undefined
          ? prostokatPrzySymbolu(label, obrys, text, fontSize, placement, wyrownanie)
          : prostokatTuszu(slot, text, fontSize, wagaPisma(label), rotated, placement),
    };
  };

  // (1) pełny tekst — każde wyrównanie po kolei.
  const probojPelny = (placement: OwnedLabel['placement'], przyObrysie: boolean): Dopasowanie | null => {
    if (tekstBazowy.length === 0) return null;
    const { wyrownania, prostokatDla } = geometria(placement, przyObrysie);
    for (const wyrownanie of wyrownania) {
      const pelny = prostokatDla(tekstBazowy, wyrownanie);
      if (wolne(pelny)) return { text: tekstBazowy, rect: pelny, fontSize, enlarged: true, ...(placement !== undefined ? { strona: placement } : {}) };
    }
    return null;
  };

  // (2) wyszukiwanie połówkowe po DOSTĘPNEJ SZEROKOŚCI [px świata] — dla
  // każdego wyrównania osobno (prostokąt zakotwiczony: węższy ⊆ szerszy).
  const probojSkrocony = (placement: OwnedLabel['placement'], przyObrysie: boolean): Dopasowanie | null => {
    const { wyrownania, prostokatDla } = geometria(placement, przyObrysie);
    for (const wyrownanie of wyrownania) {
      let lo = 1;
      let hi = Math.max(1, Math.ceil(measureTextWidth(tekstBazowy, fontSize, wagaPisma(label))) - 1);
      let najlepszy: Dopasowanie | null = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const text = skroc(mid);
        if (text.length === 0) {
          lo = mid + 1; // za wąsko na jakąkolwiek formę — szukamy szerzej
          continue;
        }
        const rect = prostokatDla(text, wyrownanie);
        if (wolne(rect)) {
          najlepszy = { text, rect, fontSize, enlarged: true, ...(placement !== undefined ? { strona: placement } : {}) };
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (najlepszy) return najlepszy;
    }
    return null;
  };

  // Pełny tekst po KAŻDEJ stronie, zanim jakakolwiek strona dostanie skrót (W2C-PLAN-ETYKIET:
  // dawniej plan skracał po stronie zadeklarowanej — „TV1” → „T…”, czytane jak transformator).
  const przejscie = (kolejnosc: readonly OwnedLabel['placement'][], przyObrysie: boolean): Dopasowanie | null => {
    for (const strona of kolejnosc) {
      const dopasowanie = probojPelny(strona, przyObrysie);
      if (dopasowanie) return dopasowanie;
    }
    // R4: tożsamość nie dostaje wielokropka — pełny tekst albo ustąpienie.
    if (klasaInformacjiEtykiety(label) === 'tozsamosc') return null;
    for (const strona of kolejnosc) {
      const dopasowanie = probojSkrocony(strona, przyObrysie);
      if (dopasowanie) return dopasowanie;
    }
    return null;
  };

  const strony = stronyWKolejnosci(label.placement);
  const pierwsze = przejscie(strony.length === 0 ? [label.placement] : strony, false);
  if (pierwsze) return pierwsze;
  // K2b×K3 — DRUGIE PRZEJŚCIE: strony przy OBRYSIE symbolu, dopiero gdy żadna
  // strona liczona od slotu (z pełnym tekstem ani skróconym) nie ma miejsca.
  // Kolejność celowa: wszędzie tam, gdzie plan dotąd coś znajdował, wynik jest
  // bajtowo ten sam (pomiar: odciski planu bez zmian poza przypadkami, w których
  // pierwsze przejście kończyło się porzuceniem albo postacią zapasową); strona
  // przy symbolu zabiera miejsce sąsiadom tylko zamiast utraty etykiety. Reguła
  // „pełny tekst po każdej stronie przed skrótem" obowiązuje też tutaj.
  if (label.obrysKotwicy !== undefined) {
    return przejscie(
      wzdluzSzyny ? [label.placement, ...strony.filter((strona) => strona !== label.placement)] : strony.filter((strona) => strona !== label.placement),
      true,
    );
  }
  return null;
}

/**
 * (f) USTĄPIENIE SKRACALNEGO SĄSIADA — karta GPZ-MODEL (pomiar na `gpzFeeder`,
 * L2 przy skali dopasowania 0,4034): oznacznik „Q1" wyłącznika pierwszego pola
 * stacji S01 nie mieścił się po ŻADNEJ stronie, bo z lewej leżało powiększone
 * pełnym tekstem oznaczenie ostatniego pola GPZ („Pole liniowe GPZ 1.2", t3,
 * tusz 248–525 j.św.), a pozostałe trzy strony zajmował symbol wyłącznika.
 * Oznaczenie GPZ dostało miejsce PIERWSZE (ten sam priorytet, wyższe `y`)
 * i wzięło pełny tekst, choć mieści się także skrócone z zachowaniem członu
 * rozróżniającego; dwuznakowego „Q1" skrócić się nie da. Plan zachłanny gubił
 * więc tożsamość od KOLIZJI — dokładnie to, czego zakazuje kontrakt KD-11
 * („żadna tożsamość nie ginie od kolizji, jeśli da się ją narysować").
 *
 * Reguła: tożsamość, dla której zabrakło miejsca, próbuje swoich stron po
 * kolei (`stronyWKolejnosci`) z TEKSTEM BAZOWYM. Strona wchodzi w grę tylko
 * wtedy, gdy mieści się w arkuszu i nie dotyka RYSUNKU (symbol i tor zawsze
 * wygrywają), a zajmują ją wyłącznie etykiety. Każdy taki sąsiad jest
 * dopasowywany od nowa (pełna maszyneria `najlepszeDopasowanie`: skracanie
 * i strony) wobec zbioru zajętego BEZ niego, z nową tożsamością. Jedno źródło
 * prawdy o tym, KTO może ustąpić, to właśnie to ponowne dopasowanie: sąsiad
 * w piśmie naturalnym ma jedną postać (tusz we własnym slocie sceny,
 * rozstrzygniętym declutterem), więc wraca dokładnie na zajęte miejsce i nie
 * ustępuje nigdy — bez osobnego warunku „tylko powiększone", który mógłby się
 * z tym rozjechać. Zmiana jest przyjmowana WYŁĄCZNIE wtedy, gdy
 * KAŻDY sąsiad znów znajdzie miejsce — liczba narysowanych etykiet rośnie
 * o jeden, żadna nie wypada (inaczej plan zostaje bez zmian). Wszędzie, gdzie
 * plan dotąd rysował każdą tożsamość, ta gałąź nie jest nawet wywoływana —
 * wynik bajtowo ten sam. Przypięte: `__tests__/ustapienieSasiada.test.ts`.
 *
 * Mutuje `zaplanowane`/`uzyteKandydaty` tylko przy powodzeniu i zwraca wtedy etykiety
 * zmienione (sąsiedzi i nowa tożsamość); wołający dokłada je do indeksu, a wpisy
 * nieaktualne odpadają porównaniem z `zaplanowane` (`zajeteDlaBez`). Brak zmiany — `null`.
 */
function ustapSasiadow(
  kandydat: Kandydat,
  zaplanowane: Map<number, PlannedLabel>,
  uzyteKandydaty: Map<number, Kandydat>,
  przeszkodyDla: (k: Kandydat) => ZbiorKolizji,
  ramkiZajete: ZbiorKolizji,
  sheet: SheetOutline,
  zaplanowaneWgMiejsca: RectItemIndex<PlannedLabel>,
  pozycjaWKolejnosci: ReadonlyMap<number, number>,
): readonly PlannedLabel[] | null {
  const { label, slot, tekstBazowy, fontSize } = kandydat;
  if (!kandydat.enlarged || tekstBazowy.length === 0) return null;
  const rotated = label.rotated === true;
  const strony = stronyWKolejnosci(label.placement);
  const obstacles = przeszkodyDla(kandydat);
  for (const strona of strony.length === 0 ? [label.placement] : strony) {
    const rect = prostokatTuszu(slot, tekstBazowy, fontSize, wagaPisma(label), rotated, strona);
    // Ramka dorysowana do powiększonych wierszy bloku zabezpieczeń jest rysunkiem — nie ustępuje.
    if (!wArkuszu(rect, sheet, label) || obstacles.anyOverlap(rect) || ramkiZajete.anyOverlap(rect)) continue;
    // Karta SLD-SKALA-I-NAWIGACJA (budżet klatki, `kosztSceny.test.ts`): sąsiedzi z indeksu
    // przestrzennego zamiast przeglądu wszystkich zaplanowanych — przegląd liniowy przy każdej
    // tożsamości bez miejsca dawał koszt kwadratowy (pomiar 2026-11-12: plan 673 ms przy skali
    // 0,4 na sieci podwojonej). Kolejność sąsiadów = kolejność wstawienia do planu (pozycja
    // w porządku rozstrzygania), więc wynik bajtowo ten sam co przy przeglądzie mapy.
    const znalezione = new Map<number, PlannedLabel>();
    zaplanowaneWgMiejsca.someCandidate(rect, (p) => {
      if (rectsOverlap(p.rect, rect) && zaplanowane.get(p.index) === p) znalezione.set(p.index, p);
      return false;
    });
    const blokujace = [...znalezione.values()].sort(
      (a, b) => (pozycjaWKolejnosci.get(a.index) ?? 0) - (pozycjaWKolejnosci.get(b.index) ?? 0),
    );
    if (blokujace.length === 0) continue;
    // Wiersz bloku zabezpieczeń nie ustępuje: blok to ramka z wierszami (jedna notacja), wiersz
    // przeniesiony na inną stronę wyszedłby z ramki.
    if (blokujace.some((p) => blokWiersza(p.label) !== null)) continue;
    const odsuniete = new Set(blokujace.map((p) => p.index));
    // Zbiór zajęty BEZ odsuniętych: zaplanowane z indeksu (bez odsuniętych) + nowa tożsamość
    // + kolejno dopasowani sąsiedzi — ten sam zbiór co dawny indeks budowany od zera.
    const dodane = createRectIndex();
    dodane.add(rect);
    const zajeteBez = {
      anyOverlap: (r: V3Rect): boolean =>
        dodane.anyOverlap(r) ||
        zaplanowaneWgMiejsca.someCandidate(
          r,
          (p) => !odsuniete.has(p.index) && zaplanowane.get(p.index) === p && rectsOverlap(r, p.rect),
        ),
      add: (r: V3Rect): void => dodane.add(r),
    };
    const nowe: PlannedLabel[] = [];
    let wszystkieMieszcza = true;
    for (const p of blokujace) {
      const sasiad = uzyteKandydaty.get(p.index);
      const zajeteSasiada: ZbiorKolizji = { anyOverlap: (r) => zajeteBez.anyOverlap(r) || ramkiZajete.anyOverlap(r) };
      const d = sasiad ? najlepszeDopasowanie(sasiad, zajeteSasiada, przeszkodyDla(sasiad), sheet) : null;
      if (!sasiad || !d || d.text.length === 0) {
        wszystkieMieszcza = false;
        break;
      }
      zajeteBez.add(d.rect);
      nowe.push({ label: p.label, index: p.index, text: d.text, fontSize: d.fontSize, rect: d.rect, enlarged: d.fontSize > LABEL_TYPOGRAPHY[p.label.labelClass].fontSize + 1e-9, ...(d.strona !== undefined ? { strona: d.strona } : {}) });
    }
    if (!wszystkieMieszcza) continue;
    for (const p of nowe) zaplanowane.set(p.index, p);
    const wlasna: PlannedLabel = {
      label,
      index: kandydat.index,
      text: tekstBazowy,
      fontSize,
      rect,
      enlarged: fontSize > LABEL_TYPOGRAPHY[label.labelClass].fontSize + 1e-9,
      ...(strona !== undefined ? { strona } : {}),
    };
    zaplanowane.set(kandydat.index, wlasna);
    uzyteKandydaty.set(kandydat.index, kandydat);
    return [...nowe, wlasna];
  }
  return null;
}

/**
 * KARTA SLD-SKALA-I-NAWIGACJA (R4) — RANGA TOŻSAMOŚCI w rozstrzyganiu kolizji:
 * GPZ (4) > stacja (3) > sekcja szyny (2) > pole (1: oznaczenie aparatu, rola
 * pola, źródło, punkt rozcięcia, łącznik toru, zabezpieczenie), dane — 0.
 *
 * Nazwa bloku to PIERWSZY wiersz pasma nazw (`layout/labels.ts`
 * `resolveStationNameBand`: `${blok}#name-row-0`) bloku stacji (`…/station`)
 * albo GPZ (`gpz/…/substation`) — rozpoznanie po strukturze refu modelu, nie po
 * treści napisu (ten sam kontrakt refów, którym posługują się `scene/crossings.ts`
 * i panel kontekstowy schematu). Pozostałe wiersze tożsamości pasma nazw (szyna
 * nN stacji, oznaczenie transformatora i nazwa źródła w paśmie GPZ) opisują
 * zawartość bloku bez własnego małego kształtu — ranga sekcji, tak jak napięcie
 * szyny (`busbar-voltage`).
 */
export function rangaTozsamosci(label: OwnedLabel): number {
  if (klasaInformacjiEtykiety(label) !== 'tozsamosc') return 0;
  if (label.ownerKind === 'station-name') {
    const [blok, wiersz] = label.ownerRef.split('#');
    if (wiersz === 'name-row-0' && blok !== undefined) {
      if (blok.startsWith('gpz/') && blok.endsWith('/substation')) return 4;
      if (blok.endsWith('/station')) return 3;
    }
    return 2;
  }
  if (label.ownerKind === 'busbar-voltage') return 2;
  return 1;
}

/**
 * Porządek rozstrzygania planu (R4): nazwy GPZ, nazwy stacji i oznaczenia sekcji
 * (ranga ≥ 2) malejąco wg rangi, przed całą resztą; tożsamość rangi pola i dane
 * dzielą jeden poziom, na którym rozstrzyga priorytet rodzaju właściciela
 * (`layout/declutter.ts` `labelPriority` — ta sama tabela co declutter sceny:
 * marker stanu NO, numer zabezpieczenia, moc źródła przed oznacznikiem aparatu,
 * przed opisem kierunku i parametrami przęsła), a dalej położenie slotu i ref —
 * porządek declutteru sceny (`labelResolutionOrder`). Remis rangi ≥ 2 — priorytet
 * rodzaju, potem ref właściciela rosnąco; na końcu indeks etykiety w scenie (pełny porządek liniowy, warunek
 * determinizmu: wynik nie zależy od kolejności wejścia ani od położenia na arkuszu).
 */
function poziomRozstrzygania(label: OwnedLabel): number {
  return Math.max(1, rangaTozsamosci(label));
}

/**
 * R4 (rozstrzygnięcie architekta 2026-11-12): NAZWA stacji albo GPZ (ranga ≥ 3), której blok
 * należy do `pierwszenstwo` (stacja zaznaczona, stacja z alarmem), wygrywa rozstrzyganie przed
 * każdą inną etykietą — także przed nazwą GPZ. Remis między nimi rozstrzyga zwykły porządek
 * (`kolejnoscRozstrzygania`), więc wynik jest deterministyczny.
 */
export function poziomPierwszenstwa(label: OwnedLabel, pierwszenstwo: ReadonlySet<string> | undefined): number {
  if (pierwszenstwo === undefined || pierwszenstwo.size === 0 || rangaTozsamosci(label) < 3) return 0;
  return pierwszenstwo.has(label.ownerRef.split('#')[0] ?? '') ? 1 : 0;
}


export function kolejnoscRozstrzygania(
  a: { readonly label: OwnedLabel; readonly index: number },
  b: { readonly label: OwnedLabel; readonly index: number },
): number {
  const poziomA = poziomRozstrzygania(a.label);
  const ranga = poziomRozstrzygania(b.label) - poziomA;
  if (ranga !== 0) return ranga;
  if (poziomA === 1) {
    // Poziom pola i danych: porządek declutteru sceny (`labelResolutionOrder` — priorytet,
    // położenie, ref), ten sam, którym scena rozstrzygnęła sloty (predykaty parami).
    const scena = labelResolutionOrder(
      { priority: labelPriority(a.label), rect: a.label.rect, ownerRef: a.label.ownerRef },
      { priority: labelPriority(b.label), rect: b.label.rect, ownerRef: b.label.ownerRef },
    );
    return scena !== 0 ? scena : a.index - b.index;
  }
  const priorytet = labelPriority(b.label) - labelPriority(a.label);
  if (priorytet !== 0) return priorytet;
  if (a.label.ownerRef !== b.label.ownerRef) return a.label.ownerRef < b.label.ownerRef ? -1 : 1;
  return a.index - b.index;
}

/**
 * Rozmiar pisma tożsamości [px ŚWIATA] dla skali kamery (R4). Nazwa GPZ, nazwa
 * stacji i oznaczenie sekcji (ranga ≥ 2) — STAŁY rozmiar ekranowy poniżej progu
 * czytelności, bez sufitu proporcji (`minReadableFontSize`). Tożsamość rangi pola
 * — w granicy sufitu proporcji klasy (`enlargedFontSizeWithinProportion`); `null`
 * ⇒ napisu nie da się narysować proporcjonalnie i trafia do podpowiedzi.
 */
/**
 * ADNOTACJA o stałej wielkości ekranowej (R4, rozstrzygnięcie architekta 2026-11-12): nazwa GPZ,
 * nazwa stacji, oznaczenie sekcji i szyny (ranga tożsamości ≥ 2). Jedno źródło prawdy dla pary
 * „rozmiar pisma bez sufitu proporcji” (`pismoTozsamosci`) i „zwolnienie ze strażnika sufitu”
 * (`plannedLabelsAboveProportionCeiling`) — kontrakt proporcji (napis ≤ 2,5 glifu) dotyczy
 * NAPISÓW SCENY (oznacznik aparatu, opis pola, dane), nie adnotacji.
 */
export function adnotacjaStalejWielkosci(label: OwnedLabel): boolean {
  return rangaTozsamosci(label) >= 2;
}

function pismoTozsamosci(label: OwnedLabel, scale: number): number | null {
  return adnotacjaStalejWielkosci(label)
    ? minReadableFontSize(label.labelClass, scale)
    : enlargedFontSizeWithinProportion(label.labelClass, scale);
}

/**
 * Plan renderu etykiet sceny dla skali kamery. `obstacles` to prostokąty
 * SYMBOLI i ODCINKÓW TORU sceny (`sceneObstacleRects`, `scene/buildScene.ts`) —
 * „tor elektryczny nie znika", więc rysunek ZAWSZE wygrywa z etykietą (ta sama
 * zasada, co `declutterLabels`).
 *
 * `poprzednio` — indeksy etykiet narysowanych w poprzedniej klatce tej samej
 * sceny (histereza progu czytelności danych, R3, `czytelnyNaEkranie`);
 * `undefined` = brak historii (sam próg).
 *
 * Skala niewiarygodna (≤0/NaN — np. viewport 0×0 przed pierwszym pomiarem
 * układu) ⇒ plan tożsamościowy: wszystko rysowane naturalnie (brak pomiaru nie
 * jest dowodem nieczytelności — parytet z `isLabelReadableAtScale`).
 */
/** Obrys tła wyrosłego z `r` (z marginesem tła pola) mieści się w kolumnie tła pola. */
function wKolumnieTla(r: V3Rect, kolumna: V3Rect): boolean {
  const m = MARGINES_TLA_POLA_GPZ;
  const eps = 1e-9;
  return (
    r.x - m >= kolumna.x - eps &&
    r.y - m >= kolumna.y - eps &&
    r.x + r.width + m <= kolumna.x + kolumna.width + eps &&
    r.y + r.height + m <= kolumna.y + kolumna.height + eps
  );
}

/** LOD0: opisy stacji rysowanych symbolem przeglądowym przeniesione do podpowiedzi — indeksy
 *  etykiet sceny (`glifZbiorczy.etykietyPrzegladu`). */
export interface EtykietyPrzegladuStacji {
  readonly ukryte: ReadonlySet<number>;
}

export function planSceneLabels(
  labels: readonly OwnedLabel[],
  obstacles: readonly V3Rect[],
  scale: number,
  sheet: SheetOutline,
  podlogaCelu?: PodlogaOpisowCelu,
  poprzednio?: ReadonlySet<number>,
  pierwszenstwo?: ReadonlySet<string>,
  przeglad?: EtykietyPrzegladuStacji,
  /** Skala reprezentująca poziom szczegółu z histerezą (`oknoRenderu.skalaPoziomu`);
   *  domyślnie `scale`. */
  skalaLod?: number,
): LabelRenderPlan {
  if (!Number.isFinite(scale) || scale <= 0) {
    return {
      drawn: labels.map((label, index) => {
        const fontSize = LABEL_TYPOGRAPHY[label.labelClass].fontSize;
        const rotated = label.rotated === true;
        // Dane skracane do slotu (granica niezależna od skali); tożsamość w całości.
        const text =
          klasaInformacjiEtykiety(label) === 'tozsamosc'
            ? label.text
            : shortenPreservingIdentity(label.text, fontSize, wagaPisma(label), rozciagloscWzdluzTekstu(label.rect, rotated));
        return {
          label,
          index,
          text,
          fontSize,
          rect: prostokatTuszu(label.rect, text, fontSize, wagaPisma(label), rotated, undefined, wyrownanieEtykiety(label)),
          enlarged: false,
        };
      }),
      tozsamosciWPodpowiedzi: [],
    };
  }

  const tozsamosciWPodpowiedzi: TozsamoscWPodpowiedzi[] = [];
  const kandydaci: Kandydat[] = [];
  /** Kandydat bez podłogi celu; `null` — etykiety nie ma w tej skali (dane poniżej
   *  progu czytelności) albo tożsamość rangi pola ponad sufitem proporcji. */
  const kandydatStandardowy = (label: OwnedLabel, index: number): Kandydat | null => {
    const naturalny = LABEL_TYPOGRAPHY[label.labelClass].fontSize;
    const rotated = label.rotated === true;
    if (klasaInformacjiEtykiety(label) !== 'tozsamosc') {
      // R3: dane widoczne, gdy ich pismo naturalne jest czytelne na ekranie (z histerezą).
      const czytelnaEtykieta = czytelnyNaEkranie(naturalny, scale, poprzednio === undefined ? undefined : poprzednio.has(index));
      if (!czytelnaEtykieta) return null;
      // RAMKA-TNIE-PODPISY: pismo naturalne ma granicę — własny slot etykiety.
      const tekstBazowy = shortenPreservingIdentity(label.text, naturalny, wagaPisma(label), rozciagloscWzdluzTekstu(label.rect, rotated));
      return { label, index, fontSize: naturalny, enlarged: false, slot: label.rect, tekstBazowy };
    }
    const fontSize = isLabelReadableAtScale(label.labelClass, scale) ? naturalny : pismoTozsamosci(label, scale);
    if (fontSize === null) return null;
    // R4: tożsamość w CAŁOŚCI (bez wielokropka). Gdy pełny tekst wychodzi poza slot
    // sceny (pismo powiększone albo tekst szerszy od slotu), etykieta przechodzi
    // przez rozstrzyganie kolizji — slot sceny był rozstrzygnięty declutterem dla
    // tuszu wpisanego w slot, nie dla tuszu pełnego tekstu.
    const powiekszona = fontSize > naturalny;
    const szerszaOdSlotu = measureTextWidth(label.text, fontSize, wagaPisma(label)) > rozciagloscWzdluzTekstu(label.rect, rotated) + 1e-9;
    return { label, index, fontSize, enlarged: powiekszona || szerszaOdSlotu, slot: label.rect, tekstBazowy: label.text };
  };
  // Widok ogólny LOD0 (`oknoRenderu.wnetrzePolRysowane`): oznaczenie aparatu pola (Q1, Q0…) nie
  // jest rysowane, gdy wnętrza pól nie są rysowane — przechodzi do podpowiedzi celu (informacja
  // zostaje, rysunek ogólny nie dostaje napisów przy obrysach aparatów).
  const wnetrzePol = wnetrzePolRysowane(skalaLod ?? scale);
  labels.forEach((label, index) => {
    // LOD0 (dyrektywa właściciela 2026-11-13 pkt 3a): stacja w symbolu przeglądowym bez wierszy
    // pasma nazw poza nazwą i bez opisów obiektów nierysowanych (`glifZbiorczy.etykietyPrzegladu`).
    if (przeglad?.ukryte.has(index)) {
      tozsamosciWPodpowiedzi.push({ label, index });
      return;
    }
    const tozsamosc = klasaInformacjiEtykiety(label) === 'tozsamosc';
    if (tozsamosc && !wnetrzePol && label.ownerKind === 'apparatus') {
      tozsamosciWPodpowiedzi.push({ label, index });
      return;
    }
    const standardowy = kandydatStandardowy(label, index);
    const fontCelu =
      podlogaCelu !== undefined && podlogaCelu.nalezy(label)
        ? fontSizeForScreenFloorWithinProportion(label.labelClass, scale, podlogaCelu.screenPx)
        : null;
    if (fontCelu !== null && fontCelu > LABEL_TYPOGRAPHY[label.labelClass].fontSize && (standardowy === null || fontCelu > standardowy.fontSize)) {
      // Postać celu: pismo powiększone do podłogi celu. Tożsamość w całości, dane —
      // pełny tekst (rozstrzyganie kolizji skraca je w razie potrzeby).
      kandydaci.push({
        label,
        index,
        fontSize: fontCelu,
        enlarged: true,
        slot: label.rect,
        tekstBazowy: label.text,
        zapasowy: standardowy,
      });
      return;
    }
    if (standardowy !== null) kandydaci.push(standardowy);
    else if (tozsamosc) tozsamosciWPodpowiedzi.push({ label, index });
  });

  // ŚCIEŻKA SZYBKA: gdy ŻADNA etykieta nie wymaga rozstrzygania (pismo naturalne,
  // tekst w slocie), scena jest już rozstrzygnięta declutterem przy budowie.
  if (kandydaci.every((k) => !k.enlarged)) {
    return {
      drawn: kandydaci.map((k) => ({
        label: k.label,
        index: k.index,
        text: k.tekstBazowy,
        fontSize: k.fontSize,
        rect: prostokatTuszu(k.slot, k.tekstBazowy, k.fontSize, wagaPisma(k.label), k.label.rotated === true, undefined, wyrownanieEtykiety(k.label)),
        enlarged: false,
      })),
      tozsamosciWPodpowiedzi,
    };
  }

  // (b) pasmo etykiet — wiersze pasma nazw przestawione przed rozstrzyganiem.
  const pasmaPrzestawione = przestawPasma(kandydaci, sheet);
  const przestawione = pasmaPrzestawione.zKorekta;
  const zeSlotami = kandydaci.map((k) => ({ ...k, slot: przestawione.get(k.index) ?? k.slot }));

  // (d) pierwszeństwo — nazwa stacji/GPZ z `pierwszenstwo` (zaznaczona, z alarmem) przed
  // wszystkim, potem ranga tożsamości, priorytet rodzaju, ref (R4).
  const kolejnosc = [...zeSlotami].sort(
    (a, b) => poziomPierwszenstwa(b.label, pierwszenstwo) - poziomPierwszenstwa(a.label, pierwszenstwo) || kolejnoscRozstrzygania(a, b),
  );
  const pozycjaWKolejnosci = new Map(kolejnosc.map((k, i) => [k.index, i] as const));

  // S9-9: przeszkody sceny indeksowane RAZ na plan (zbiór stały), „zajęte"
  // przyrostowo — jak w `declutterLabels`, jedna maszyneria dla obu.
  //
  // JEDNA NOTACJA BLOKU ZABEZPIECZEŃ (karta 2026-11-05, pomiar na fiksturze 52 stacji): kanwa
  // dorysowuje ramkę bloku do NARYSOWANYCH wierszy (`ramkaBlokuPrzekaznika`), a plan traktował
  // krawędzie ramki SCENY jako przeszkodę także dla wierszy tego samego bloku — wiersz powiększony
  // podłogą opisów celu przecinał własną krawędź i wypadał („63P", „51N" pola transformatorowego
  // w kadrze stacji, skala 1). Para predykatów z jednego źródła (`symbols/blokZabezpieczen.ts`):
  // wiersz bloku NIE widzi krawędzi własnej ramki, za to ZASIĘG ramki dorysowanej do powiększonego
  // wiersza (`zasiegWierszaWRamce`) musi być wolny od rysunku i od obcych napisów, a każdy inny
  // napis omija ten zasięg (`ramkiZajete`).
  //
  // Pytania „krawędź ramki INNEGO bloku" i „napis zaplanowany z cechą bloku" idą przez indeks
  // z elementem (`createRectItemIndex`), nie przeglądem liniowym całej listy przy każdym
  // zapytaniu (scalenie do drzewa integracji 2026-11-11: przegląd liniowy dawał koszt planu
  // ponadliniowy z liczbą wierszy bloków — test `kosztSceny` „rośnie LINIOWO"). Predykat
  // każdego kandydata ten sam, więc plan jest bajtowo identyczny (odciski `kosztSceny`).
  const obstacleIndex = buildRectIndex(obstacles.filter((r) => blokKrawedzi(r) === null));
  const krawedzieWgBloku = createRectItemIndex<string | null>();
  for (const r of obstacles) {
    const blokR = blokKrawedzi(r);
    if (blokR !== null) krawedzieWgBloku.add(r, blokR);
  }
  const ramkiZajete = createRectIndex();
  /** Napisy zaplanowane pod tuszem i — wiersz bloku powiększony — pod zasięgiem ramki. */
  const zaplanowaneWgMiejsca = createRectItemIndex<PlannedLabel>();
  const przeszkodyDla = (k: Kandydat): ZbiorKolizji => {
    const blok = blokWiersza(k.label);
    const rozszerz = blok !== null && k.enlarged;
    const granicaTla = k.label.granicaTlaPola;
    return {
      anyOverlap: (r) => {
        const probe = rozszerz ? zasiegWierszaWRamce(r) : r;
        // Kolumna tła pola GPZ (`OwnedLabel.granicaTlaPola`): tło rośnie za narysowanym tuszem
        // członka (wiersz bloku — za ramką dorysowaną do wiersza) z marginesem tła, więc ten
        // obrys musi zostać w kolumnie pola. Para z `canvas/obrysyWgPlanu.ts::paneleWgPlanu`:
        // ta sama lista członków, ten sam margines (`MARGINES_TLA_POLA_GPZ`).
        if (granicaTla !== undefined && !wKolumnieTla(blok !== null ? zasiegWierszaWRamce(r) : r, granicaTla)) return true;
        if (obstacleIndex.anyOverlap(probe)) return true;
        return krawedzieWgBloku.someCandidate(probe, (blokKrawedziR) => blokKrawedziR !== blok);
      },
    };
  };
  const zaplanowane = new Map<number, PlannedLabel>();
  /** Kandydat, z którego powstała każda zaplanowana etykieta (po ewentualnym
   *  przejściu na postać zapasową) — potrzebny `ustapSasiadow`, żeby sąsiada
   *  ustępującego miejsca dopasować TĄ SAMĄ postacią, którą plan go rysuje. */
  const uzyteKandydaty = new Map<number, Kandydat>();
  // Zbiór zajęty dla kandydata: wszystkie AKTUALNE etykiety planu (`zajeteDlaBez` bez
  // wyłączenia) — indeks z elementem pozwala odrzucić wpisy przestawione ustąpieniem sąsiadów
  // bez przebudowy indeksów (karta SLD-SKALA-I-NAWIGACJA, budżet klatki).
  const zajeteDla = (k: Kandydat): ZbiorKolizji => zajeteDlaBez(k, -1);
  /**
   * Zbiór zajęty dla `k` z WYŁĄCZENIEM etykiety `wyl` — ten sam predykat co `zajeteDla` na
   * indeksach przebudowanych bez `wyl`, ale bez przebudowy: `zaplanowaneWgMiejsca` niesie te same
   * prostokąty co `zajete` (tusz) i `ramkiZajete` (zasięg ramki wiersza), a wpisy nieaktualne
   * (etykieta przestawiona później) odpadają porównaniem z `zaplanowane`. Karta
   * SLD-SKALA-I-NAWIGACJA (budżet klatki): przebudowa indeksów przy każdej próbie drugiej szansy
   * dawała koszt kwadratowy.
   */
  const zajeteDlaBez = (k: Kandydat, wyl: number): ZbiorKolizji => {
    const aktualny = (p: PlannedLabel): boolean => p.index !== wyl && zaplanowane.get(p.index) === p;
    const cokolwiek = (r: V3Rect): boolean => zaplanowaneWgMiejsca.someCandidate(r, (p) => aktualny(p));
    const blok = blokWiersza(k.label);
    if (blok === null) return { anyOverlap: cokolwiek };
    const rozszerz = k.enlarged;
    return {
      anyOverlap: (r) => {
        const probe = rozszerz ? zasiegWierszaWRamce(r) : r;
        if (!cokolwiek(probe)) return false;
        return zaplanowaneWgMiejsca.someCandidate(probe, (p) => {
          if (!aktualny(p)) return false;
          const blokP = blokWiersza(p.label);
          if (blokP === blok) return rectsOverlap(r, p.rect);
          if (rectsOverlap(probe, p.rect)) return true;
          return blokP !== null && p.enlarged && rectsOverlap(probe, zasiegWierszaWRamce(p.rect));
        });
      },
    };
  };
  const zajmij = (p: PlannedLabel): void => {
    zaplanowaneWgMiejsca.add(p.rect, p);
    if (p.enlarged && blokWiersza(p.label) !== null) {
      const zasieg = zasiegWierszaWRamce(p.rect);
      ramkiZajete.add(zasieg);
      zaplanowaneWgMiejsca.add(zasieg, p);
    }
  };
  let zmienione: readonly PlannedLabel[] | null = null;
  for (const kandydatPierwotny of kolejnosc) {
    let kandydat = kandydatPierwotny;
    let dopasowanie = najlepszeDopasowanie(kandydat, zajeteDla(kandydat), przeszkodyDla(kandydat), sheet);
    if ((!dopasowanie || dopasowanie.text.length === 0) && kandydat.zapasowy !== undefined) {
      // Podłoga celu bez miejsca: postać standardowa (albo kubełek bez podłogi).
      const zapasowy = kandydat.zapasowy;
      if (zapasowy === null) {
        if (klasaInformacjiEtykiety(kandydat.label) === 'tozsamosc') tozsamosciWPodpowiedzi.push({ label: kandydat.label, index: kandydat.index });
        continue;
      }
      // Pasmo nazw przestawiono pod postać celu; postać standardowa pisma
      // naturalnego stoi w swoim slocie sceny (tak jak bez podłogi celu).
      kandydat = zapasowy.enlarged ? { ...zapasowy, slot: przestawione.get(zapasowy.index) ?? zapasowy.slot } : zapasowy;
      dopasowanie = najlepszeDopasowanie(kandydat, zajeteDla(kandydat), przeszkodyDla(kandydat), sheet);
    }
    if ((!dopasowanie || dopasowanie.text.length === 0) && rangaTozsamosci(kandydat.label) >= 2) {
      // R4: pasmo przesunięte w górę o przelew pod arkusz (żeby zmieściły się WSZYSTKIE
      // wiersze) może wejść w rysunek nad pasmem. Wiersz tożsamości rangi bloku nie oddaje
      // wtedy swojego miejsca wierszom niższej rangi z tego samego pasma: próbuje slotu bez
      // przesunięcia (pasmo od swojej góry w scenie), a wiersze, które pod nim nie zmieszczą
      // się w arkuszu, ustępują jemu (pomiar 2026-11-12: sieć 52 stacji przy dopasowaniu
      // całej sieci — cztery nazwy stacji ostatniego wiersza arkusza przegrywały z wierszem
      // „Szyna nN" własnego pasma).
      const slotBezKorekty = pasmaPrzestawione.bezKorekty.get(kandydat.index);
      if (slotBezKorekty !== undefined && slotBezKorekty.y !== kandydat.slot.y) {
        const bezKorekty = { ...kandydat, slot: slotBezKorekty };
        const proba = najlepszeDopasowanie(bezKorekty, zajeteDla(bezKorekty), przeszkodyDla(bezKorekty), sheet);
        if (proba && proba.text.length > 0) {
          kandydat = bezKorekty;
          dopasowanie = proba;
        }
      }
    }
    if (
      (!dopasowanie || dopasowanie.text.length === 0) &&
      klasaInformacjiEtykiety(kandydat.label) === 'tozsamosc' &&
      (zmienione = ustapSasiadow(kandydat, zaplanowane, uzyteKandydaty, przeszkodyDla, ramkiZajete, sheet, zaplanowaneWgMiejsca, pozycjaWKolejnosci)) !== null
    ) {
      for (const p of zmienione) zajmij(p);
      continue;
    }
    if ((!dopasowanie || dopasowanie.text.length === 0) && poziomPierwszenstwa(kandydatPierwotny.label, pierwszenstwo) > 0) {
      // R4 — nazwa z pierwszeństwem jest ZAWSZE narysowana. Kolejność stawia ją przed innymi
      // napisami, więc brak miejsca znaczy: każdą pozycję zajmuje RYSUNEK. Stoi wtedy w swoim
      // slocie (pełny tekst, pismo planu, halo kanwy) z jawną flagą `naRysunku`; napisów
      // zaplanowanych wcześniej (inne nazwy z pierwszeństwem, w kolejności stałej) nie
      // przykrywa — przegrana z nimi idzie do podpowiedzi, deterministycznie.
      const k = kandydatPierwotny;
      const rect = prostokatTuszu(k.slot, k.tekstBazowy, k.fontSize, wagaPisma(k.label), k.label.rotated === true, undefined, wyrownanieEtykiety(k.label));
      if (k.tekstBazowy.length > 0 && !zajeteDla(k).anyOverlap(rect)) {
        const naRysunku: PlannedLabel = {
          label: k.label,
          index: k.index,
          text: k.tekstBazowy,
          fontSize: k.fontSize,
          rect,
          enlarged: k.fontSize > LABEL_TYPOGRAPHY[k.label.labelClass].fontSize + 1e-9,
          naRysunku: true,
        };
        zajmij(naRysunku);
        uzyteKandydaty.set(k.index, k);
        zaplanowane.set(k.index, naRysunku);
        continue;
      }
    }
    if (!dopasowanie || dopasowanie.text.length === 0) {
      // Tożsamość bez miejsca (R4): ustępuje wyższej randze i trafia do podpowiedzi
      // uchwytu (`tozsamosciWPodpowiedzi`); dane bez miejsca po prostu nie są rysowane.
      if (klasaInformacjiEtykiety(kandydat.label) === 'tozsamosc') tozsamosciWPodpowiedzi.push({ label: kandydat.label, index: kandydat.index });
      continue;
    }
    const zaplanowana: PlannedLabel = {
      label: kandydat.label,
      index: kandydat.index,
      text: dopasowanie.text,
      fontSize: dopasowanie.fontSize,
      rect: dopasowanie.rect,
      enlarged: dopasowanie.fontSize > LABEL_TYPOGRAPHY[kandydat.label.labelClass].fontSize + 1e-9,
      ...(dopasowanie.strona !== undefined ? { strona: dopasowanie.strona } : {}),
    };
    zajmij(zaplanowana);
    uzyteKandydaty.set(kandydat.index, kandydat);
    zaplanowane.set(kandydat.index, zaplanowana);
  }

  // DRUGA SZANSA POSTACI CELU (K2b §0.2 (b) × R4): opis celu kadru, który w swojej kolejce
  // nie zmieścił się w piśmie celu i stanął w postaci standardowej (albo — dana — wcale),
  // próbuje postaci celu jeszcze raz wobec KOŃCOWEGO rozmieszczenia. Ustąpienie sąsiadów (f)
  // przestawia napisy już zaplanowane, więc miejsce zajęte w chwili jego kolejki bywa na
  // końcu wolne (pomiar 2026-11-12: oznacznik „TR” pola transformatorowego stacji T1 przy
  // skali 1 — pismo 9 zamiast 13 px, choć postać celu miała miejsce w planie końcowym).
  // Kolejność ta sama co w pętli głównej; każda próba widzi wszystkie pozostałe napisy.
  for (const kandydatPierwotny of kolejnosc) {
    if (kandydatPierwotny.zapasowy === undefined) continue;
    const obecna = zaplanowane.get(kandydatPierwotny.index);
    if (obecna !== undefined && obecna.fontSize >= kandydatPierwotny.fontSize - 1e-9) continue;
    const proba = najlepszeDopasowanie(
      kandydatPierwotny,
      zajeteDlaBez(kandydatPierwotny, kandydatPierwotny.index),
      przeszkodyDla(kandydatPierwotny),
      sheet,
    );
    if (!proba || proba.text.length === 0) continue;
    const nowa: PlannedLabel = {
      label: kandydatPierwotny.label,
      index: kandydatPierwotny.index,
      text: proba.text,
      fontSize: proba.fontSize,
      rect: proba.rect,
      enlarged: proba.fontSize > LABEL_TYPOGRAPHY[kandydatPierwotny.label.labelClass].fontSize + 1e-9,
      ...(proba.strona !== undefined ? { strona: proba.strona } : {}),
    };
    zaplanowane.set(kandydatPierwotny.index, nowa);
    zajmij(nowa);
    uzyteKandydaty.set(kandydatPierwotny.index, kandydatPierwotny);
    const wPodpowiedzi = tozsamosciWPodpowiedzi.findIndex((t) => t.index === kandydatPierwotny.index);
    if (wPodpowiedzi >= 0) tozsamosciWPodpowiedzi.splice(wPodpowiedzi, 1);
  }

  const drawn: PlannedLabel[] = [];
  labels.forEach((_, index) => {
    const p = zaplanowane.get(index);
    if (p) drawn.push(p);
  });
  return { drawn, tozsamosciWPodpowiedzi };
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
  // R4: adnotacje (nazwa GPZ, nazwa stacji, oznaczenie sekcji — `adnotacjaStalejWielkosci`)
  // mają stały rozmiar ekranowy bez sufitu — sufit obowiązuje napisy sceny.
  return plan.drawn
    .filter((p) => !adnotacjaStalejWielkosci(p.label))
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
 * nie rysuje. Tożsamość rangi ≥ 2 może wystawać w prawo i w dół — ramka rośnie
 * razem z nią (`obrysArkuszaPlanu`); wyrocznia sprawdza wtedy krawędź lewą i górną. Istnieje dlatego, że zdanie „ramka nie przecina podpisów" bez
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
    .filter((p) => !wArkuszu(p.rect, sheet, p.label))
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

/** Rozmieszczona nazwa stacji albo GPZ: ref bloku i prostokąt tuszu napisu [j.św. sceny]. */
export interface RozmieszczonaNazwa {
  readonly ref: string;
  readonly rect: V3Rect;
}

/**
 * R4 — WYNIK ROZMIESZCZENIA NAZW stacji i GPZ do odczytu przez inne warstwy (adnotacje wyników
 * traktują nazwy jako przeszkody — rozstrzygnięcie architekta 2026-11-12). Te same prostokąty,
 * które rysuje kanwa (plan etykiet), w porządku etykiet sceny; nazwa w podpowiedzi uchwytu nie
 * jest narysowana, więc nie jest przeszkodą.
 */
export function rozmieszczenieNazw(plan: LabelRenderPlan): readonly RozmieszczonaNazwa[] {
  return plan.drawn
    .filter((p) => rangaTozsamosci(p.label) >= 3)
    .map((p) => ({ ref: p.label.ownerRef.split('#')[0] ?? p.label.ownerRef, rect: p.rect }));
}
