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
 * Czysta funkcja: brak DOM/Date/losowości (P7) — ten sam wynik w renderze,
 * teście i runnerze odbioru.
 */

import { rectsOverlap, type V3Rect } from '../core/grid';
import {
  isLabelHiddenAtScale,
  isLabelReadableAtScale,
  LABEL_TYPOGRAPHY,
  measureTextWidth,
  minReadableFontSize,
  MIN_READABLE_LABEL_SCREEN_PX,
  shortenPreservingIdentity,
} from '../core/text';
import { labelPriority, labelResolutionOrder } from '../layout/declutter';
import type { OwnedLabel, SimpleAnchorPlacement } from '../layout/labels';

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
  /** Prostokąt efektywny [świat] — do rozstrzygania kolizji i kotwiczenia. */
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

const NAME_ROW_SUFFIX = /#name-row-\d+$/;

/**
 * PASMO ETYKIET (mechanizm (b)): wiersze jednego pasma nazw dostają nowe `y`
 * liczone od GÓRY pasma, z wysokościami efektywnymi — wiersz powiększony
 * przesuwa następne w dół zamiast na nie nachodzić, a wiersz nierysowany
 * (dane poniżej progu) nie zajmuje miejsca. Zwraca mapę indeks → slot.
 */
function przestawPasma(kandydaci: readonly Kandydat[]): Map<number, V3Rect> {
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
    let y = Math.min(...uporzadkowane.map((k) => k.slot.y));
    for (const k of uporzadkowane) {
      const height = k.enlarged ? wysokoscWiersza(k.fontSize) : k.slot.height;
      wynik.set(k.index, { x: k.slot.x, y, width: k.slot.width, height });
      y += height;
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
  zajete: readonly V3Rect[],
  obstacles: readonly V3Rect[],
): Dopasowanie | null {
  const { label, fontSize, slot, tekstBazowy } = kandydat;
  const height = kandydat.enlarged ? wysokoscWiersza(fontSize) : slot.height;
  const wolne = (rect: V3Rect): boolean =>
    !obstacles.some((r) => rectsOverlap(rect, r)) && !zajete.some((r) => rectsOverlap(rect, r));

  if (!kandydat.enlarged) {
    // Etykiety NIEpowiększone nie mają czego skracać ani gdzie przestawiać —
    // ich prostokąt jest REZERWACJĄ sceny (rozstrzygniętą już declutterem przy
    // budowie), a nie funkcją tekstu.
    return tekstBazowy.length > 0 && wolne(slot)
      ? { text: tekstBazowy, rect: slot, fontSize, enlarged: false }
      : null;
  }

  const proboj = (placement: OwnedLabel['placement']): Dopasowanie | null => {
    const prostokatDla = (text: string): V3Rect =>
      anchoredRect(slot, measureTextWidth(text, fontSize), height, placement);

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
      const text = shortenPreservingIdentity(tekstBazowy, fontSize, mid);
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
): LabelRenderPlan {
  if (!Number.isFinite(scale) || scale <= 0) {
    return {
      drawn: labels.map((label, index) => ({
        label,
        index,
        text: label.text,
        fontSize: LABEL_TYPOGRAPHY[label.labelClass].fontSize,
        rect: label.rect,
        enlarged: false,
      })),
      hiddenDetail: [],
      droppedIdentity: [],
    };
  }

  const hiddenDetail: OwnedLabel[] = [];
  const kandydaci: Kandydat[] = [];
  labels.forEach((label, index) => {
    const czytelna = isLabelReadableAtScale(label.labelClass, scale);
    if (isLabelHiddenAtScale(label.labelRole, label.labelClass, scale)) {
      hiddenDetail.push(label);
      return;
    }
    const fontSize = czytelna
      ? LABEL_TYPOGRAPHY[label.labelClass].fontSize
      : minReadableFontSize(label.labelClass, scale);
    // (c) skracanie w PIERWSZEJ kolejności do REZERWACJI właściciela: wiersz
    // pasma nazw ma slot szerokości kolumny stacji, więc powiększone pismo
    // musi zmieścić się w tej kolumnie (inaczej wchodzi w kolumnę sąsiada).
    // Etykiety zakotwiczone punktowo (napięcie szyny, oznaczenie pola, DER)
    // rezerwacji z zapasem NIE mają — ich slot to sama szerokość tekstu w
    // rozmiarze naturalnym — więc ograniczeniem jest dla nich dopiero
    // rozstrzyganie kolizji niżej.
    const tekstBazowy =
      !czytelna && label.ownerKind === 'station-name'
        ? shortenPreservingIdentity(label.text, fontSize, label.rect.width)
        : label.text;
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
        text: k.label.text,
        fontSize: k.fontSize,
        rect: k.slot,
        enlarged: false,
      })),
      hiddenDetail,
      droppedIdentity: [],
    };
  }

  // (b) pasmo etykiet — wiersze pasma nazw przestawione przed rozstrzyganiem.
  const przestawione = przestawPasma(kandydaci);
  const zeSlotami = kandydaci.map((k) => ({ ...k, slot: przestawione.get(k.index) ?? k.slot }));

  // (d) pierwszeństwo — ta sama reguła, co declutter sceny.
  const kolejnosc = [...zeSlotami].sort((a, b) =>
    labelResolutionOrder(
      { priority: labelPriority(a.label), rect: a.slot, ownerRef: a.label.ownerRef },
      { priority: labelPriority(b.label), rect: b.slot, ownerRef: b.label.ownerRef },
    ),
  );

  const zajete: V3Rect[] = [];
  const zaplanowane = new Map<number, PlannedLabel>();
  const droppedIdentity: OwnedLabel[] = [];
  for (const kandydat of kolejnosc) {
    const dopasowanie = najlepszeDopasowanie(kandydat, zajete, obstacles);
    if (!dopasowanie || dopasowanie.text.length === 0) {
      if (kandydat.label.labelRole === 'tozsamosc') droppedIdentity.push(kandydat.label);
      else hiddenDetail.push(kandydat.label);
      continue;
    }
    zajete.push(dopasowanie.rect);
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
