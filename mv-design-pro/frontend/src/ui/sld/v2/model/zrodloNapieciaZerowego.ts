/**
 * Źródło napięcia zerowego 3U₀ funkcji 67N pola SN — lustro reguły backendu na schemacie SLD
 * (karta UX-04/POLE-LINIOWE-WZORZEC, decyzja właściciela 2026-10-29 pkt 4).
 *
 * Reguła jest JEDNA: `backend/src/enm/zrodlo_napiecia_zerowego.py::zrodlo_u0_pola` (przypisanie
 * 67N przez szablon pola, odmowa operacji, ocena pola liniowego `NIE_OCENIONO`, walidator W064).
 * Schemat czyta migawkę modelu, nie model odczytu pól, więc rozstrzyga ten sam warunek tutaj —
 * równość wyniku dla iloczynu przypadków pilnuje parytet
 * (`backend/tests/ci/test_parytet_zrodla_u0.py` generuje fiksturę z wyniku backendu,
 * `__tests__/zrodloNapieciaZerowego.parytet.test.ts` porównuje). Schemat używa wyniku do dwóch
 * rzeczy: dyskretnego odniesienia „3U₀ ← przekładnik pola pomiaru napięcia" przy przekaźniku
 * (rysunek ENEA Z.10/Z.11.1: obwód okrężny „Z, Zz" z pola Z.17 — odniesienie, nie przewód przez
 * rozdzielnicę) i ostrzeżenia topologicznego funkcji 67N bez potwierdzonego źródła.
 *
 * Warunek (oba składniki): przekładnik Ferrantiego (`CORE_BALANCE_CT`) w polu ORAZ
 * `Bay.zrodlo_u0_ref` wskazujący przekładnik napięciowy (`VT`) z uzwojeniem otwartego trójkąta
 * w tym samym polu albo w polu pomiaru napięcia szyn (`MEASUREMENT` + `NAPIECIA_SZYN`) na tej
 * samej szynie. Pole pomiaru napięcia w sekcji bez powiązania NIE jest potwierdzeniem.
 */
import type { Bay, BayPrimaryDevice, EnergyNetworkModel } from '../../../../types/enm';
import type { UzwojeniePrzekladnikaNapieciowego } from '../../../../types/przekladniki';

/** Kod maszynowy braku warunku — lustro `KodBrakuZrodlaU0` backendu (ta sama kolejność braków:
 *  najpierw kryterium prądowe I0, potem składnik napięciowy U0). */
export type KodBrakuZrodlaU0 =
  | 'BRAK_FERRANTIEGO'
  | 'BRAK_POWIAZANIA'
  | 'BRAK_POLA_POMIARU_NAPIECIA'
  | 'APARAT_NIEOBECNY'
  | 'APARAT_NIE_JEST_VT'
  | 'BRAK_OTWARTEGO_TROJKATA'
  | 'POLE_NIE_MIERZY_SZYN'
  | 'INNA_SEKCJA';

/** Funkcje EAZ, których warunkiem jest źródło 3U₀ — lustro kluczy
 *  `bay_templates.WARUNKI_FUNKCJI_EAZ` o warunku `ZRODLO_U0` (parytet przypina równość). */
export const FUNKCJE_WYMAGAJACE_ZRODLA_U0: readonly string[] = ['67N'];

/** Rodzaj aparatu przekładnika Ferrantiego (lustro `RODZAJ_PRZEKLADNIKA_FERRANTIEGO`). */
const RODZAJ_FERRANTIEGO = 'CORE_BALANCE_CT';
const RODZAJ_VT = 'VT';
/** Funkcja pola pomiarowego „pomiar napięcia szyn" (lustro `FUNKCJA_POMIARU_NAPIECIA_SZYN`). */
export const FUNKCJA_POMIARU_NAPIECIA_SZYN = 'NAPIECIA_SZYN';

