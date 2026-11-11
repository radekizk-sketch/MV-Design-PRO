/**
 * BLOK ZABEZPIECZEŃ POLA — JEDNA kompozycja przekaźnika/sterownika pola dla każdego miejsca, w
 * którym schemat rysuje funkcje zabezpieczeniowe pola (karta JEDNA NOTACJA BLOKU ZABEZPIECZEŃ,
 * decyzja właściciela 2026-11-05: „tak ma być ramka we wszystkich tak samo”; wzorzec: blok pola
 * liniowego GPZ, karta UX-04/POLE-LINIOWE-WZORZEC, odbiór właściciela 2026-11-04, korekta v2).
 *
 * Wołający: pola SN GPZ (`compose/gpz.ts` — pola sekcji i pola toru transformatora, z
 * powiązaniami obwodów wtórnych i bez nich) oraz pola SN stacji (`compose/station.ts` — każda
 * rola: liniowe, odgałęźne, transformatorowe, sprzęgło, pomiarowe, pola źródeł PV/BESS/FW).
 * Logika położenia, ramki, wierszy, linii wtórnych i braków danych żyje WYŁĄCZNIE tutaj;
 * wołający podają dane pola, narysowany stos i przeszkody swojego rysunku.
 *
 * Notacja (UX04 §11.20 pkt 3):
 *  - prostokątna ramka bez okręgu przekaźnika, kody funkcji `Bay.protection_codes` w dwóch
 *    kolumnach (kolejność danych, lewa ⌈n/2⌉), pod lewą kolumną odniesienia obwodów spoza pola
 *    (źródło 3U₀); ramka z JEDNEJ funkcji geometrii (`symbols/blokZabezpieczen.ts`);
 *  - LOD2 — ramka z kodami; LOD1 — ramka tego samego kształtu bez kodów; LOD0 — bez bloku;
 *  - środek ramki na wysokości łącznika, który przekaźnik wyłącza (`ResolvedProtectionMarking.
 *    tripTarget`: cewka wyłączająca symbolu albo środek symbolu); gdy model nie wskazuje
 *    łącznika wyłączanego — na wysokości PIERWSZEGO łącznika pola w kolejności toru
 *    (`lacznikOsiBloku`), bez linii wyłączania. Ramka nie wychodzi ponad górną krawędź
 *    rysunku aparatów pola (nie wchodzi na szynę ani zejście); gdy środek musiałby stać wyżej,
 *    górna krawędź ramki = górna krawędź pierwszego aparatu pola (siatka);
 *  - linia wyłączania: od zaczepu na łączniku (cewka albo zarejestrowany port N) poziomo do lewej
 *    krawędzi ramki; linie pomiarowe — WYŁĄCZNIE z powiązań obwodów wtórnych w modelu
 *    (`funkcje_eaz_zasilane`), każda do własnego wejścia na krawędzi ramki; pole bez powiązań
 *    obwodów wtórnych nie ma linii pomiarowych (model ich nie niesie);
 *  - położenie poziome: pierwsze od łącznika (co oczko) wolne od aparatów, opisów, torów
 *    i linii pola; gdy żadne nie jest wolne — prawo-wyrównane do rezerwacji kolumny pola.
 */
import { GRID, rectsOverlap, snapToGrid, snapUp, type V3Rect } from '../core/grid';
import { labelLineHeight } from '../core/text';
import {
  CONTINUITY_APPARATUS_SYMBOL_IDS,
  SYMBOL_DEFS,
  obrysSymbolu,
  rodzajSymbolu,
  type SymbolId,
} from '../symbols/defs';
import { ramkaBlokuZWierszy, zasiegRamkiBloku } from '../symbols/blokZabezpieczen';
import { prostokatEtykietyZakotwiczonej, type SimpleAnchoredOwnerInput } from '../layout/labels';
import type { RouteVertex } from '../layout/route';
import {
  ODSTEP_KOLUMN_KODOW_EAZ,
  ODSTEP_WIERSZY_KODOW_EAZ,
  PROTECTION_ANNOTATION_DIAMETER,
  PROTECTION_FULL_LIST_LABEL_CLASS,
  bayHasProtectionAnnotation,
  czyPrzekaznikZPowiazaniamiObwodow,
  kolumnyKodowBloku,
  liczbaZrodelPomiaruPola,
  odniesieniaPrzekaznikaPola,
  protectionDeviceCenter,
  resolveStationProtectionMarking,
  szerokoscKolumnyKodow,
  type PlacedStackDevice,
  type ResolvedProtectionMarking,
} from './protectionMarking';
import type { MiniBlockBayDescriptor } from '../../v2/model/widokPolStacji';
import {
  planBayApparatus,
  polozeniaToruGlownego,
  rekordyToruPola,
  ukladGalezi,
  wezelOdczepu,
  zwisAparatuBocznego,
} from './apparatusSequence';

/** Odstęp bloku zabezpieczeń od obrysu łącznika [px świata] — krótka linia wyłączania (dwa
 *  oczka) między łącznikiem a lewą krawędzią ramki. */
export const ODSTEP_BLOKU_OD_WYLACZNIKA = 2 * GRID;

