/**
 * KARTA ETYKIETA-STACJI-PRZELOTOWEJ — JEDNA reguła rodzaju stacji we froncie.
 *
 * Lustro backendu `enm/rodzaj_stacji.py` (SLD_CAD_SPEC_V3 §19.3, decyzja V12K-034, Opcja A):
 * rodzaj stacji (końcowa / przelotowa / odgałęźna / sekcyjna) jest WYPROWADZANY Z TOPOLOGII,
 * a deklarowana dana `Substation.station_type` służy wyłącznie walidacji — niezgodność
 * zgłasza walidator backendu (kod W043) z akcją naprawczą. Do tej karty front miał siedem
 * niezależnych reguł (schemat z liczby pól, hierarchia z portów, drzewo, karty, wyszukiwarka,
 * inspektor, konfigurator, powierzchnie DER z deklaracji — każda z innym domysłem dla wartości
 * nieznanej), więc projektant widział tę samą stację jako „odgałęźną" na schemacie
 * i „przelotową" w drzewie projektu.
 *
 * Reguła (wyłącznie z JAWNYCH danych modelu, bez domysłu):
 *  R1 pole sprzęgła w rozdzielnicy SN ⇒ sekcyjna;
 *  R2 ≥ 3 pola liniowe ⇒ odgałęźna;
 *  R3 2 pola liniowe ⇒ przelotowa, gdy co najmniej dwa wyprowadzenia (odcinki terenowe od
 *     szyn stacji) prowadzą do innej stacji; inaczej końcowa (recenzja NO-GO 2026-07-17
 *     pkt 7: „przelotowa ⇔ oba pola liniowe POŁĄCZONE");
 *  R4 0–1 pole liniowe ⇒ końcowa.
 * Pola: `meta.field_specs` (niepuste), a przy ich braku — elementy `bays` stacji. Rola pola:
 * `meta.field_role`, a gdy nierozpoznana — `bay_role`; rodzaj pola katalogowego (`bay_kind`)
 * potrzeb własnych, rezerwowego i odgromnikowego przesądza przed rolą (w katalogu takie pola
 * mają rolę `FEEDER`, ale nie są liniowe); rola nierozpoznana nie liczy się (walidator W044). Rodzaj nie dotyczy GPZ ani wolnostojącej rozdzielnicy nN.
 *
 * Parytet z backendem jest PRZYPIĘTY testem `__tests__/rodzajStacji.parytet.test.ts` na
 * każdej stacji każdego modelu ENM z fikstur generowanych i na modelu iloczynu cech (plik
 * oczekiwań wytwarza backend, `tests/reference_networks/rodzaj_stacji_parytet.py`).
 */
import { szynyStacji, type GalazDlaSzyn, type StacjaDlaSzyn } from './szynyStacji';

export type RodzajStacji = 'terminal' | 'inline' | 'branch' | 'sectional';

export const RODZAJE_STACJI: readonly RodzajStacji[] = ['terminal', 'inline', 'branch', 'sectional'];

/** Nazwa rodzaju (przymiotnik) na rysunku i w podpisach. */
export type NazwaRodzajuStacji = 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';

/** Nazwa rodzaju (przymiotnik) — lustro `NAZWY_RODZAJOW_STACJI_PL` backendu. */
export const NAZWA_RODZAJU_STACJI_PL: Readonly<Record<RodzajStacji, NazwaRodzajuStacji>> = {
  terminal: 'końcowa',
  inline: 'przelotowa',
  branch: 'odgałęźna',
  sectional: 'sekcyjna',
};

/** Deklaracje stacji, których rodzaj topologiczny nie dotyczy. */
export const TYPY_STACJI_BEZ_RODZAJU: ReadonlySet<string> = new Set(['gpz', 'rozdzielnica_nn']);

type KategoriaRoli = 'liniowe' | 'sprzeglo' | 'inne';

