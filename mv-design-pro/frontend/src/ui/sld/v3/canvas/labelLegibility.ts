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
 *   (c) SKRACANIE Z WIELOKROPKIEM (`fitLabelToWidth`) — gdy powiększona
 *       etykieta koliduje, jest skracana do NAJDŁUŻSZEJ postaci, która
 *       kolizji nie ma (wyszukiwanie połówkowe po liczbie glifów);
 *   (d) PIERWSZEŃSTWO — rozstrzyganie w porządku `labelResolutionOrder`
 *       (`layout/declutter.ts`, ta sama reguła co declutter sceny): symbol
 *       zawsze wygrywa z etykietą, etykieta o wyższym priorytecie wygrywa z
 *       niższą. Etykieta, dla której nawet najkrótsza postać koliduje, NIE
 *       jest rysowana — plan zwraca ją jawnie (`droppedIdentity`), żeby
 *       wyrocznia odbioru mogła pilnować, że na sieciach kanonicznych ten
 *       zbiór jest PUSTY (a nie żeby cicho zgubić tożsamość).
 *
 * Czysta funkcja: brak DOM/Date/losowości (P7) — ten sam wynik w renderze,
 * teście i runnerze odbioru.
 */

import { rectsOverlap, type V3Rect } from '../core/grid';
import {
  fitLabelToWidth,
  isLabelHiddenAtScale,
  isLabelReadableAtScale,
  LABEL_TYPOGRAPHY,
  measureTextWidth,
  minReadableFontSize,
} from '../core/text';
import { labelPriority, labelResolutionOrder } from '../layout/declutter';
import type { OwnedLabel } from '../layout/labels';

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

/** Minimalna liczba glifów, poniżej której skracanie traci sens (jeden znak +
 *  wielokropek). Poniżej tego `fitLabelToWidth` zwraca pusty tekst. */
const MIN_GLYPHS = 2;

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
 * Postać etykiety, która NIE koliduje ani z rysunkiem, ani z etykietą już
 * zachowaną — szukana w kolejności ustępstw od najlepszej do najgorszej:
 *
 *  1. pełny tekst pismem powiększonym do minimum czytelnego;
 *  2. tekst SKRÓCONY z wielokropkiem, pismem powiększonym — najdłuższa postać,
 *     która się mieści (wyszukiwanie POŁÓWKOWE po liczbie glifów; poprawne, bo
 *     prostokąt jest zakotwiczony, więc krótszy tekst daje prostokąt ZAWARTY w
 *     dłuższym, a kolizyjność jest monotoniczna względem długości);
 *  3. pismo NATURALNE w oryginalnym slocie sceny — czyli DOKŁADNIE to, co
 *     rysunek pokazywał przed KD-11. Ten stopień gwarantuje, że etykieta
 *     tożsamości nigdy nie wypada przez SAMO powiększenie: w najgorszym razie
 *     wraca do rozmiaru sprzed karty (slot sceny jest rozłączny z konstrukcji,
 *     bo declutter sceny już go rozstrzygnął), zamiast zniknąć.
 *
 * `null` = nawet slot naturalny jest zajęty (etykieta o wyższym priorytecie
 * zajęła go po powiększeniu) — wtedy wołający ją porzuca, bo alternatywą jest
 * kolizja, a ta jest zakazana.
 */
function najlepszeDopasowanie(
  kandydat: Kandydat,
  zajete: readonly V3Rect[],
  obstacles: readonly V3Rect[],
): Dopasowanie | null {
  const { label, fontSize, slot, tekstBazowy } = kandydat;
  const height = kandydat.enlarged ? wysokoscWiersza(fontSize) : slot.height;
  const prostokatDla = (text: string): V3Rect =>
    kandydat.enlarged
      ? anchoredRect(slot, measureTextWidth(text, fontSize), height, label.placement)
      : slot;
  const wolne = (rect: V3Rect): boolean =>
    !obstacles.some((r) => rectsOverlap(rect, r)) && !zajete.some((r) => rectsOverlap(rect, r));

  const pelny = prostokatDla(tekstBazowy);
  if (tekstBazowy.length > 0 && wolne(pelny)) {
    return { text: tekstBazowy, rect: pelny, fontSize, enlarged: kandydat.enlarged };
  }
  // Etykiety NIEpowiększone nie mają czego skracać ani do czego wracać — ich
  // prostokąt jest rezerwacją sceny, a nie funkcją tekstu.
  if (!kandydat.enlarged) return null;

  let lo = MIN_GLYPHS;
  let hi = tekstBazowy.length - 1; // krótsze niż pełny (pełny już sprawdzony)
  let najlepszy: Dopasowanie | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const text = `${tekstBazowy.slice(0, mid - 1)}…`;
    const rect = prostokatDla(text);
    if (wolne(rect)) {
      najlepszy = { text, rect, fontSize, enlarged: true };
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (najlepszy) return najlepszy;

  // (3) POWRÓT DO ROZMIARU NATURALNEGO — ustępstwo zamiast zniknięcia.
  if (wolne(label.rect)) {
    return {
      text: label.text,
      rect: label.rect,
      fontSize: LABEL_TYPOGRAPHY[label.labelClass].fontSize,
      enlarged: false,
    };
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
        ? fitLabelToWidth(label.text, fontSize, label.rect.width)
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
