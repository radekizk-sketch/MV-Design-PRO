/**
 * KARTA W5-C — JEDNO lustro frontu reguł stanu łącznika (jedna prawda w modelu bazowym).
 *
 * Backend: `enm/stan_normalny.py`, `enm/topology.py::punkty_podzialu`,
 * `enm/operacje_lacznikow.py`. Dwa pojęcia, dwa pola gałęzi łącznikowej:
 *  - `status` — BIEŻĄCE POŁOŻENIE w modelu bazowym (jedyny stan czytany przez fizykę);
 *    zmieniają je wyłącznie operacje `open_switch` / `close_switch`;
 *  - `normal_state` — POZYCJA NORMALNA z projektu (`'open'` = punkt normalnie otwarty);
 *    `null`/brak = NIEZADEKLAROWANA (nigdy domysł „zamknięty"); punkt podziału ustawia
 *    wyłącznie `set_normal_open_point` (atomowo z zamknięciem poprzedniego punktu pierścienia).
 *
 * Dawne kopie stanu (`Corridor.no_point_ref`, `LineRun.nop_station_ref`,
 * `BranchPointSN.switch_state`) są skasowane — żaden czytelnik frontu nie składa stanu
 * łącznika z innego miejsca niż gałąź łącznika.
 *
 * Karta GPZ-H5 (wpis 7 koordynacji wątków, pkt 1): pozycja normalna „otwarty” NIE czyni
 * łącznika punktem podziału sieci. Rozstrzyga ROLA łącznika — `roleLacznikow` jest lustrem
 * `enm/topology.py::role_lacznikow` (parytet: `backend/schemas/role_lacznikow_parytet_v1.json`,
 * pytest + vitest). Łącznik szyn stacji (ŁS-110, ŁS-SN, sprzęgło nN) i łącznik pola
 * transformatorowego normalnie otwarte są podziałem wewnątrz rozdzielni. Karta
 * GPZ-H5-APARATURA: łącznik pola liniowego 110 kV (tor L1/L2 — szyna sekcji 110 kV ↔ zacisk
 * linii z równoważnikiem, lustro `tory_zasilania_sekcji_wn_gpz`) normalnie otwarty odstawia tor
 * zasilania — nie jest punktem podziału sieci ani kandydatem na punkt.
 */
import type { Branch, EnergyNetworkModel, FuseBranch, SwitchBranch } from '../../types/enm';
import { isFuseBranch, isSwitchBranch } from '../../types/enm';
import { pasmoNapieciowe, type Pasmo } from '../../ui2/model/pasmaNapieciowe';

export type PolozenieLacznika = 'closed' | 'open';

/** Łącznik z położeniem otwarty/zamknięty (także bezpiecznik) — `TYPY_LACZNIKOW_ENM`. */
export function czyLacznik(galaz: Branch | null | undefined): galaz is SwitchBranch | FuseBranch {
  return galaz != null && (isSwitchBranch(galaz) || isFuseBranch(galaz));
}

/** Łącznik z POZYCJĄ NORMALNĄ (bez bezpiecznika) — `TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM`. */
export function czyLacznikZPozycjaNormalna(
  galaz: Branch | null | undefined,
): galaz is SwitchBranch {
  return galaz != null && isSwitchBranch(galaz);
}

/** Pozycja normalna łącznika; `null` = niezadeklarowana albo bezpiecznik. */
export function pozycjaNormalna(galaz: Branch | null | undefined): PolozenieLacznika | null {
  if (!czyLacznikZPozycjaNormalna(galaz)) return null;
  return galaz.normal_state === 'open' || galaz.normal_state === 'closed' ? galaz.normal_state : null;
}

/** Rola łącznika z pozycją normalną — te same wartości co stałe `ROLA_*` backendu. */
export type RolaLacznika =
  | 'LACZNIK_SZYN_WN'
  | 'LACZNIK_SZYN_SN'
  | 'LACZNIK_SZYN_NN'
  | 'LACZNIK_POLA_TRANSFORMATOROWEGO'
  | 'LACZNIK_POLA_ZASILAJACEGO_WN'
  | 'PUNKT_PODZIALU';

/** Migawka wystarczająca do wyprowadzenia ról (kolekcje opcjonalne poza gałęziami). */
export type MigawkaRolLacznikow = Pick<EnergyNetworkModel, 'branches'> &
  Partial<Pick<EnergyNetworkModel, 'buses' | 'substations' | 'transformers' | 'sources'>>;

