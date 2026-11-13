/**
 * SLD V3 — ZNACZNIKI STANU o stałym rozmiarze ekranowym (karta SLD-SKALA-I-NAWIGACJA, R5).
 *
 * Rysunek ma jedną scenę, a kamera jest czystym przekształceniem (R1). Wnętrze symbolu skaluje
 * się naturalnie, więc z daleka symbol łącznika ma na ekranie 2–3 px i jego STAN (otwarty,
 * punkt rozcięcia „N.O.”) przestaje być czytelny, choć rozstrzyga o topologii. Tak samo kropka
 * miejsca zwarcia, obrys zaznaczenia i liczbowa etykieta przekroczenia w wynikach. Znaki, które
 * rozstrzygają o topologii i o uwadze projektanta, nie mogą znikać z rysunku razem ze skalą.
 *
 * Reguła: gdy NOŚNIK znaku (symbol, obrys, kropka, pismo wyników) jest na ekranie poniżej progu
 * rozpoznawalności, znak dostaje znacznik o STAŁYM rozmiarze ekranowym w TEJ SAMEJ kotwicy świata.
 * Próg nośnika jest jeden na rodzaj nośnika i pochodzi z jednego źródła:
 *   - `gabaryt` — najmniejszy bok gabarytu świata × skala < `MIN_SYMBOL_SCREEN_PX`
 *     (`symbols/defs.ts`, ten sam próg co kontrakt najmniejszego symbolu);
 *   - `pismoWynikow` — pismo etykiet wyników nieczytelne na ekranie: TA SAMA decyzja z
 *     histerezą (`czytelnyNaEkranie`), którą kanwa wyłącza liczby wyników. Osobny próg 8 px
 *     zostawiłby pas skal, w którym liczb już nie ma, a znacznika jeszcze nie ma (predykaty
 *     parami, reguła KLASA §3).
 *
 * Lista znaków jest DANYMI (`REJESTR_ZNACZNIKOW_STANU`): nowy znak (np. nieustalone położenie
 * łącznika — kafel `nieustalony` już niesie scena) to nowy człon unii, wpis rejestru i wiersz
 * zbierania nośnika, bez zmiany progu, sortowania ani renderu. Stanu się nie wymyśla — nośnik powstaje wyłącznie z pola sceny albo nakładki, które już niesie stan.
 * Blokada gotowości nie ma wpisu: kanwa nie dostaje dziś stanu gotowości per element (nakładka
 * `SldV3Overlay` nie ma takiego kanału), a znacznik bez danych byłby fabrykacją.
 *
 * Moduł jest CZYSTY (bez React/DOM), deterministyczny: wynik posortowany po (priorytet rysowania,
 * ref, rodzaj).
 */
import { GRID, type V3Rect } from '../core/grid';
import type { PreviewComposition } from '../compose/preview';
import { sceneObstacleRects, type SceneV3 } from '../scene/buildScene';
import { PISMO_WYNIKOW } from '../core/text';
import { czytelnyNaEkranie } from './gestoscInformacji';
import { MIN_SYMBOL_SCREEN_PX, SYMBOL_DEFS } from '../symbols/defs';
import { stanKaflaLacznika } from '../symbols/glyphs';
import type { StanKafla } from '../theme/colorTokens';

/** Rodzaje znaków stanu — zamknięta unia, każdy z wpisem rejestru. */
export type RodzajZnacznikaStanu =
  | 'lacznik-otwarty'
  | 'punkt-rozciecia'
  | 'zaznaczenie'
  | 'miejsce-zwarcia'
  | 'przekroczenie';

/** Nośnik znaku — od niego zależy próg (patrz nagłówek modułu). */
export type RodzajNosnika = 'gabaryt' | 'pismoWynikow';

/** Kształt znacznika — rozróżnia rodzaje bez polegania na samej barwie. */
export type KsztaltZnacznika = 'kwadrat' | 'romb' | 'pierscien' | 'kolo' | 'trojkat';