/** Zacisk wtórny aparatu w świecie. */
export interface PortWtornyWSwiecie {
  readonly x: number;
  readonly y: number;
  readonly dir: 'N' | 'S' | 'E' | 'W';
}

/** Zacisk wtórny `nazwa` narysowanego aparatu; `null`, gdy symbol go nie niesie (rysunek
 *  kanoniczny bez obwodów wtórnych). */
export function portWtornyWSwiecie(aparat: PlacedStackDevice, nazwa: string): PortWtornyWSwiecie | null {
  const port = SYMBOL_DEFS[aparat.symbolId].secondaryPorts.find((p) => p.name === nazwa);
  return port ? { x: aparat.x + port.x, y: aparat.y + port.y, dir: port.dir } : null;
}

/** Odejście linii pomiarowej bloku z powiązaniami: zacisk wtórny źródła i wysokość odcinka
 *  poziomego (zacisk skierowany w dół schodzi o oczko). */
export interface OdejsciePomiaru {
  readonly zrodlo: PlacedStackDevice;
  readonly zacisk: PortWtornyWSwiecie;
  readonly odejscieY: number;
}

/** Odejścia linii pomiarowych posortowane po wysokości (od najwyższego) i źródła bez zacisku
 *  wtórnego. Jedno źródło rysunku linii i przeszkód tabliczek przekładników. */
export function odejsciaLiniiPomiarowych(zrodlaPomiaru: readonly PlacedStackDevice[]): {
  readonly odejscia: readonly OdejsciePomiaru[];
  readonly bezZacisku: readonly PlacedStackDevice[];
} {
  const odejscia: OdejsciePomiaru[] = [];
  const bezZacisku: PlacedStackDevice[] = [];
  for (const zrodlo of zrodlaPomiaru) {
    const zacisk = portWtornyWSwiecie(zrodlo, 'wtorny');
    if (!zacisk) {
      bezZacisku.push(zrodlo);
      continue;
    }
    odejscia.push({ zrodlo, zacisk, odejscieY: zacisk.dir === 'S' ? zacisk.y + GRID : zacisk.y });
  }
  odejscia.sort((a, b) => a.odejscieY - b.odejscieY);
  return { odejscia, bezZacisku };
}

/** Zaczep linii wyłączania na łączniku: cewka wyłączająca symbolu, gdy ją niesie; inaczej
 *  zarejestrowany port N, a bez niego środek górnej krawędzi. */
export function zaczepLiniiWylaczania(
  tripTarget: PlacedStackDevice,
  cewka: PortWtornyWSwiecie | null,
): { readonly x: number; readonly y: number } {
  if (cewka) return { x: cewka.x, y: cewka.y };
  const def = SYMBOL_DEFS[tripTarget.symbolId];
  const north = def.ports.find((p) => p.dir === 'N');
  return north ? { x: tripTarget.x + north.x, y: tripTarget.y + north.y } : { x: tripTarget.x + def.width / 2, y: tripTarget.y };
}

/** Prostokąty odcinków łamanej (grubość 1 j.św.) — przeszkody tabliczek i sonda kolizji linii. */
export function prostokatyOdcinkow(punkty: readonly { readonly x: number; readonly y: number }[]): V3Rect[] {
  const wynik: V3Rect[] = [];
  for (let i = 1; i < punkty.length; i += 1) {
    const a = punkty[i - 1];
    const b = punkty[i];
    wynik.push({ x: Math.min(a.x, b.x) - 0.5, y: Math.min(a.y, b.y) - 0.5, width: Math.abs(b.x - a.x) + 1, height: Math.abs(b.y - a.y) + 1 });
  }
  return wynik;
}

/**
 * Wiersze bloku zabezpieczeń: WSZYSTKIE kody funkcji pola w dwóch kolumnach (`kolumnyKodowBloku`
 * — kolejność danych `Bay.protection_codes`, lewa ⌈n/2⌉), pod lewą kolumną odniesienia obwodów
 * spoza pola (źródło 3U₀). Zaczep (`blokX`, `blokY`) to lewy górny róg ramki w piśmie sceny:
 * prostokąty wierszy zaczynają się oczko w prawo i oczko w dół od niego (zaczep „right” odsuwa
 * prostokąt o `GRID`). Jedno źródło wierszy dla rysunku, wyboru położenia, rezerwacji kolumny
 * i ramki.
 */