const ROLA_WG_PASMA: Readonly<Record<Pasmo, RolaLacznika>> = {
  WN: 'LACZNIK_SZYN_WN',
  SN: 'LACZNIK_SZYN_SN',
  nN: 'LACZNIK_SZYN_NN',
};

/** Role łączników szyn stacji — podział wewnątrz rozdzielni, nie punkt podziału sieci. */
export const ROLE_LACZNIKOW_SZYN: ReadonlySet<RolaLacznika> = new Set<RolaLacznika>([
  'LACZNIK_SZYN_WN',
  'LACZNIK_SZYN_SN',
  'LACZNIK_SZYN_NN',
]);

/**
 * Szyna → zbiór stacji (lustro `stacje_szyn_rozdzielni`): `Substation.bus_refs` oraz szyny sekcji
 * z rejestrów `gpz_hv_sections`, `gpz_sections`, `nn_sections`.
 */
function szynyStacji(snapshot: MigawkaRolLacznikow): Map<string, Set<string>> {
  const wynik = new Map<string, Set<string>>();
  for (const stacja of snapshot.substations ?? []) {
    const szyny = new Set<string>((stacja.bus_refs ?? []).filter((b) => Boolean(b)));
    for (const rejestr of [stacja.gpz_hv_sections, stacja.gpz_sections, stacja.nn_sections]) {
      for (const sekcja of rejestr ?? []) {
        if (sekcja.bus_ref) szyny.add(sekcja.bus_ref);
      }
    }
    for (const szyna of szyny) {
      const stacje = wynik.get(szyna) ?? new Set<string>();
      stacje.add(stacja.ref_id);
      wynik.set(szyna, stacje);
    }
  }
  return wynik;
}

/** Szyny sekcji GPZ z jawnego rejestru stacji `station_type === 'gpz'` — lustro
 *  `szyny_sekcji_gpz` (`gpz_sections`, SN) i `szyny_sekcji_wn_gpz` (`gpz_hv_sections`, 110 kV). */
function szynySekcjiGpz(
  snapshot: MigawkaRolLacznikow,
  rejestr: 'gpz_sections' | 'gpz_hv_sections',
): Set<string> {
  const wynik = new Set<string>();
  for (const stacja of snapshot.substations ?? []) {
    if (stacja.station_type !== 'gpz') continue;
    for (const sekcja of stacja[rejestr] ?? []) {
      if (sekcja.bus_ref) wynik.add(sekcja.bus_ref);
    }
  }
  return wynik;
}

/** Droga „zacisk pola → sekcja”: łącznik i szyna sekcji po jego drugiej stronie. */
interface DrogaZaciskuDoSekcji {
  readonly lacznikRef: string;
  readonly szynaSekcji: string;
}

/**
 * Zacisk pola → drogi do sekcji — lustro `enm/topology.py::_laczniki_zaciskow_pol`: łączniki
 * (`TYPY_LACZNIKOW_ENM`) między szyną sekcji a szyną spoza rejestru sekcji, NIEZALEŻNIE od
 * położenia, w kolejności `ref_id` łącznika. Jedno źródło drogi dla strony SN transformatora
 * 110/SN (`sekcjeSnTransformatorowGpz`) i torów zasilania 110 kV (`toryZasilaniaSekcjiWnGpz`).
 */
function lacznikiZaciskowPol(
  snapshot: MigawkaRolLacznikow,
  szynySekcji: ReadonlySet<string>,
): Map<string, DrogaZaciskuDoSekcji[]> {
  const wynik = new Map<string, DrogaZaciskuDoSekcji[]>();
  const galezie = [...(snapshot.branches ?? [])].sort((x, y) =>
    x.ref_id < y.ref_id ? -1 : x.ref_id > y.ref_id ? 1 : 0,
  );
  for (const galaz of galezie) {
    if (!czyLacznik(galaz)) continue;
    const a = galaz.from_bus_ref;
    const b = galaz.to_bus_ref;
    for (const [zacisk, sekcja] of [[a, b], [b, a]] as const) {
      if (szynySekcji.has(sekcja) && !szynySekcji.has(zacisk)) {
        const drogi = wynik.get(zacisk) ?? [];
        drogi.push({ lacznikRef: galaz.ref_id, szynaSekcji: sekcja });
        wynik.set(zacisk, drogi);
      }
    }
  }
  return wynik;
}