/** Rola pola → kategoria (lustro `KATEGORIA_ROLI_POLA` backendu). */
export const KATEGORIA_ROLI_POLA: Readonly<Record<string, KategoriaRoli>> = {
  LINIA_IN: 'liniowe',
  LINE_IN: 'liniowe',
  IN: 'liniowe',
  LINIA_OUT: 'liniowe',
  LINE_OUT: 'liniowe',
  OUT: 'liniowe',
  LINIA_ODG: 'liniowe',
  LINE_BRANCH: 'liniowe',
  FEEDER: 'liniowe',
  SPRZEGLO: 'sprzeglo',
  COUPLER: 'sprzeglo',
  TRANSFORMATOROWE: 'inne',
  TRANSFORMER: 'inne',
  TR: 'inne',
  POMIAROWE: 'inne',
  MEASUREMENT: 'inne',
  PV_SN: 'inne',
  PV: 'inne',
  OZE_PV: 'inne',
  BESS_SN: 'inne',
  BESS: 'inne',
  FW_SN: 'inne',
  FW: 'inne',
  FARMA_WIATROWA: 'inne',
  OZE: 'inne',
};

/** Rodzaj pola katalogowego, który przesądza przed rolą (lustro `KATEGORIA_RODZAJU_POLA`). */
export const KATEGORIA_RODZAJU_POLA: Readonly<Record<string, KategoriaRoli>> = {
  potrzeb_wlasnych: 'inne',
  rezerwowe: 'inne',
  odgromnikowe: 'inne',
};

/** Rodzaje gałęzi, które są odcinkiem terenowym SN (lustro `TYPY_ODCINKA_TERENOWEGO`). */
const TYPY_ODCINKA_TERENOWEGO: ReadonlySet<string> = new Set(['cable', 'line_overhead']);

export interface StacjaDlaRodzaju extends StacjaDlaSzyn {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly station_type?: unknown;
}

export interface GalazDlaRodzaju extends GalazDlaSzyn {
  readonly type?: unknown;
}

export interface PoleDlaRodzaju {
  readonly ref_id?: unknown;
  readonly name?: unknown;
  readonly substation_ref?: unknown;
  readonly bay_role?: unknown;
  readonly bay_kind?: unknown;
  readonly meta?: unknown;
}

export interface ModelDlaRodzaju {
  readonly substations?: readonly StacjaDlaRodzaju[] | null;
  readonly branches?: readonly GalazDlaRodzaju[] | null;
  readonly bays?: readonly PoleDlaRodzaju[] | null;
}

export interface RodzajStacjiWynik {
  readonly stationRef: string;
  readonly stationName: string | null;
  readonly rodzaj: RodzajStacji;
  readonly polaLiniowe: number;
  readonly sprzeglo: boolean;
  readonly wyprowadzeniaPolaczone: number;
  /** Deklaracja `station_type`, gdy jest rodzajem topologicznym; `null` — brak deklaracji rodzaju. */
  readonly deklaracja: RodzajStacji | null;
  readonly zgodnyZDeklaracja: boolean;
  readonly polaNierozpoznane: readonly string[];
  readonly przyczynaPl: string;
}