export interface WpisRejestruZnacznikow {
  readonly rodzaj: RodzajZnacznikaStanu;
  /** Opis polski — `aria-label`/`title` znacznika. */
  readonly opis: string;
  readonly nosnik: RodzajNosnika;
  readonly ksztalt: KsztaltZnacznika;
  /** Średnica znacznika [px EKRANU]. */
  readonly rozmiarEkranPx: number;
  /** Kolejność rysowania: wyższy rysowany później (na wierzchu). */
  readonly priorytet: number;
}

/** Rejestr znaków stanu — DANE mechanizmu. */
export const REJESTR_ZNACZNIKOW_STANU: Readonly<Record<RodzajZnacznikaStanu, WpisRejestruZnacznikow>> = {
  'lacznik-otwarty': {
    rodzaj: 'lacznik-otwarty',
    opis: 'Łącznik otwarty',
    nosnik: 'gabaryt',
    ksztalt: 'kwadrat',
    rozmiarEkranPx: 10,
    priorytet: 1,
  },
  'punkt-rozciecia': {
    rodzaj: 'punkt-rozciecia',
    opis: 'Punkt normalnie otwarty (N.O.)',
    nosnik: 'gabaryt',
    ksztalt: 'romb',
    rozmiarEkranPx: 12,
    priorytet: 2,
  },
  przekroczenie: {
    rodzaj: 'przekroczenie',
    opis: 'Przekroczenie w wynikach',
    nosnik: 'pismoWynikow',
    ksztalt: 'trojkat',
    rozmiarEkranPx: 12,
    priorytet: 3,
  },
  'miejsce-zwarcia': {
    rodzaj: 'miejsce-zwarcia',
    opis: 'Miejsce zwarcia',
    nosnik: 'gabaryt',
    ksztalt: 'kolo',
    rozmiarEkranPx: 12,
    priorytet: 4,
  },
  zaznaczenie: {
    rodzaj: 'zaznaczenie',
    opis: 'Zaznaczony element',
    nosnik: 'gabaryt',
    ksztalt: 'pierscien',
    rozmiarEkranPx: 18,
    priorytet: 5,
  },
};

/** Nośnik znaku zebrany z danych sceny/nakładki. */
export interface NosnikZnacznika {
  readonly rodzaj: RodzajZnacznikaStanu;
  readonly ref: string;
  /** Kotwica świata — środek nośnika. */
  readonly x: number;
  readonly y: number;
  /** Najmniejszy bok gabarytu nośnika [px ŚWIATA] (nośnik `gabaryt`). */
  readonly rozmiarSwiata: number;
  /** Severity wyniku (nośnik `pismoWynikow`) — barwa z `resultSeverityColor`. */
  readonly severity?: string;
  /** Stan kafla łącznika (nośniki łącznika) — barwa z `STATE_COLOR`. */
  readonly stanKafla?: StanKafla;
}

export interface ZnacznikStanu extends NosnikZnacznika {
  readonly wpis: WpisRejestruZnacznikow;
  /** Średnica znacznika [px ŚWIATA] = `rozmiarEkranPx / skala`. */
  readonly srednicaSwiata: number;
}

export interface KontekstZnacznikow {
  /** Skala kamery [px ekranu / j. świata]. */
  readonly skala: number;
  /** Czy pismo wyników jest czytelne — TA SAMA decyzja, którą kanwa pokazuje liczby wyników. */
  readonly wynikiCzytelne: boolean;
}

/** Czy nośnik jest rozpoznawalny na ekranie (wtedy znacznik zbędny). Skala niewiarygodna
 *  (≤0, NaN) nie jest dowodem nierozpoznawalności — nośnik uznany za czytelny. */
export function nosnikRozpoznawalny(nosnik: NosnikZnacznika, kontekst: KontekstZnacznikow): boolean {
  const wpis = REJESTR_ZNACZNIKOW_STANU[nosnik.rodzaj];
  if (wpis.nosnik === 'pismoWynikow') return kontekst.wynikiCzytelne;
  if (!Number.isFinite(kontekst.skala) || kontekst.skala <= 0) return true;
  return nosnik.rozmiarSwiata * kontekst.skala >= MIN_SYMBOL_SCREEN_PX;
}

/** Znaczniki stanu dla nośników nierozpoznawalnych na ekranie — czysta funkcja, wynik
 *  posortowany po (priorytet, ref, rodzaj). */