/** Sekcja SN, na którą pracuje transformator 110/SN GPZ, i łącznik pola SN między nimi
 *  (`null` = strona dolna wprost na szynie sekcji). */
export interface SekcjaSnTransformatoraGpz {
  readonly szynaSekcji: string;
  readonly wylacznikRef: string | null;
}

/**
 * `ref_id` transformatora → sekcja SN GPZ, którą zasila — lustro
 * `enm/topology.py::sekcje_sn_transformatorow_gpz` (karta GPZ-H5, gniazdo „W” pola
 * transformatorowego SN): strona dolna na szynie sekcji — sekcja wprost; strona dolna na
 * zacisku pola — sekcja po drugiej stronie łącznika zacisku (pierwszy wg `ref_id`),
 * NIEZALEŻNIE od jego położenia. Transformator bez żadnej z tych dróg nie ma wpisu.
 * Parytet: `backend/schemas/role_lacznikow_parytet_v1.json` (`sekcje_sn_transformatorow`).
 */
export function sekcjeSnTransformatorowGpz(
  snapshot: MigawkaRolLacznikow | null | undefined,
): ReadonlyMap<string, SekcjaSnTransformatoraGpz> {
  const wynik = new Map<string, SekcjaSnTransformatoraGpz>();
  if (!snapshot) return wynik;
  const szynySekcji = szynySekcjiGpz(snapshot, 'gpz_sections');
  const drogi = lacznikiZaciskowPol(snapshot, szynySekcji);
  const trafa = [...(snapshot.transformers ?? [])].sort((x, y) =>
    x.ref_id < y.ref_id ? -1 : x.ref_id > y.ref_id ? 1 : 0,
  );
  for (const trafo of trafa) {
    const dolna = trafo.lv_bus_ref;
    if (szynySekcji.has(dolna)) {
      wynik.set(trafo.ref_id, { szynaSekcji: dolna, wylacznikRef: null });
      continue;
    }
    const droga = drogi.get(dolna)?.[0];
    if (droga) wynik.set(trafo.ref_id, { szynaSekcji: droga.szynaSekcji, wylacznikRef: droga.lacznikRef });
  }
  return wynik;
}

/** Tor zasilania sekcji 110 kV GPZ: równoważnik linii i łącznik pola liniowego
 *  (`null` = źródło wprost na szynie sekcji). */
export interface TorZasilaniaSekcjiWnGpz {
  readonly zrodloRef: string;
  readonly wylacznikRef: string | null;
}

/**
 * Szyna sekcji 110 kV GPZ → tory zasilania — lustro
 * `enm/topology.py::tory_zasilania_sekcji_wn_gpz`: źródło na szynie sekcji — tor wprost;
 * źródło na zacisku pola — tor przez łącznik zacisku (ta sama droga co strona SN
 * transformatora), NIEZALEŻNIE od położenia. Kolejność: szyna sekcji, w niej `ref_id` źródła.
 * Parytet: `backend/schemas/role_lacznikow_parytet_v1.json` (`tory_zasilania_wn`).
 */