function napis(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function rekord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function lista(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

export function jestRodzajemStacji(value: unknown): value is RodzajStacji {
  return typeof value === 'string' && (RODZAJE_STACJI as readonly string[]).includes(value);
}

/** „1 pole liniowe", „2 pola liniowe", „5 pól liniowych" (lustro `liczba_pol_pl`). */
function liczbaPolLiniowychPl(liczba: number): string {
  if (liczba === 1) return '1 pole liniowe';
  if ([2, 3, 4].includes(liczba % 10) && ![12, 13, 14].includes(liczba % 100)) {
    return `${liczba} pola liniowe`;
  }
  return `${liczba} pól liniowych`;
}

/** Przyczyna rodzaju w słowach projektanta (lustro `przyczyna_rodzaju_pl`). */
export function przyczynaRodzajuPl(
  rodzaj: RodzajStacji,
  polaLiniowe: number,
  sprzeglo: boolean,
  wyprowadzeniaPolaczone: number,
): string {
  if (rodzaj === 'sectional' && sprzeglo) return 'rozdzielnica SN ma pole sprzęgła sekcji';
  if (rodzaj === 'branch') return `rozdzielnica SN ma ${liczbaPolLiniowychPl(polaLiniowe)}`;
  if (rodzaj === 'inline') {
    return 'rozdzielnica SN ma 2 pola liniowe, oba prowadzą do sąsiednich stacji';
  }
  if (polaLiniowe === 2) {
    const prowadzi = wyprowadzeniaPolaczone === 0 ? 'żadne nie prowadzi' : 'tylko jedno prowadzi';
    return (
      `rozdzielnica SN ma 2 pola liniowe, ale ${prowadzi} do innej stacji `
      + '(pole wolne albo zakończone wiszącym odcinkiem)'
    );
  }
  if (polaLiniowe === 0) return 'rozdzielnica SN nie ma pól liniowych';
  return `rozdzielnica SN ma ${liczbaPolLiniowychPl(polaLiniowe)}`;
}

/** Rodzaj z cech topologii (R1–R4) — funkcja czysta (lustro `rodzaj_z_topologii`). */
export function rodzajZTopologii(
  polaLiniowe: number,
  sprzeglo: boolean,
  wyprowadzeniaPolaczone: number,
): RodzajStacji {
  if (sprzeglo) return 'sectional';
  if (polaLiniowe >= 3) return 'branch';
  if (polaLiniowe === 2) return wyprowadzeniaPolaczone >= 2 ? 'inline' : 'terminal';
  return 'terminal';
}

function rolaRozpoznana(value: unknown): string | null {
  const rola = napis(value)?.toUpperCase() ?? null;
  return rola !== null && rola in KATEGORIA_ROLI_POLA ? rola : null;
}

/** Rola pola: `meta.field_role`, a gdy nierozpoznana — `bay_role` (`null`: nierozpoznana). */
export function rolaPolaStacji(pole: { readonly meta?: unknown; readonly bay_role?: unknown }): string | null {
  return rolaRozpoznana(rekord(pole.meta)?.field_role) ?? rolaRozpoznana(pole.bay_role);
}

/** Kategoria pola: z rodzaju pola katalogowego (`bay_kind`, także w `meta`), a gdy ten nie
 *  przesądza — z roli (lustro `kategoria_pola`). `null` — rola nierozpoznana. */
export function kategoriaPolaStacji(pole: {
  readonly meta?: unknown;
  readonly bay_role?: unknown;
  readonly bay_kind?: unknown;
}): KategoriaRoli | null {
  for (const rodzaj of [pole.bay_kind, rekord(pole.meta)?.bay_kind]) {
    const wartosc = napis(rodzaj)?.toLowerCase();
    if (wartosc !== undefined && wartosc in KATEGORIA_RODZAJU_POLA) return KATEGORIA_RODZAJU_POLA[wartosc];
  }
  const rola = rolaPolaStacji(pole);
  return rola === null ? null : KATEGORIA_ROLI_POLA[rola];
}

function polaStacji(stacja: StacjaDlaRodzaju, bays: readonly PoleDlaRodzaju[]): readonly PoleDlaRodzaju[] {
  const specyfikacje = lista(rekord(stacja.meta)?.field_specs)
    .map(rekord)
    .filter((spec): spec is Record<string, unknown> => spec !== null)
    .filter((spec) => Boolean(
      napis(spec.field_ref) || napis(spec.bus_ref) || lista(spec.equipment_refs).some((ref) => napis(ref)),
    ));
  if (specyfikacje.length > 0) return specyfikacje;
  const odnosniki = new Set([napis(stacja.ref_id), napis(stacja.id)].filter((r): r is string => r !== null));
  return bays.filter((bay) => {
    const ref = napis(bay.substation_ref);
    return ref !== null && odnosniki.has(ref);
  });
}

function wyprowadzeniaPolaczone(
  wlasne: ReadonlySet<string>,
  obce: ReadonlySet<string>,
  galezie: readonly GalazDlaRodzaju[],
): number {
  const sasiedzi = new Map<string, Set<string>>();
  for (const galaz of galezie) {
    const a = napis(galaz.from_bus_ref);
    const b = napis(galaz.to_bus_ref);
    if (!a || !b || a === b) continue;
    if (!sasiedzi.has(a)) sasiedzi.set(a, new Set());
    if (!sasiedzi.has(b)) sasiedzi.set(b, new Set());
    sasiedzi.get(a)!.add(b);
    sasiedzi.get(b)!.add(a);
  }
  const prowadziDoInnejStacji = (start: string): boolean => {
    const odwiedzone = new Set([start]);
    const doOdwiedzenia = [start];
    while (doOdwiedzenia.length > 0) {
      const szyna = doOdwiedzenia.pop()!;
      if (obce.has(szyna)) return true;
      for (const nastepna of sasiedzi.get(szyna) ?? []) {
        if (!odwiedzone.has(nastepna) && !wlasne.has(nastepna)) {
          odwiedzone.add(nastepna);
          doOdwiedzenia.push(nastepna);
        }
      }
    }
    return false;
  };
  let polaczone = 0;
  for (const galaz of galezie) {
    if (typeof galaz.type !== 'string' || !TYPY_ODCINKA_TERENOWEGO.has(galaz.type)) continue;
    const a = napis(galaz.from_bus_ref);
    const b = napis(galaz.to_bus_ref);
    if (a && wlasne.has(a) && b && !wlasne.has(b)) polaczone += prowadziDoInnejStacji(b) ? 1 : 0;
    else if (b && wlasne.has(b) && a && !wlasne.has(a)) polaczone += prowadziDoInnejStacji(a) ? 1 : 0;
  }
  return polaczone;
}

function obliczRodzajeStacji(model: ModelDlaRodzaju): ReadonlyMap<string, RodzajStacjiWynik> {
  const stacje = (model.substations ?? []).filter((s) => rekord(s) !== null);
  const galezie = (model.branches ?? []).filter((g) => rekord(g) !== null);
  const bays = (model.bays ?? []).filter((b) => rekord(b) !== null);
  const szyny = new Map<string, ReadonlySet<string>>();
  for (const stacja of stacje) {
    const ref = napis(stacja.ref_id);
    if (ref) szyny.set(ref, szynyStacji(stacja, galezie));
  }
  const wynik = new Map<string, RodzajStacjiWynik>();
  for (const stacja of stacje) {
    const ref = napis(stacja.ref_id);
    if (!ref || (typeof stacja.station_type === 'string' && TYPY_STACJI_BEZ_RODZAJU.has(stacja.station_type))) {
      continue;
    }
    let liniowe = 0;
    let sprzeglo = false;
    const nierozpoznane: string[] = [];
    for (const pole of polaStacji(stacja, bays)) {
      const kategoria = kategoriaPolaStacji(pole);
      if (kategoria === null) {
        const spec = pole as Record<string, unknown>;
        nierozpoznane.push(String(napis(spec.field_ref) ?? napis(spec.ref_id)));
        continue;
      }
      if (kategoria === 'liniowe') liniowe += 1;
      if (kategoria === 'sprzeglo') sprzeglo = true;
    }
    const wlasne = szyny.get(ref) ?? new Set<string>();
    const obce = new Set<string>();
    for (const [innaRef, inne] of szyny) {
      if (innaRef !== ref) for (const szyna of inne) obce.add(szyna);
    }
    const polaczone = liniowe === 2 && !sprzeglo ? wyprowadzeniaPolaczone(wlasne, obce, galezie) : 0;
    const rodzaj = rodzajZTopologii(liniowe, sprzeglo, polaczone);
    const deklaracja = jestRodzajemStacji(stacja.station_type) ? stacja.station_type : null;
    wynik.set(ref, {
      stationRef: ref,
      stationName: napis(stacja.name),
      rodzaj,
      polaLiniowe: liniowe,
      sprzeglo,
      wyprowadzeniaPolaczone: polaczone,
      deklaracja,
      zgodnyZDeklaracja: deklaracja === null || deklaracja === rodzaj,
      polaNierozpoznane: nierozpoznane,
      przyczynaPl: przyczynaRodzajuPl(rodzaj, liniowe, sprzeglo, polaczone),
    });
  }
  return new Map([...wynik.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Pamięć podręczna per migawka: klucz = tożsamość list stacji i gałęzi (migawki są niemutowalne). */
const PAMIEC = new WeakMap<object, WeakMap<object, WeakMap<object, ReadonlyMap<string, RodzajStacjiWynik>>>>();
const PUSTE: readonly never[] = [];

/** Rodzaj KAŻDEJ stacji modelu, której rodzaj dotyczy (klucz: `ref_id`) — lustro `rodzaje_stacji`. */
export function rodzajeStacji(model: ModelDlaRodzaju | null | undefined): ReadonlyMap<string, RodzajStacjiWynik> {
  if (!model) return new Map();
  const stacje = (model.substations ?? PUSTE) as object;
  const galezie = (model.branches ?? PUSTE) as object;
  const pola = (model.bays ?? PUSTE) as object;
  let poStacjach = PAMIEC.get(stacje);
  if (!poStacjach) PAMIEC.set(stacje, (poStacjach = new WeakMap()));
  let poGaleziach = poStacjach.get(galezie);
  if (!poGaleziach) poStacjach.set(galezie, (poGaleziach = new WeakMap()));
  let wynik = poGaleziach.get(pola);
  if (!wynik) poGaleziach.set(pola, (wynik = obliczRodzajeStacji(model)));
  return wynik;
}

/** Rodzaj jednej stacji (`null`: brak stacji albo rodzaj jej nie dotyczy — GPZ, rozdzielnica nN). */
export function rodzajStacji(
  model: ModelDlaRodzaju | null | undefined,
  stationRef: string | null | undefined,
): RodzajStacjiWynik | null {
  if (!stationRef) return null;
  const wszystkie = rodzajeStacji(model);
  const wprost = wszystkie.get(stationRef);
  if (wprost) return wprost;
  // Stacja wskazana przez `id` (część powierzchni trzyma identyfikator obiektu, nie `ref_id`).
  const stacja = (model?.substations ?? []).find((s) => napis(s.id) === stationRef);
  const ref = stacja ? napis(stacja.ref_id) : null;
  return ref ? wszystkie.get(ref) ?? null : null;
}

/** Rodzaj stacji ze SKŁADU pól (kreator, szablon) — ta sama reguła (lustro `rodzaj_ze_skladu_pol`). */
export function rodzajZeSkladuPol(role: readonly unknown[], polaczoneWyprowadzenia: number): RodzajStacji {
  let liniowe = 0;
  let sprzeglo = false;
  for (const wartosc of role) {
    const tekst = napis(wartosc)?.toLowerCase();
    const rola = rolaRozpoznana(wartosc);
    const kategoria = tekst !== undefined && tekst in KATEGORIA_RODZAJU_POLA
      ? KATEGORIA_RODZAJU_POLA[tekst]
      : rola !== null ? KATEGORIA_ROLI_POLA[rola] : null;
    if (kategoria === 'liniowe') liniowe += 1;
    if (kategoria === 'sprzeglo') sprzeglo = true;
  }
  return rodzajZTopologii(liniowe, sprzeglo, polaczoneWyprowadzenia);
}

// ---------------------------------------------------------------------------
// Podpisy rodzaju — słownik rodzaj → tekst (jedyne miejsce słów rodzaju we froncie)
// ---------------------------------------------------------------------------

/** „Stacja przelotowa". */
export function podpisRodzajuStacjiPl(rodzaj: RodzajStacji): string {
  return `Stacja ${NAZWA_RODZAJU_STACJI_PL[rodzaj]}`;
}

const SKROT_RODZAJU_PL: Readonly<Record<RodzajStacji, string>> = {
  terminal: 'Końc.',
  inline: 'Przelot.',
  branch: 'Odgał.',
  sectional: 'Sekcyj.',
};

/** „Przelot." — kolumna wąska (panel procesu). */
export function skrotRodzajuStacjiPl(rodzaj: RodzajStacji): string {
  return SKROT_RODZAJU_PL[rodzaj];
}

const UKLAD_RODZAJU_PL: Readonly<Record<RodzajStacji, string>> = {
  terminal: 'Układ końcowy SN',
  inline: 'Układ przelotowy SN',
  branch: 'Układ odgałęźny SN',
  sectional: 'Układ sekcyjny SN',
};

/** „Układ przelotowy SN" — układ rozdzielnicy SN wynikający z rodzaju. */
export function ukladRozdzielnicyPl(rodzaj: RodzajStacji): string {
  return UKLAD_RODZAJU_PL[rodzaj];
}

/**
 * Podpis stacji dowolnej funkcji: GPZ, rozdzielnica nN albo stacja SN/nN z rodzajem
 * wyprowadzonym z topologii. Stacja spoza modelu (brak w migawce) — „Stacja SN/nN" (funkcja
 * bez rodzaju; rodzaj bez danych modelu nie jest zgadywany).
 */
export function podpisStacjiPl(
  model: ModelDlaRodzaju | null | undefined,
  stacja: StacjaDlaRodzaju | null | undefined,
): string {
  if (!stacja) return 'Stacja SN/nN';
  if (stacja.station_type === 'gpz') return 'GPZ';
  if (stacja.station_type === 'rozdzielnica_nn') return 'Rozdzielnica nN';
  const wynik = rodzajStacji(model, napis(stacja.ref_id));
  return wynik ? podpisRodzajuStacjiPl(wynik.rodzaj) : 'Stacja SN/nN';
}

/**
 * Układ rozdzielnicy stacji: „Układ przelotowy SN" (z rodzaju wyprowadzonego) — a dla GPZ
 * i rozdzielnicy nN nazwa ich rozdzielni (rodzaj topologiczny ich nie dotyczy; dawniej
 * GPZ dostawał domyślny „Układ przelotowy SN").
 */
export function ukladRozdzielnicyStacjiPl(
  model: ModelDlaRodzaju | null | undefined,
  stacja: StacjaDlaRodzaju | null | undefined,
): string {
  if (stacja?.station_type === 'gpz') return 'Rozdzielnia SN GPZ';
  if (stacja?.station_type === 'rozdzielnica_nn') return 'Rozdzielnica nN';
  const wynik = stacja ? rodzajStacji(model, napis(stacja.ref_id)) : null;
  return wynik ? ukladRozdzielnicyPl(wynik.rodzaj) : 'Układ rozdzielnicy SN nieustalony — stacji brak w modelu';
}

/** Opis rozdzielnicy SN do szuflady: układ i przyczyna rodzaju (liczba pól, sprzęgło) — z danych
 *  stacji, bez wyliczania pól, których stacja nie ma (dawny opis z deklaracji wymieniał pola
 *  „typowe" dla rodzaju, np. pole transformatorowe w stacji bez niego). */
export function opisRozdzielnicyStacjiPl(
  model: ModelDlaRodzaju | null | undefined,
  stacja: StacjaDlaRodzaju | null | undefined,
): string {
  if (stacja?.station_type === 'gpz') return 'Rozdzielnia SN GPZ: sekcje szyn z polami liniowymi i zasilającymi.';
  if (stacja?.station_type === 'rozdzielnica_nn') return 'Rozdzielnica nN: sekcje szyn nN z odpływami.';
  const wynik = stacja ? rodzajStacji(model, napis(stacja.ref_id)) : null;
  if (!wynik) return 'Rozdzielnica SN: układ nieustalony — stacji brak w modelu.';
  return `Rozdzielnica SN: ${ukladRozdzielnicyPl(wynik.rodzaj).replace(/^Układ/, 'układ')} — ${wynik.przyczynaPl}.`;
}