export function wierszeBlokuZabezpieczen(
  bayRef: string,
  codes: readonly string[],
  odniesienia: readonly string[],
  blokX: number,
  blokY: number,
): SimpleAnchoredOwnerInput[] {
  const [lewa, prawa] = kolumnyKodowBloku(codes);
  const xLewej = blokX;
  const xPrawej = xLewej + szerokoscKolumnyKodow(lewa) + ODSTEP_KOLUMN_KODOW_EAZ;
  const polowaWiersza = labelLineHeight(PROTECTION_FULL_LIST_LABEL_CLASS) / 2;
  const yWiersza = (w: number): number => blokY + GRID + polowaWiersza + w * ODSTEP_WIERSZY_KODOW_EAZ;
  const komorki = [
    ...lewa.map((kod, w) => ({ kod, x: xLewej, w })),
    ...prawa.map((kod, w) => ({ kod, x: xPrawej, w })),
  ];
  const wynik: SimpleAnchoredOwnerInput[] = komorki.map(({ kod, x, w }, n) => ({
    ownerRef: `${bayRef}#protection-codes-full${n === 0 ? '' : `-${n + 1}`}`,
    ownerKind: 'protection',
    text: kod,
    labelClass: PROTECTION_FULL_LIST_LABEL_CLASS,
    anchor: { x, y: yWiersza(w) },
    placement: 'right',
    wyrownanieTekstu: 'poczatek',
  }));
  odniesienia.forEach((wiersz, k) => {
    wynik.push({
      ownerRef: `${bayRef}#zrodlo-u0${k === 0 ? '' : `-${k + 1}`}`,
      ownerKind: 'protection',
      text: wiersz,
      labelClass: PROTECTION_FULL_LIST_LABEL_CLASS,
      anchor: { x: xLewej, y: yWiersza(lewa.length + k) },
      placement: 'right',
      wyrownanieTekstu: 'poczatek',
    });
  });
  return wynik;
}

/** Ramka bloku w świecie z wierszy bloku (`ramkaBlokuZWierszy` — jedna funkcja geometrii);
 *  `null` = blok bez wierszy. */
export function ramkaBlokuZabezpieczen(
  wiersze: readonly SimpleAnchoredOwnerInput[],
  blokX: number,
  blokY: number,
  minSzerokosc: number,
): V3Rect | null {
  return ramkaBlokuZWierszy(wiersze.map(prostokatEtykietyZakotwiczonej), blokX, blokY, minSzerokosc);
}

/** Rodzaje łączników toru pola (aparaty ciągłości), na których wysokości może stać blok. */
const RODZAJE_LACZNIKOW_TORU: ReadonlySet<SymbolId> = new Set(CONTINUITY_APPARATUS_SYMBOL_IDS.map(rodzajSymbolu));

/**
 * Łącznik, na którego wysokości stoi środek ramki: łącznik wyłączany przez przekaźnik
 * (`tripTarget` z `breaker_ref` albo z powiązania `funkcje_eaz_wylaczajace`), a gdy model go nie
 * wskazuje — PIERWSZY łącznik pola w kolejności stosu (od szyny); pole bez łącznika — kotwica
 * oznakowania (`marking.anchor`).
 */
export function lacznikOsiBloku(marking: ResolvedProtectionMarking, stos: readonly PlacedStackDevice[]): PlacedStackDevice {
  return marking.tripTarget ?? stos.find((d) => RODZAJE_LACZNIKOW_TORU.has(rodzajSymbolu(d.symbolId))) ?? marking.anchor;
}

type PoleZBlokiem = Pick<MiniBlockBayDescriptor, 'protectionMarking' | 'zrodloU0' | 'primaryDevices'> & {
  readonly bayRef: string;
};

/**
 * Szerokość rezerwacji bloku w kolumnie pola: odstęp od łącznika + szerokość ramki (wejścia
 * linii pomiarowych liczone dla wszystkich źródeł pomiaru pola — górna granica: rysunek kładzie
 * na krawędzi dolnej albo górnej co najwyżej tyle wejść). 0 = pole bez kodów funkcji. TA SAMA
 * funkcja ramki co rysunek — rezerwacja i rysunek nie mogą się rozjechać.
 */
export function szerokoscBlokuZabezpieczenPola(bay: PoleZBlokiem): number {
  const codes = bay.protectionMarking?.codes ?? [];
  if (codes.length === 0) return 0;
  const zrodla = czyPrzekaznikZPowiazaniamiObwodow(codes, bay.primaryDevices) ? liczbaZrodelPomiaruPola(codes, bay.primaryDevices) : 0;
  const ramka = ramkaBlokuZabezpieczen(
    wierszeBlokuZabezpieczen(bay.bayRef, codes, odniesieniaPrzekaznikaPola(bay, codes), 0, 0),
    0,
    0,
    (zrodla + 1) * GRID,
  );
  return ODSTEP_BLOKU_OD_WYLACZNIKA + (ramka?.width ?? 0);
}

type ProtectionAwareBay = Pick<
  MiniBlockBayDescriptor,
  'protectionMarking' | 'meteringMeasurementRef' | 'ctRatingAnnotations' | 'vtMountingAnnotations' | 'zrodloU0' | 'primaryDevices'
> & { readonly bayRef: string };

/**
 * Szerokość DODATKOWA kolumny pola na adnotacje zabezpieczeń (spec §5.1, §17.3) — TYLKO gdy pole
 * niesie dane (§17.2/§18.3), 0 bez danych. Pasmo bloku zabezpieczeń
 * (`szerokoscBlokuZabezpieczenPola`) albo okręgu miernika (GRID + średnica), większe z dwóch.
 * Opisy przekładników (tabliczki, montaż VT) stoją w kolumnie przekładni przy lewej krawędzi pola
 * (`./kolumnaOpisowPola`, wzorzec właściciela 2026-11-05), nie w pasmie za torem. Rezerwacja jest funkcją DANYCH, nie LOD (measure nie zna LOD); JEDNA funkcja dla stacji
 * (`layout/measure.ts`) i GPZ (`compose/gpz.ts::gpzBayAnnotationWidth`).
 */