export function znacznikiStanu(
  nosniki: readonly NosnikZnacznika[],
  kontekst: KontekstZnacznikow,
): readonly ZnacznikStanu[] {
  const skala = Number.isFinite(kontekst.skala) && kontekst.skala > 0 ? kontekst.skala : 1;
  const wynik: ZnacznikStanu[] = [];
  for (const nosnik of nosniki) {
    if (nosnikRozpoznawalny(nosnik, kontekst)) continue;
    const wpis = REJESTR_ZNACZNIKOW_STANU[nosnik.rodzaj];
    wynik.push({ ...nosnik, wpis, srednicaSwiata: wpis.rozmiarEkranPx / skala });
  }
  wynik.sort(
    (a, b) =>
      a.wpis.priorytet - b.wpis.priorytet ||
      (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0) ||
      (a.rodzaj < b.rodzaj ? -1 : a.rodzaj > b.rodzaj ? 1 : 0),
  );
  return wynik;
}

/** Kotwica wyniku z przekroczeniem — kanwa podaje ją z TEJ SAMEJ rozdzielczości kotwic, którą
 *  układa etykiety wyników (`kotwiceWynikow` w `SldCanvasV3.tsx`). */
export interface KotwicaPrzekroczenia {
  readonly ref: string;
  readonly x: number;
  readonly y: number;
  readonly severity: string;
}

export interface WejscieNosnikow {
  readonly scene: Pick<PreviewComposition, 'symbols'>;
  /** Obrysy zaznaczenia (`obrysyZaznaczenia`). */
  readonly zaznaczenia?: readonly { readonly ref: string; readonly rect: V3Rect }[];
  /** Punkty zwarcia (`computeFaultPointMarkerPlacements`). */
  readonly punktyZwarcia?: readonly { readonly ownerRef: string; readonly x: number; readonly y: number }[];
  /** Średnica kropki miejsca zwarcia [px ŚWIATA] — gabaryt nośnika. */
  readonly srednicaKropkiZwarcia?: number;
  readonly przekroczenia?: readonly KotwicaPrzekroczenia[];
}

/** Uziemniki: położenie „otwarty” jest ich stanem NORMALNYM i nie przerywa toru (boczna gałąź do
 *  ziemi, `SYMBOLE_LACZNIKOW_Z_POLOZENIEM`), więc nie niosą znaku „łącznik otwarty”. */
const UZIEMNIKI: ReadonlySet<string> = new Set(['earthSwitch', 'qetEarthSwitch']);

/** Nośniki znaków z danych sceny i nakładki — wyłącznie stan, który dane już niosą. */
export function nosnikiZnacznikowStanu(wejscie: WejscieNosnikow): readonly NosnikZnacznika[] {
  const out: NosnikZnacznika[] = [];
  wejscie.scene.symbols.forEach((symbol, index) => {
    const def = SYMBOL_DEFS[symbol.symbolId];
    const ref = symbol.meta?.ownerRef ?? symbol.meta?.deviceRef ?? `symbol-${index}`;
    const kotwica = { x: symbol.x + def.width / 2, y: symbol.y + def.height / 2 };
    const rozmiarSwiata = Math.min(def.width, def.height);
    if (symbol.symbolId === 'noPoint') {
      // Punkt N.O. jest FUNKCJĄ łącznika; stan kafla tylko wtedy, gdy model niesie położenie
      // (`stanKaflaLacznika` ⇒ `null` dla NOP bez rekordu łącznika — brak danej ≠ stan).
      const stanNop = stanKaflaLacznika(symbol.symbolId, symbol.state);
      out.push({ rodzaj: 'punkt-rozciecia', ref, ...kotwica, rozmiarSwiata, ...(stanNop ? { stanKafla: stanNop } : {}) });
      return;
    }
    if (UZIEMNIKI.has(symbol.symbolId)) return;
    const stanKafla = stanKaflaLacznika(symbol.symbolId, symbol.state);
    if (stanKafla === 'otwarty') {
      out.push({ rodzaj: 'lacznik-otwarty', ref, ...kotwica, rozmiarSwiata, stanKafla });
    }
  });
  for (const obrys of wejscie.zaznaczenia ?? []) {
    out.push({
      rodzaj: 'zaznaczenie',
      ref: obrys.ref,
      x: obrys.rect.x + obrys.rect.width / 2,
      y: obrys.rect.y + obrys.rect.height / 2,
      rozmiarSwiata: Math.min(obrys.rect.width, obrys.rect.height),
    });
  }
  const srednicaZwarcia = wejscie.srednicaKropkiZwarcia ?? GRID;
  for (const punkt of wejscie.punktyZwarcia ?? []) {
    out.push({ rodzaj: 'miejsce-zwarcia', ref: punkt.ownerRef, x: punkt.x, y: punkt.y, rozmiarSwiata: srednicaZwarcia });
  }
  for (const p of wejscie.przekroczenia ?? []) {
    out.push({ rodzaj: 'przekroczenie', ref: p.ref, x: p.x, y: p.y, rozmiarSwiata: 0, severity: p.severity });
  }
  return out;
}

