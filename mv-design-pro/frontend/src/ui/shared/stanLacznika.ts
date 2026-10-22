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
 */
import type { Branch, EnergyNetworkModel, FuseBranch, SwitchBranch } from '../../types/enm';
import { isFuseBranch, isSwitchBranch } from '../../types/enm';

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

/** Czy łącznik jest punktem normalnie otwartym (wyłącznie z `normal_state`). */
export function czyPunktPodzialu(galaz: Branch | null | undefined): boolean {
  return pozycjaNormalna(galaz) === 'open';
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

/** Etykieta pozycji normalnej — brak deklaracji nazwany wprost, bez domysłu. */
export function etykietaPozycjiNormalnej(pozycja: PolozenieLacznika | null): string {
  if (pozycja === 'open') return 'Normalnie otwarty (punkt podziału)';
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

/** Punkty normalnie otwarte modelu (po `ref_id`) — lustro `enm.topology.punkty_podzialu`. */
export function punktyPodzialu(
  snapshot: Pick<EnergyNetworkModel, 'branches'> | null | undefined,
): SwitchBranch[] {
  return (snapshot?.branches ?? [])
    .filter((galaz): galaz is SwitchBranch => czyPunktPodzialu(galaz))
    .sort((a, b) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0));
}

/** Kandydaci na nowy punkt podziału: łączniki z pozycją normalną, które nim jeszcze nie są. */
export function kandydaciNaPunktPodzialu(
  snapshot: Pick<EnergyNetworkModel, 'branches'> | null | undefined,
): SwitchBranch[] {
  return (snapshot?.branches ?? [])
    .filter(
      (galaz): galaz is SwitchBranch => czyLacznikZPozycjaNormalna(galaz) && !czyPunktPodzialu(galaz),
    )
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
export function opisStanuLacznika(galaz: SwitchBranch | FuseBranch): string {
  const polozenie = etykietaPolozenia(galaz.status);
  if (!czyLacznikZPozycjaNormalna(galaz)) return polozenie;
  return `${polozenie} · pozycja normalna: ${etykietaPozycjiNormalnej(pozycjaNormalna(galaz)).toLowerCase()}`;
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
  return laczniki.map((galaz) => `${galaz.name}: ${opisStanuLacznika(galaz)}`).join('; ');
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