export function protectionAnnotationColumnWidth(bay: ProtectionAwareBay): number {
  if (!bayHasProtectionAnnotation(bay)) return 0;
  const blok = szerokoscBlokuZabezpieczenPola(bay);
  const miernik = bay.meteringMeasurementRef != null ? GRID + PROTECTION_ANNOTATION_DIAMETER : 0;
  return Math.max(blok, miernik);
}

/** Wejście kompozycji bloku jednego pola. */
export interface WejscieBlokuPola {
  readonly bayRef: string;
  readonly marking: ResolvedProtectionMarking;
  /** Odniesienia obwodów spoza pola (`odniesieniaPrzekaznikaPola`). */
  readonly odniesienia: readonly string[];
  /** Pole z powiązaniami obwodów wtórnych w modelu (`czyPrzekaznikZPowiazaniamiObwodow` — ten sam
   *  predykat co rezerwacja). */
  readonly powiazany: boolean;
  /** Narysowany stos pola (aparaty toru i boczne). */
  readonly stos: readonly PlacedStackDevice[];
  /** Przeszkody rysunku wokół pola: opisy, tory, zarezerwowane tabliczki przekładników. */
  readonly przeszkody: readonly V3Rect[];
  /** Prawa krawędź rezerwacji kolumny pola. */
  readonly prawaKrawedz: number;
}

/** Ułożenie bloku zabezpieczeń pola w świecie. */
export interface UkladBlokuPola {
  /** Ramka bloku w świecie (lewy górny róg = położenie symbolu sceny). */
  readonly ramka: V3Rect;
  /** Blok prawo-wyrównany do rezerwacji kolumny (żadne bliższe położenie nie było wolne). */
  readonly wyrownanyDoPrawej: boolean;
  /** Wiersze kodów i odniesień wewnątrz ramki (rysowane na LOD2). */
  readonly wiersze: readonly SimpleAnchoredOwnerInput[];
  /** Linia wyłączania (zaczep na łączniku → lewa krawędź ramki); `null` = model nie wskazuje
   *  łącznika wyłączanego. */
  readonly liniaWylaczania: readonly RouteVertex[] | null;
  /** Linia wyłączania zaczepiona na cewce wyłączającej symbolu (bez numeru „52"). */
  readonly liniaDoCewki: boolean;
  /** Linie pomiarowe z powiązań obwodów wtórnych (zacisk wtórny → wejście na krawędzi ramki). */
  readonly liniePomiarowe: readonly (readonly RouteVertex[])[];
  /** Źródła pomiaru z powiązaniem, których symbol nie niesie zacisku wtórnego. */
  readonly zrodlaBezZacisku: readonly PlacedStackDevice[];
  /** Przeszkody rysunku bloku dla tabliczek przekładników: zasięg ramki i linie. */
  readonly przeszkody: readonly V3Rect[];
}

/** Gabaryt aparatu dla linii bloku: obrys tuszu ∪ gabaryt symbolu (ten sam prostokąt co
 *  wyrocznia przewód↔symbol sceny, `symbolWireCollisions`). */
function gabarytAparatu(d: PlacedStackDevice): V3Rect {
  const o = obrysSymbolu(d.symbolId);
  const def = SYMBOL_DEFS[d.symbolId];
  const x0 = Math.min(d.x + o.x, d.x);
  const y0 = Math.min(d.y + o.y, d.y);
  return {
    x: x0,
    y: y0,
    width: Math.max(d.x + o.x + o.width, d.x + def.width) - x0,
    height: Math.max(d.y + o.y + o.height, d.y + def.height) - y0,
  };
}

/** Łamana bez pierwszego jednostkowego odcinka przy zaczepie: linia zaczepiona w porcie toru
 *  styka się tam z przewodem toru (zaczep, nie kolizja). */
function bezZaczepu(punkty: readonly RouteVertex[]): RouteVertex[] {
  if (punkty.length < 2) return [...punkty];
  const [a, b] = punkty;
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  return [{ x: a.x + dx, y: a.y + dy }, ...punkty.slice(1)];
}

/** Ułożenie bloku zabezpieczeń pola (opis reguł w nagłówku pliku). */
/**
 * Położenie PIONOWE bloku pola — JEDNO źródło dla kompozycji (`ulozBlokZabezpieczenPola`, stacje
 * i GPZ) i rezerwacji wysokości kolumny pola stacji (`dolRamkiBlokuPolaStacji`, `layout/measure.ts`):
 * oś bloku = zacisk cewki wyłączającej łącznika wyłączanego, a bez cewki — środek łącznika osi
 * (`lacznikOsiBloku`); środek ramki na osi, ramka nie wychodzi ponad górną krawędź rysunku
 * aparatów pola. `blokY` = zaczep wierszy (lewy górny róg bloku przed poszerzeniem pisma),
 * `gora`/`dol` — krawędzie ramki (ramka zależy od wierszy, nie od położenia poziomego).
 */