/** Rozstrzygnięcie warunku 67N jednego pola na schemacie. */
export interface ZrodloU0PolaView {
  readonly potwierdzone: boolean;
  /** `BayPrimaryDevice.device_ref` przekładnika źródła (gdy powiązanie wskazuje poprawne
   *  źródło), inaczej `null`. */
  readonly vtRef: string | null;
  /** Oznaczenie przekładnika źródła (`designation`, a bez niego słowa rodzaju
   *  `OZNACZENIE_VT_BEZ_OZNACZENIA` — nigdy identyfikator aparatu, jak backend `_oznaczenie_aparatu`). */
  readonly vtOznaczenie: string | null;
  /** `Bay.ref_id` pola źródła. */
  readonly poleZrodlaRef: string | null;
  /** Oznaczenie pola źródła na schemacie (`bay_number`, a bez niego nazwa, a bez niej
   *  `OZNACZENIE_POLA_BEZ_NUMERU` — nigdy identyfikator pola). */
  readonly poleZrodlaOznaczenie: string | null;
  /** Braki warunku kodem maszynowym (puste, gdy potwierdzone). */
  readonly kodyBrakow: readonly KodBrakuZrodlaU0[];
}

type PoleZrodla = Pick<
  Bay,
  'ref_id' | 'bus_ref' | 'bay_role' | 'funkcja_pomiaru' | 'primary_devices' | 'bay_number' | 'name'
>;

function aparaty(pole: Pick<Bay, 'primary_devices'>): readonly BayPrimaryDevice[] {
  return pole.primary_devices ?? [];
}

function uzwojenieOtwartegoTrojkata(aparat: BayPrimaryDevice): UzwojeniePrzekladnikaNapieciowego | undefined {
  return (aparat.uzwojenia ?? []).find((u) => u.otwarty_trojkat === true);
}

function czyPolePomiaruNapieciaSzyn(pole: PoleZrodla): boolean {
  return pole.bay_role === 'MEASUREMENT' && pole.funkcja_pomiaru === FUNKCJA_POMIARU_NAPIECIA_SZYN;
}

/** Tekst zastępczy oznaczeń w odniesieniu źródła 3U₀ na schemacie, gdy model nie niesie
 *  oznaczenia: identyfikator maszynowy nie jest nazwą dla projektanta (reguła
 *  `scripts/nazwa_bez_identyfikatora_guard.py` backendu; lustro `_oznaczenie_aparatu`). */
export const OZNACZENIE_VT_BEZ_OZNACZENIA = 'przekładnik napięciowy';
export const OZNACZENIE_POLA_BEZ_NUMERU = 'bez numeru';

function oznaczeniePola(pole: PoleZrodla): string {
  const numer = typeof pole.bay_number === 'string' ? pole.bay_number.trim() : '';
  if (numer) return numer;
  const nazwa = typeof pole.name === 'string' ? pole.name.trim() : '';
  return nazwa || OZNACZENIE_POLA_BEZ_NUMERU;
}

/** Czy pole niesie funkcję, której warunkiem jest źródło 3U₀. */
export function czyFunkcjeWymagajaZrodlaU0(kody: readonly string[]): boolean {
  return kody.some((kod) => FUNKCJE_WYMAGAJACE_ZRODLA_U0.includes(kod));
}

/**
 * Warunek 67N pola — ta sama kolejność rozstrzygania i te same braki co backend
 * (`zrodlo_u0_pola`). Deterministyczna, bez efektów ubocznych.
 */