/**
 * R4 — znaczniki stanu jako PRZESZKODY planu etykiet: prostokąt opisany na znaczniku [j.św.
 * sceny] o średnicy `srednicaSwiata` wokół kotwicy nośnika. Nazwa stacji (adnotacja tożsamości
 * o stałej wielkości ekranowej) nie wchodzi na znak łącznika otwartego, punktu N.O., miejsca
 * zwarcia ani przekroczenia. Znacznik ZAZNACZENIA nie jest przeszkodą: zaznaczenie nie przestawia
 * napisów rysunku.
 */
export function przeszkodyZnacznikowStanu(
  znaczniki: readonly ZnacznikStanu[],
): readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[] {
  return znaczniki
    .filter((z) => z.rodzaj !== 'zaznaczenie')
    .map((z) => ({ x: z.x - z.srednicaSwiata / 2, y: z.y - z.srednicaSwiata / 2, width: z.srednicaSwiata, height: z.srednicaSwiata }));
}

/**
 * R4 — PRZESZKODY PLANU ETYKIET kanwy: rysunek sceny (`sceneObstacleRects`) i znaczniki stanu
 * o stałym rozmiarze ekranowym (`przeszkodyZnacznikowStanu`). JEDNO źródło dla kanwy
 * (`SldCanvasV3` — plan etykiet, uchwyty napisów) i dla testów, które odtwarzają plan etykiet
 * danej skali (sondy trafień, dojazd do celu); dwa niezależne zbiory przeszkód rozjeżdżały
 * położenie napisu na kanwie i w sondzie (pomiar 2026-11-12: uchwyt etykiety 5100,5 vs 5387).
 */
export function przeszkodyPlanuEtykiet(scene: SceneV3, znaczniki: readonly ZnacznikStanu[]): readonly V3Rect[] {
  const rysunek = sceneObstacleRects(scene);
  const stan = przeszkodyZnacznikowStanu(znaczniki);
  return stan.length === 0 ? rysunek : [...rysunek, ...stan];
}

/**
 * Przeszkody planu etykiet jako FUNKCJA SKALI — znaczniki stanu zależą od skali (nośnik
 * nierozpoznawalny dopiero poniżej progu), więc kadr liczony dla skali docelowej
 * (`zakresKadru.prostokatyZakresu`, `camera.ts`) i sonda testu przy skali `s` dostają przeszkody
 * tej skali z tych samych nośników, które rysuje kanwa. `nosniki` domyślnie: nośniki samego
 * rysunku (łącznik otwarty, punkt N.O.) — kanwa bez zaznaczenia i bez nakładki wyników.
 */
export function przeszkodyEtykietPrzySkali(
  scene: SceneV3,
  nosniki: readonly NosnikZnacznika[] = nosnikiZnacznikowStanu({ scene }),
): (skala: number) => readonly V3Rect[] {
  return (skala) =>
    przeszkodyPlanuEtykiet(scene, znacznikiStanu(nosniki, { skala, wynikiCzytelne: czytelnyNaEkranie(PISMO_WYNIKOW.fontSize, skala) }));
}