export function pionBlokuPola(
  bayRef: string,
  marking: ResolvedProtectionMarking,
  odniesienia: readonly string[],
  stos: readonly PlacedStackDevice[],
): { readonly blokY: number; readonly wysokoscOsi: number; readonly gora: number; readonly dol: number } {
  const wylacznik = marking.tripTarget;
  const cewka = wylacznik ? portWtornyWSwiecie(wylacznik, 'wylacz') : null;
  const wysokoscOsi = cewka ? cewka.y : protectionDeviceCenter(lacznikOsiBloku(marking, stos)).y;
  const wzorcowa = ramkaBlokuZabezpieczen(wierszeBlokuZabezpieczen(bayRef, marking.codes, odniesienia, 0, 0), 0, 0, 0)!;
  const goraStosu = Math.min(...stos.map((d) => gabarytAparatu(d).y));
  let blokY = snapToGrid(wysokoscOsi - wzorcowa.y - wzorcowa.height / 2);
  if (blokY + wzorcowa.y < goraStosu) blokY = snapUp(goraStosu - wzorcowa.y);
  return { blokY, wysokoscOsi, gora: blokY + wzorcowa.y, dol: blokY + wzorcowa.y + wzorcowa.height };
}

/**
 * Stos pola stacji względem szczytu stosu (`topY` = 0, oś toru w `x` = 0) — te same aparaty
 * i położenia pionowe co `compose/station.ts::buildBayStack`, z tych samych funkcji planu: tor
 * główny (`polozeniaToruGlownego`), aparaty boczne pod węzłem odczepu (`wezelOdczepu`
 * + `zwisAparatuBocznego`), odgałęzienia toru (`ukladGalezi`); rekordy pola dowiązane jak
 * w `stackItemsForBay` (sekwencja `rekordyToruPola`). Położenia poziome nie są tu potrzebne
 * (rezerwacja pionowa) i nie są odtwarzane.
 */
function stosPolaStacjiWzgledny(bay: PoleStacjiZBlokiem): PlacedStackDevice[] {
  const plan = planBayApparatus(bay);
  const rekordy = plan.source === 'dane' ? rekordyToruPola(bay.primaryDevices).rekordy : [];
  const dowiazanie = (indeks: number): Omit<PlacedStackDevice, 'symbolId' | 'x' | 'y'> => {
    const d = rekordy[indeks];
    if (!d) return {};
    return {
      deviceRef: d.deviceRef,
      linkedRef: d.linkedRef,
      ...(d.funkcjeEazZasilane ? { funkcjeEazZasilane: d.funkcjeEazZasilane } : {}),
      ...(d.funkcjeEazWylaczajace ? { funkcjeEazWylaczajace: d.funkcjeEazWylaczajace } : {}),
    };
  };
  const polozenia = polozeniaToruGlownego(plan);
  const glowny = plan.mainPath.map((symbolId, k) => ({
    symbolId,
    x: snapToGrid(-SYMBOL_DEFS[symbolId].width / 2),
    y: polozenia.y[k],
    ...dowiazanie(plan.mainSequenceIndices[k]),
  }));
  if (glowny.length === 0) return [];
  const kotwica = (afterMainIndex: number) => {
    const a = afterMainIndex >= 0 ? glowny[afterMainIndex] : glowny[0];
    return wezelOdczepu(a.symbolId, a.x, a.y, afterMainIndex >= 0).wezel;
  };
  const boczne = plan.laterals.map((lat) => ({
    symbolId: lat.symbolId,
    x: 0,
    y: kotwica(lat.afterMainIndex).y + zwisAparatuBocznego(lat.symbolId),
    ...dowiazanie(lat.sequenceIndex),
  }));
  const galezie = plan.galezie.flatMap((galaz) =>
    ukladGalezi(
      galaz,
      kotwica(galaz.afterMainIndex),
      0,
      (i) => rekordy[i],
      galaz.afterMainIndex >= 0 ? rekordy[plan.mainSequenceIndices[galaz.afterMainIndex]] : undefined,
    ).pozycje.map((pozycja) => ({ symbolId: pozycja.symbolId, x: pozycja.x, y: pozycja.y, ...dowiazanie(pozycja.sequenceIndex) })),
  );
  return [...glowny, ...boczne, ...galezie];
}

type PoleStacjiZBlokiem = PoleZBlokiem &
  Pick<MiniBlockBayDescriptor, 'fieldRole' | 'reserve' | 'transformerRef'>;

/**
 * Dolna krawędź ramki bloku zabezpieczeń pola stacji względem szczytu stosu pola — rezerwacja
 * wysokości kolumny (`layout/measure.ts::stationBlockHeight`) i zejście zacisku nN pod blok pola
 * transformatorowego (`compose/station.ts`, `lvColumnBottoms`) liczone TĄ SAMĄ funkcją położenia
 * (`pionBlokuPola`) i tym samym rozstrzygnięciem łącznika wyłączanego
 * (`resolveStationProtectionMarking`) co rysunek. `null` = pole bez bloku (brak kodów funkcji).
 * Rezerwacja jest funkcją DANYCH, nie LOD (jak szerokość, `protectionAnnotationColumnWidth`).
 * Pomiar 2026-11-05 (karta JEDNA NOTACJA BLOKU ZABEZPIECZEŃ, fikstura 52 stacji): blok siedmiu
 * kodów pola transformatorowego (ramka 80 j.św.) przy aparatach pola wysokich na 64 j.św. sięgał
 * dolną krawędzią szyny rzędu źródeł nN (`#der-row-bus`) — 16 kolizji symbol↔przewód na L2.
 */