export function zrodloU0Pola(
  snapshot: Pick<EnergyNetworkModel, 'bays'>,
  pole: PoleZrodla & Pick<Bay, 'zrodlo_u0_ref'>,
): ZrodloU0PolaView {
  const pola: readonly PoleZrodla[] = snapshot.bays ?? [];
  const kody: KodBrakuZrodlaU0[] = [];
  if (!aparaty(pole).some((a) => a.kind === RODZAJ_FERRANTIEGO)) kody.push('BRAK_FERRANTIEGO');
  const ref = typeof pole.zrodlo_u0_ref === 'string' ? pole.zrodlo_u0_ref.trim() : '';
  let vtRef: string | null = null;
  let vtOznaczenie: string | null = null;
  let poleZrodla: PoleZrodla | null = null;
  if (!ref) {
    const saKandydaci = pola.some(
      (inne) =>
        (inne.ref_id === pole.ref_id || (czyPolePomiaruNapieciaSzyn(inne) && inne.bus_ref === pole.bus_ref))
        && aparaty(inne).some((a) => a.kind === RODZAJ_VT && uzwojenieOtwartegoTrojkata(a) !== undefined),
    );
    kody.push(saKandydaci ? 'BRAK_POWIAZANIA' : 'BRAK_POLA_POMIARU_NAPIECIA');
  } else {
    let znaleziony: { aparat: BayPrimaryDevice; pole: PoleZrodla } | null = null;
    for (const inne of pola) {
      const aparat = aparaty(inne).find((a) => a.device_ref === ref);
      if (aparat) {
        znaleziony = { aparat, pole: inne };
        break;
      }
    }
    if (!znaleziony) {
      kody.push('APARAT_NIEOBECNY');
    } else {
      const toSamoPole = znaleziony.pole.ref_id === pole.ref_id;
      if (znaleziony.aparat.kind !== RODZAJ_VT) kody.push('APARAT_NIE_JEST_VT');
      else if (uzwojenieOtwartegoTrojkata(znaleziony.aparat) === undefined) kody.push('BRAK_OTWARTEGO_TROJKATA');
      else if (!toSamoPole && !czyPolePomiaruNapieciaSzyn(znaleziony.pole)) kody.push('POLE_NIE_MIERZY_SZYN');
      else if (!toSamoPole && znaleziony.pole.bus_ref !== pole.bus_ref) kody.push('INNA_SEKCJA');
      else {
        vtRef = znaleziony.aparat.device_ref;
        const oznaczenie = typeof znaleziony.aparat.designation === 'string' ? znaleziony.aparat.designation.trim() : '';
        vtOznaczenie = oznaczenie || OZNACZENIE_VT_BEZ_OZNACZENIA;
        poleZrodla = znaleziony.pole;
      }
    }
  }
  return {
    potwierdzone: kody.length === 0,
    vtRef,
    vtOznaczenie,
    poleZrodlaRef: poleZrodla?.ref_id ?? null,
    poleZrodlaOznaczenie: poleZrodla ? oznaczeniePola(poleZrodla) : null,
    kodyBrakow: kody,
  };
}

/**
 * Źródło 3U₀ pola dla deskryptora schematu — rozstrzygane, gdy pole ma powiązanie albo funkcję
 * wymagającą źródła w `Bay.protection_codes` (jedyny nośnik kodów funkcji pola na schemacie,
 * `resolveBayProtectionMarking`); inaczej `undefined`: pole bez 67N i bez powiązania nie niesie
 * odniesienia. Jedna funkcja dla adaptera stacji i adaptera GPZ.
 */
export function zrodloU0WidokuPola(
  snapshot: Pick<EnergyNetworkModel, 'bays'>,
  pole: PoleZrodla & Pick<Bay, 'zrodlo_u0_ref' | 'protection_codes'>,
): ZrodloU0PolaView | undefined {
  const maPowiazanie = typeof pole.zrodlo_u0_ref === 'string' && pole.zrodlo_u0_ref.trim() !== '';
  if (!maPowiazanie && !czyFunkcjeWymagajaZrodlaU0(pole.protection_codes ?? [])) return undefined;
  return zrodloU0Pola(snapshot, pole);
}

/** Rozszerzenie deskryptora pola (stacje i GPZ): `{ zrodloU0 }` albo `{}` — bez klucza
 *  z wartością `undefined` (deskryptor bez źródła jest równy deskryptorowi sprzed reguły). */
export function zrodloU0Deskryptora(
  snapshot: Pick<EnergyNetworkModel, 'bays'>,
  pole: PoleZrodla & Pick<Bay, 'zrodlo_u0_ref' | 'protection_codes'>,
): { readonly zrodloU0?: ZrodloU0PolaView } {
  const zrodloU0 = zrodloU0WidokuPola(snapshot, pole);
  return zrodloU0 ? { zrodloU0 } : {};
}

/** Tekst odniesienia przy przekaźniku: obwód okrężny „Z, Zz" z przekładnika pola pomiaru
 *  napięcia (rysunek ENEA Z.10/Z.11.1) — `null`, gdy źródło niepotwierdzone. */
export function tekstOdniesieniaZrodlaU0(zrodlo: ZrodloU0PolaView | undefined): string | null {
  if (!zrodlo?.potwierdzone || !zrodlo.vtOznaczenie) return null;
  return `3U₀ (Z, Zz) ← ${zrodlo.vtOznaczenie}, pole ${zrodlo.poleZrodlaOznaczenie ?? ''}`.trimEnd();
}