export function toryZasilaniaSekcjiWnGpz(
  snapshot: MigawkaRolLacznikow | null | undefined,
): ReadonlyMap<string, readonly TorZasilaniaSekcjiWnGpz[]> {
  const wynik = new Map<string, TorZasilaniaSekcjiWnGpz[]>();
  if (!snapshot) return wynik;
  const szynySekcji = szynySekcjiGpz(snapshot, 'gpz_hv_sections');
  const drogi = lacznikiZaciskowPol(snapshot, szynySekcji);
  const zrodla = [...(snapshot.sources ?? [])].sort((x, y) =>
    x.ref_id < y.ref_id ? -1 : x.ref_id > y.ref_id ? 1 : 0,
  );
  const dopisz = (szyna: string, tor: TorZasilaniaSekcjiWnGpz): void => {
    const tory = wynik.get(szyna) ?? [];
    tory.push(tor);
    wynik.set(szyna, tory);
  };
  for (const zrodlo of zrodla) {
    const szyna = zrodlo.bus_ref;
    if (szynySekcji.has(szyna)) {
      dopisz(szyna, { zrodloRef: zrodlo.ref_id, wylacznikRef: null });
      continue;
    }
    const droga = drogi.get(szyna)?.[0];
    if (droga) dopisz(droga.szynaSekcji, { zrodloRef: zrodlo.ref_id, wylacznikRef: droga.lacznikRef });
  }
  return new Map([...wynik].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Łączniki pól liniowych 110 kV — łączniki torów zasilania z `toryZasilaniaSekcjiWnGpz`
 *  (jedno źródło drogi; źródło wprost na szynie sekcji nie ma łącznika toru). */
function lacznikiTorowZasilaniaWn(snapshot: MigawkaRolLacznikow): Set<string> {
  const wynik = new Set<string>();
  for (const tory of toryZasilaniaSekcjiWnGpz(snapshot).values()) {
    for (const tor of tory) if (tor.wylacznikRef !== null) wynik.add(tor.wylacznikRef);
  }
  return wynik;
}

function wspolneStacje(a: Set<string> | undefined, b: Set<string> | undefined): string[] {
  if (!a || !b) return [];
  return [...a].filter((stacja) => b.has(stacja));
}

/**
 * Rola każdego łącznika z pozycją normalną (`ref_id` → rola) — lustro
 * `enm/topology.py::role_lacznikow`, ta sama reguła i ta sama kolejność rozstrzygania:
 * oba końce szynami tej samej stacji → łącznik szyn (pasmo napięcia szyny: WN / SN / nN),
 * przy czym łącznik szyn SN tylko w stacji zasilającej (`station_type === 'gpz'`) — sprzęgło
 * stacji SN w magistrali leży w torze prądowym magistrali i normalnie otwarte jest punktem
 * podziału pierścienia; szyna stacji ↔ zacisk transformatora tej stacji spoza jej szyn → łącznik pola
 * transformatorowego; łącznik toru zasilania sekcji 110 kV → łącznik pola liniowego 110 kV;
 * inny łącznik z `normal_state === 'open'` → punkt podziału; pozostałe
 * bez roli. Rola nie zależy od bieżącego położenia (`status`).
 */
export function roleLacznikow(
  snapshot: MigawkaRolLacznikow | null | undefined,
): ReadonlyMap<string, RolaLacznika> {
  const wynik = new Map<string, RolaLacznika>();
  if (!snapshot) return wynik;
  const stacjeSzyn = szynyStacji(snapshot);
  const stacjeGpz = new Set(
    (snapshot.substations ?? []).filter((st) => st.station_type === 'gpz').map((st) => st.ref_id),
  );
  const trafa = new Map((snapshot.transformers ?? []).map((t) => [t.ref_id, t] as const));
  const zaciskiPolTr = new Set<string>();
  for (const stacja of snapshot.substations ?? []) {
    const szyny = new Set<string>(stacja.bus_refs ?? []);
    for (const refTr of stacja.transformer_refs ?? []) {
      const trafo = trafa.get(refTr);
      if (!trafo) continue;
      for (const koniec of [trafo.hv_bus_ref, trafo.lv_bus_ref]) {
        if (!koniec || szyny.has(koniec)) continue;
        for (const szyna of szyny) zaciskiPolTr.add(`${szyna}\u0000${koniec}`);
      }
    }
  }
  const lacznikiTorowWn = lacznikiTorowZasilaniaWn(snapshot);
  const napiecie = new Map((snapshot.buses ?? []).map((b) => [b.ref_id, b.voltage_kv] as const));
  const galezie = [...(snapshot.branches ?? [])].sort((x, y) =>
    x.ref_id < y.ref_id ? -1 : x.ref_id > y.ref_id ? 1 : 0,
  );
  for (const galaz of galezie) {
    if (!isSwitchBranch(galaz)) continue;
    const a = galaz.from_bus_ref;
    const b = galaz.to_bus_ref;
    const wspolne = wspolneStacje(stacjeSzyn.get(a), stacjeSzyn.get(b));
    if (wspolne.length > 0) {
      const u = napiecie.get(a);
      const pasmo = typeof u === 'number' ? pasmoNapieciowe(u) : null;
      if (pasmo !== null && (pasmo !== 'SN' || wspolne.some((st) => stacjeGpz.has(st)))) {
        wynik.set(galaz.ref_id, ROLA_WG_PASMA[pasmo]);
        continue;
      }
    }
    if (zaciskiPolTr.has(`${a}\u0000${b}`) || zaciskiPolTr.has(`${b}\u0000${a}`)) {
      wynik.set(galaz.ref_id, 'LACZNIK_POLA_TRANSFORMATOROWEGO');
      continue;
    }
    if (lacznikiTorowWn.has(galaz.ref_id)) {
      wynik.set(galaz.ref_id, 'LACZNIK_POLA_ZASILAJACEGO_WN');
      continue;
    }
    if (galaz.normal_state === 'open') wynik.set(galaz.ref_id, 'PUNKT_PODZIALU');
  }
  return wynik;
}

/** Rola łącznika w migawce (`null` = zwykły łącznik toru albo element spoza łączników). */
export function rolaLacznika(
  snapshot: MigawkaRolLacznikow | null | undefined,
  galaz: Branch | null | undefined,
): RolaLacznika | null {
  if (!galaz) return null;
  return roleLacznikow(snapshot).get(galaz.ref_id) ?? null;
}

/** Czy łącznik jest punktem podziału sieci — rola `PUNKT_PODZIALU` z `roleLacznikow`. */
export function czyPunktPodzialu(
  snapshot: MigawkaRolLacznikow | null | undefined,
  galaz: Branch | null | undefined,
): boolean {
  return rolaLacznika(snapshot, galaz) === 'PUNKT_PODZIALU';
}

/**
 * Położenie łącznika słownie — JEDNO źródło słownictwa stanu łącznika dla wszystkich
 * miejsc, które je wypisują (podpis łącznika szyn na kanwie, inspektor aparatu, karta
 * techniczna, widok inżynierski, przegląd łączników). Karta GPZ-H5-SLD etap 2 (poprawka
 * koordynatora): cztery kopie tego słownika żyły osobno, a jedna z nich (widok inżynierski)
 * wypisywała „otwarty" dla łącznika bez stanu w modelu.
 */
export const POLOZENIE_LACZNIKA_PL: Readonly<Record<PolozenieLacznika | 'unknown', string>> = {
  closed: 'zamknięty',
  open: 'otwarty',
  unknown: 'nieustalony (model niejednoznaczny)',
};
/** Łącznik bez stanu w modelu — nazwane wprost, nigdy domysł „otwarty"/„zamknięty". */
export const BRAK_POLOZENIA_W_MODELU = 'brak stanu w modelu';

function rozpoznaneStatus(status: string | null | undefined): PolozenieLacznika | 'unknown' | null {
  const s = typeof status === 'string' ? status.toLowerCase() : null;
  return s === 'open' || s === 'closed' || s === 'unknown' ? s : null;
}

/** Położenie otwarty/zamknięty z pola `status`; `null` = nieustalone albo brak stanu. */
function znanePolozenie(status: string | null | undefined): PolozenieLacznika | null {
  const s = rozpoznaneStatus(status);
  return s === 'unknown' ? null : s;
}

/** Położenie słownie z pola `status` (także wartości wielkimi literami z przeglądów). */
export function polozenieSlownie(status: string | null | undefined): string {
  const s = rozpoznaneStatus(status);
  return s === null ? BRAK_POLOZENIA_W_MODELU : POLOZENIE_LACZNIKA_PL[s];
}

function wielkaLitera(tekst: string): string {
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

export const ETYKIETA_POLOZENIA_PL: Readonly<Record<PolozenieLacznika, string>> = {
  closed: wielkaLitera(POLOZENIE_LACZNIKA_PL.closed),
  open: wielkaLitera(POLOZENIE_LACZNIKA_PL.open),
};

/** Etykieta bieżącego położenia (pole `status` gałęzi). */
export function etykietaPolozenia(status: string | null | undefined): string {
  return status === 'open' || status === 'closed' ? ETYKIETA_POLOZENIA_PL[status] : '—';
}

/** Co znaczy normalnie otwarty łącznik danej roli (bez roli = punkt podziału). */
const ZNACZENIE_OTWARCIA_PL: Readonly<Record<RolaLacznika, string>> = {
  PUNKT_PODZIALU: 'punkt podziału',
  LACZNIK_SZYN_WN: 'łącznik szyn 110 kV, sekcje pracują osobno',
  LACZNIK_SZYN_SN: 'łącznik szyn SN, sekcje pracują osobno',
  LACZNIK_SZYN_NN: 'łącznik szyn nN, sekcje pracują osobno',
  LACZNIK_POLA_TRANSFORMATOROWEGO: 'pole transformatora odstawione',
  LACZNIK_POLA_ZASILAJACEGO_WN: 'tor zasilania 110 kV odstawiony',
};

/**
 * Etykieta pozycji normalnej — brak deklaracji nazwany wprost, bez domysłu. Pozycję
 * „otwarty” opisuje ROLA łącznika (`rolaLacznika`), nie samo pole `normal_state`.
 */
export function etykietaPozycjiNormalnej(
  pozycja: PolozenieLacznika | null,
  rola: RolaLacznika | null,
): string {
  if (pozycja === 'open') return `Normalnie otwarty (${ZNACZENIE_OTWARCIA_PL[rola ?? 'PUNKT_PODZIALU']})`;
  if (pozycja === 'closed') return 'Normalnie zamknięty';
  return 'Niezadeklarowana';
}

/** Podpis łącznika szyn: wiersz główny i — wyłącznie przy odstępstwie — wiersz drugorzędny. */
export interface TekstStanuLacznikaSzyn {
  /** „⟨oznaczenie⟩ · ⟨stan rzeczywisty słownie⟩" — stan rzeczywisty zawsze w pierwszym planie. */
  readonly glowny: string;
  /** Wiersze drugorzędne [„normalnie ⟨pozycja⟩", „(odstępstwo)"], gdy stan rzeczywisty ≠
   *  pozycja normalna; inaczej `null`. */
  readonly odstepstwo: readonly [string, string] | null;
}

/**
 * Karta GPZ-H5-SLD etap 2 (poprawka P0 wg werdyktu właściciela „oznaczenie stanu
 * normalnego nie może zastępować stanu rzeczywistego"): podpis łącznika szyn niesie STAN
 * RZECZYWISTY słownie; pozycja normalna pojawia się drugorzędnie i tylko przy odstępstwie.
 * Dawny podpis „ŁS 110 kV 1-2 · NO" przy zamkniętym łączniku czytał się jak stan otwarty.
 * Stan nieznany albo pozycja niezadeklarowana = brak wiersza odstępstwa (zero domysłu).
 */
export function tekstStanuLacznikaSzyn(
  oznaczenie: string,
  stan: string | null | undefined,
  pozycja: PolozenieLacznika | null | undefined,
): TekstStanuLacznikaSzyn {
  // Jedno rozpoznanie stanu dla OBU wierszy (predykat parami z `polozenieSlownie`).
  const s = znanePolozenie(stan);
  const glowny = `${oznaczenie} · ${polozenieSlownie(stan)}`;
  const odstepstwo: readonly [string, string] | null =
    s !== null && pozycja != null && s !== pozycja ? [`normalnie ${POLOZENIE_LACZNIKA_PL[pozycja]}`, '(odstępstwo)'] : null;
  return { glowny, odstepstwo };
}

/** Punkty podziału sieci (po `ref_id`) — lustro `enm.topology.punkty_podzialu` (rola). */
export function punktyPodzialu(snapshot: MigawkaRolLacznikow | null | undefined): SwitchBranch[] {
  const role = roleLacznikow(snapshot);
  return (snapshot?.branches ?? [])
    .filter(
      (galaz): galaz is SwitchBranch =>
        isSwitchBranch(galaz) && role.get(galaz.ref_id) === 'PUNKT_PODZIALU',
    )
    .sort((a, b) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0));
}

/**
 * Kandydaci na nowy punkt podziału: łączniki z pozycją normalną, które nim jeszcze nie są
 * i nie są łącznikiem szyn stacji ani łącznikiem pola transformatorowego — ich stan
 * normalny jest wejściem stacji (np. operacji tworzenia GPZ), nie punktem pierścienia.
 */
export function kandydaciNaPunktPodzialu(
  snapshot: MigawkaRolLacznikow | null | undefined,
): SwitchBranch[] {
  const role = roleLacznikow(snapshot);
  return (snapshot?.branches ?? [])
    .filter((galaz): galaz is SwitchBranch => isSwitchBranch(galaz) && !role.has(galaz.ref_id))
    .sort((a, b) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0));
}

/**
 * Łączniki portów punktu rozgałęzienia (ZKSN, słup) — gałęzie z
 * `meta.branch_point_ref` punktu; kolejność po porcie, potem po `ref_id`. Stan łącznika
 * portu żyje WYŁĄCZNIE na tej gałęzi (dawna kopia `BranchPointSN.switch_state` skasowana).
 */
export function lacznikiPortowPunktu(
  snapshot: Pick<EnergyNetworkModel, 'branches'> | null | undefined,
  punktRef: string,
): Array<SwitchBranch | FuseBranch> {
  const port = (galaz: Branch): string => {
    const wartosc = galaz.meta?.port_id;
    return typeof wartosc === 'string' ? wartosc : '';
  };
  return (snapshot?.branches ?? [])
    .filter(
      (galaz): galaz is SwitchBranch | FuseBranch =>
        czyLacznik(galaz) && galaz.meta?.branch_point_ref === punktRef,
    )
    .sort((a, b) => {
      const pa = port(a);
      const pb = port(b);
      if (pa !== pb) return pa < pb ? -1 : 1;
      return a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0;
    });
}

/** Opis stanu łącznika: położenie i pozycja normalna (np. „Otwarty · normalnie zamknięty"). */
export function opisStanuLacznika(
  snapshot: MigawkaRolLacznikow | null | undefined,
  galaz: SwitchBranch | FuseBranch,
): string {
  const polozenie = etykietaPolozenia(galaz.status);
  if (!czyLacznikZPozycjaNormalna(galaz)) return polozenie;
  const pozycja = etykietaPozycjiNormalnej(pozycjaNormalna(galaz), rolaLacznika(snapshot, galaz));
  return `${polozenie} · pozycja normalna: ${pozycja.toLowerCase()}`;
}

/**
 * Stan łączników portów punktu rozgałęzienia jednym zdaniem — z gałęzi, nigdy z domysłu.
 * Punkt bez łączników portów: „Brak łączników portów w modelu".
 */
export function opisLacznikowPortow(
  snapshot: Pick<EnergyNetworkModel, 'branches'> | null | undefined,
  punktRef: string,
): string {
  const laczniki = lacznikiPortowPunktu(snapshot, punktRef);
  if (laczniki.length === 0) return 'Brak łączników portów w modelu';
  return laczniki.map((galaz) => `${galaz.name}: ${opisStanuLacznika(snapshot, galaz)}`).join('; ');
}

/** Łącznik wskazany przez obiekt rysunku albo powód, dla którego go nie ma. */
export type LacznikTematu =
  | { readonly lacznik: SwitchBranch | FuseBranch; readonly powodPl?: undefined }
  | { readonly lacznik: null; readonly powodPl: string };

/**
 * Łącznik, którego dotyczy akcja stanu (otwórz / zamknij / punkt podziału) dla obiektu
 * rysunku: gałąź łącznikowa wprost albo JEDYNY łącznik pola (`Bay.equipment_refs`;
 * aparat z kompozytem `⟨pole⟩#⟨rodzaj⟩` wskazuje pole). Pole z kilkoma łącznikami nie
 * daje wyboru za projektanta — powód nazywa łączniki do wskazania.
 */
export function lacznikTematu(
  snapshot: Pick<EnergyNetworkModel, 'branches' | 'bays'> | null | undefined,
  ref: string | null | undefined,
): LacznikTematu {
  if (!snapshot || !ref) {
    return { lacznik: null, powodPl: 'Nie wskazano łącznika — zaznacz łącznik na schemacie.' };
  }
  const galezie = snapshot.branches ?? [];
  const galaz = galezie.find((b) => b.ref_id === ref || b.id === ref) ?? null;
  if (galaz) {
    return czyLacznik(galaz)
      ? { lacznik: galaz }
      : {
          lacznik: null,
          powodPl:
            'Element nie jest łącznikiem — stan otwarty albo zamknięty mają wyłącznie łączniki i bezpieczniki.',
        };
  }
  const znacznik = ref.lastIndexOf('#');
  const refPola = znacznik > 0 ? ref.slice(0, znacznik) : ref;
  const pole = (snapshot.bays ?? []).find((b) => b.ref_id === refPola || b.id === refPola) ?? null;
  if (!pole) {
    return { lacznik: null, powodPl: 'Wskazany obiekt nie jest łącznikiem modelu sieci.' };
  }
  const laczniki = (pole.equipment_refs ?? [])
    .map((r) => galezie.find((b) => b.ref_id === r) ?? null)
    .filter((b): b is SwitchBranch | FuseBranch => czyLacznik(b));
  if (laczniki.length === 1) return { lacznik: laczniki[0] };
  if (laczniki.length === 0) {
    return { lacznik: null, powodPl: 'Pole nie ma łącznika w modelu sieci.' };
  }
  return {
    lacznik: null,
    powodPl: `Pole ma kilka łączników (${laczniki.map((b) => b.name).join(', ')}) — wskaż łącznik na schemacie albo w karcie pola.`,
  };
}