export function dolRamkiBlokuPolaStacji(bay: PoleStacjiZBlokiem): number | null {
  const stos = stosPolaStacjiWzgledny(bay);
  const marking = resolveStationProtectionMarking(bay, stos);
  if (!marking) return null;
  return pionBlokuPola(bay.bayRef, marking, odniesieniaPrzekaznikaPola(bay, marking.codes), stos).dol;
}

export function ulozBlokZabezpieczenPola(w: WejscieBlokuPola): UkladBlokuPola {
  const { bayRef, marking, odniesienia, powiazany, stos, przeszkody, prawaKrawedz } = w;
  const wylacznik = marking.tripTarget;
  const cewka = wylacznik ? portWtornyWSwiecie(wylacznik, 'wylacz') : null;
  const odejscia = powiazany ? odejsciaLiniiPomiarowych(marking.zrodlaPomiaru) : { odejscia: [], bezZacisku: [] };
  const lacznik = lacznikOsiBloku(marking, stos);
  const zaczepWylaczania = wylacznik ? zaczepLiniiWylaczania(wylacznik, cewka) : null;
  const wierszeW = (blokX: number, blokY: number) => wierszeBlokuZabezpieczen(bayRef, marking.codes, odniesienia, blokX, blokY);
  // Położenie pionowe — `pionBlokuPola` (jedno źródło z rezerwacją wysokości kolumny).
  const { blokY, wysokoscOsi, gora: goraRamki, dol: dolRamki } = pionBlokuPola(bayRef, marking, odniesienia, stos);
  // Wejścia linii pomiarowych na krawędziach ramki — po stronie źródła: źródło poniżej ramki
  // wchodzi od dołu, powyżej — od góry, na wysokości ramki — od lewej (na swojej wysokości). Na
  // krawędzi dolnej i górnej wejścia stoją co oczko od PRAWEJ krawędzi, źródło DALSZE od ramki
  // bliżej prawej krawędzi: linie się nie krzyżują.
  const stronaWejscia = (odejscieY: number): 'dol' | 'gora' | 'lewa' =>
    odejscieY > dolRamki ? 'dol' : odejscieY < goraRamki ? 'gora' : 'lewa';
  const indeksyWejsc = new Map<number, number>();
  const zIndeksem = odejscia.odejscia.map((o, i) => ({ o, i }));
  zIndeksem
    .filter(({ o }) => stronaWejscia(o.odejscieY) === 'dol')
    .sort((p, q) => q.o.odejscieY - p.o.odejscieY || p.i - q.i)
    .forEach(({ i }, k) => indeksyWejsc.set(i, k));
  zIndeksem
    .filter(({ o }) => stronaWejscia(o.odejscieY) === 'gora')
    .sort((p, q) => p.o.odejscieY - q.o.odejscieY || p.i - q.i)
    .forEach(({ i }, k) => indeksyWejsc.set(i, k));
  const liczbaWejscKrawedzi = Math.max(0, ...[...indeksyWejsc.values()].map((k) => k + 1));
  const ramkaW = (blokX: number): V3Rect => ramkaBlokuZabezpieczen(wierszeW(blokX, blokY), blokX, blokY, (liczbaWejscKrawedzi + 1) * GRID)!;
  const szerokoscRamki = ramkaW(0).width;
  // Linia wyłączania: od zaczepu (cewka wyłączająca albo port N łącznika) poziomo do lewej
  // krawędzi ramki na osi bloku (zaczep poza osią — załamanie oczko przed ramką).
  const liniaWylaczania = (x: number): RouteVertex[] | null => {
    if (!zaczepWylaczania) return null;
    const wejscie = { x, y: snapToGrid(wysokoscOsi) };
    return zaczepWylaczania.y === wejscie.y
      ? [{ x: zaczepWylaczania.x, y: zaczepWylaczania.y }, wejscie]
      : [
          { x: zaczepWylaczania.x, y: zaczepWylaczania.y },
          { x: x - GRID, y: zaczepWylaczania.y },
          { x: x - GRID, y: wejscie.y },
          wejscie,
        ];
  };
  // Linie pomiarowe z powiązań modelu: każde źródło z zacisku wtórnego do WŁASNEGO wejścia.
  const trasyPomiarowe = (blokX: number): { readonly punkty: RouteVertex[]; readonly pionX: number }[] =>
    odejscia.odejscia.map(({ zacisk, odejscieY }, indeks) => {
      const punkty: RouteVertex[] = [{ x: zacisk.x, y: zacisk.y }];
      if (zacisk.dir === 'S') punkty.push({ x: zacisk.x, y: odejscieY });
      const strona = stronaWejscia(odejscieY);
      if (strona === 'lewa') {
        punkty.push({ x: blokX, y: odejscieY });
        return { punkty, pionX: blokX };
      }
      const pionX = blokX + szerokoscRamki - (indeksyWejsc.get(indeks)! + 1) * GRID;
      punkty.push({ x: pionX, y: odejscieY }, { x: pionX, y: strona === 'dol' ? dolRamki : goraRamki });
      return { punkty, pionX };
    });
  const aparaty = stos.map((d) => ({ d, r: gabarytAparatu(d) }));
  const kolizjaPolozenia = (blokX: number): boolean => {
    const ramka = ramkaW(blokX);
    // Zasięg z pasem krawędzi — ten sam predykat co declutter sceny (`przeszkodySymbolu`).
    const zasieg = zasiegRamkiBloku(ramka);
    if (aparaty.some((a) => rectsOverlap(a.r, zasieg)) || przeszkody.some((p) => rectsOverlap(p, zasieg))) return true;
    // Wnętrze ramki bez krawędzi — linia dochodzi do krawędzi, nie przez wnętrze.
    const wnetrze: V3Rect = { x: ramka.x + 1, y: ramka.y + 1, width: ramka.width - 2, height: ramka.height - 2 };
    const trasy = trasyPomiarowe(blokX);
    const linie: { readonly wlasny: PlacedStackDevice | null; readonly odcinki: V3Rect[] }[] = [];
    const wylaczanie = liniaWylaczania(blokX);
    if (wylaczanie) linie.push({ wlasny: wylacznik, odcinki: prostokatyOdcinkow(bezZaczepu(wylaczanie)) });
    for (let k = 0; k < trasy.length; k += 1) {
      const trasa = trasy[k];
      const { zrodlo, zacisk } = odejscia.odejscia[k];
      // Odejście w kierunku zacisku wtórnego (linia nie wraca przez własny symbol).
      if (zacisk.dir === 'E' && trasa.pionX < zacisk.x + GRID / 2) return true;
      if (zacisk.dir === 'W' && trasa.pionX > zacisk.x - GRID / 2) return true;
      linie.push({ wlasny: zrodlo, odcinki: prostokatyOdcinkow(trasa.punkty) });
    }
    for (const linia of linie) {
      for (const r of linia.odcinki) {
        if (aparaty.some((a) => a.d !== linia.wlasny && rectsOverlap(a.r, r))) return true;
        if (przeszkody.some((p) => rectsOverlap(p, r)) || rectsOverlap(wnetrze, r)) return true;
      }
    }
    for (let a = 0; a < linie.length; a += 1) {
      for (let b = a + 1; b < linie.length; b += 1) {
        if (linie[a].odcinki.some((ra) => linie[b].odcinki.some((rb) => rectsOverlap(ra, rb)))) return true;
      }
    }
    return false;
  };
  // Pierwsze od łącznika położenie co oczko wolne od rysunku pola; żadne — prawo-wyrównane do
  // rezerwacji kolumny (położenie ostatnie).
  let blokX = snapToGrid(prawaKrawedz - szerokoscRamki);
  let wyrownanyDoPrawej = true;
  const o = obrysSymbolu(lacznik.symbolId);
  const start = snapUp(lacznik.x + o.x + o.width + ODSTEP_BLOKU_OD_WYLACZNIKA);
  for (let x = start; x + szerokoscRamki <= prawaKrawedz; x += GRID) {
    if (!kolizjaPolozenia(x)) {
      blokX = x;
      wyrownanyDoPrawej = false;
      break;
    }
  }
  const ramka = ramkaW(blokX);
  const wylaczanie = liniaWylaczania(blokX);
  const trasy = trasyPomiarowe(blokX).map((t) => t.punkty);
  return {
    ramka,
    wyrownanyDoPrawej,
    wiersze: wierszeW(blokX, blokY),
    liniaWylaczania: wylaczanie,
    liniaDoCewki: cewka !== null,
    liniePomiarowe: trasy,
    zrodlaBezZacisku: odejscia.bezZacisku,
    przeszkody: [zasiegRamkiBloku(ramka), ...(wylaczanie ? prostokatyOdcinkow(wylaczanie) : []), ...trasy.flatMap(prostokatyOdcinkow)],
  };
}

/** Elementy rysunku bloku dla danego poziomu szczegółu (wołający dokłada je do swoich warstw). */
export interface ElementyBlokuPola {
  /** Symbol sceny bloku: lewy górny róg ramki, ramka, wiersze i wejścia względem symbolu. */
  readonly symbol: {
    readonly x: number;
    readonly y: number;
    readonly ramkaBloku: V3Rect;
    readonly wierszeBloku: readonly string[];
    readonly wejsciaBloku: readonly { readonly x: number; readonly y: number }[];
  };
  /** Wiersze kodów i odniesień (LOD2; puste na LOD1). */
  readonly wiersze: readonly SimpleAnchoredOwnerInput[];
  /** Linia wyłączania `#trip-line` (LOD1 i LOD2, gdy model wskazuje łącznik wyłączany). */
  readonly liniaWylaczania: { readonly ownerRef: string; readonly points: readonly RouteVertex[] } | null;
  /** Numer urządzenia „52" przy łączniku (LOD2, linia zaczepiona w porcie toru, nie na cewce). */
  readonly numerUrzadzenia: SimpleAnchoredOwnerInput | null;
  /** Linie pomiarowe `#measurement-link[-n]` (LOD2). */
  readonly liniePomiarowe: readonly { readonly ownerRef: string; readonly points: readonly RouteVertex[] }[];
  /** Kody braków danych pola (LOD2 — audyt luk danych). */
  readonly missingData: readonly string[];
}

/** Prześwit numeru urządzenia „52” nad linią wyłączania [j.św.] — dolna krawędź napisu nad
 *  kreską linii (grubość kreski ≤ 2 j.św.), przyciąganie do siatki od linii w górę. */
const ODSTEP_NUMERU_URZADZENIA_OD_LINII = 2;

/**
 * Elementy bloku na poziomie szczegółu: `'full'` (LOD2) — ramka, wiersze, linia wyłączania,
 * „52", linie pomiarowe i braki danych; `'circle-only'` (LOD1) — ramka tego samego kształtu
 * bez wierszy i linia wyłączania (blok połączony z łącznikiem, który wyłącza).
 *
 * Braki danych (bez zmian semantyki): brak łącznika wyłączanego — `trip_link_unresolved`; pole
 * z powiązaniami — źródło bez zacisku wtórnego (`measurement_source_port_absent:<ref>`) i brak
 * źródeł (`measurement_link_unresolved`); pole bez powiązań — brak przekładnika wskazanego przez
 * `ct_ref` (`measurement_link_unresolved`).
 */
export function elementyBlokuZabezpieczen(
  w: WejscieBlokuPola,
  uklad: UkladBlokuPola,
  annotationDetail: 'full' | 'circle-only',
): ElementyBlokuPola {
  const pelny = annotationDetail === 'full';
  const { ramka } = uklad;
  const wiersze = pelny ? uklad.wiersze : [];
  const wejscia: RouteVertex[] = [];
  if (uklad.liniaWylaczania) wejscia.push(uklad.liniaWylaczania[uklad.liniaWylaczania.length - 1]);
  if (pelny) for (const t of uklad.liniePomiarowe) wejscia.push(t[t.length - 1]);
  const missingData: string[] = [];
  let numerUrzadzenia: SimpleAnchoredOwnerInput | null = null;
  const wylacznik = w.marking.tripTarget;
  if (pelny) {
    if (!wylacznik) missingData.push('bay.protection.trip_link_unresolved');
    if (w.powiazany) {
      for (const zrodlo of uklad.zrodlaBezZacisku) {
        missingData.push(`bay.protection.measurement_source_port_absent:${zrodlo.deviceRef ?? zrodlo.symbolId}`);
      }
      if (w.marking.zrodlaPomiaru.length === 0) missingData.push('bay.protection.measurement_link_unresolved');
    } else if (!w.marking.ctAnchor) {
      missingData.push('bay.protection.measurement_link_unresolved');
    }
    // Numer urządzenia „52" (§17.1) przy wyłączniku — WYŁĄCZNIE gdy linia wyłączania kończy się
    // na porcie toru łącznika; linia do cewki wyłączającej sama wskazuje aparat. Napis stoi NAD
    // linią wyłączania przy wyłączniku (strona `above`: pismo powiększane rośnie w górę, od
    // linii) — kotwica na wysokości linii ze stroną `right` centrowała napis na linii, więc
    // linia przekreślała numer z konstrukcji (plan etykiet: kolizja napis↔tor na każdym polu
    // z linią wyłączania do portu toru).
    if (wylacznik && uklad.liniaWylaczania && !uklad.liniaDoCewki) {
      numerUrzadzenia = {
        ownerRef: `${w.bayRef}#device-number`,
        ownerKind: 'protection',
        text: '52',
        labelClass: 't4',
        anchor: { x: wylacznik.x + SYMBOL_DEFS[wylacznik.symbolId].width, y: uklad.liniaWylaczania[0].y },
        placement: 'above',
        clearance: ODSTEP_NUMERU_URZADZENIA_OD_LINII,
        wyrownanieTekstu: 'poczatek',
      };
    }
  }
  return {
    symbol: {
      x: ramka.x,
      y: ramka.y,
      ramkaBloku: { x: 0, y: 0, width: ramka.width, height: ramka.height },
      wierszeBloku: wiersze.map((e) => e.ownerRef),
      wejsciaBloku: wejscia.map((p) => ({ x: p.x - ramka.x, y: p.y - ramka.y })),
    },
    wiersze,
    liniaWylaczania: uklad.liniaWylaczania ? { ownerRef: `${w.bayRef}#trip-line`, points: uklad.liniaWylaczania } : null,
    numerUrzadzenia,
    liniePomiarowe: pelny
      ? uklad.liniePomiarowe.map((points, i) => ({ ownerRef: `${w.bayRef}#measurement-link${i === 0 ? '' : `-${i + 1}`}`, points }))
      : [],
    missingData,
  };
}
