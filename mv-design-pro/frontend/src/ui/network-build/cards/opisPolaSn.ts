/**
 * Opis pola SN z modelu — JEDNO źródło tekstu dla tabeli pól konfiguratora GPZ (`TabelaPolSn`),
 * karty pola E-11 (`PowiazaniaPola`) i tabeli pól konfiguratora stacji (kolumna „Powiązany
 * obiekt”). Kontrakt prezentacji §10 (KD6): każda informacja ma znaczenie i akcję, więc
 * zamiast gołego „—” albo „Brak danych” pole mówi, CZEGO brakuje (odejścia, aparatu,
 * sterownika), a wołający dokłada akcję naprawczą.
 *
 * Wszystko jest odczytem migawki ENM, bez fizyki i bez domysłu:
 *  - odejście: odcinek (kabel / linia napowietrzna) na ZACISKU pola (`Bay.terminal_bus_ref`)
 *    i stacja, do której ciąg dochodzi — przejście po kolejnych odcinkach i łącznikach ciągu,
 *    dopóki węzeł ma dokładnie jedno dalsze połączenie; węzeł należący do innej stacji (szyna
 *    stacji albo zacisk jej pola) kończy przejście;
 *  - aparat główny: aparaty pierwotne MODELU POLA (`field-view`, backend składa je z
 *    `Bay.primary_devices`, a bez nich z łączników gałęzi pola); kolejność rodzajów:
 *    wyłącznik, rozłącznik, bezpieczniki, odłącznik;
 *  - zabezpieczenie: `Bay.protection_ref` → `ProtectionAssignment` (ten sam tor co lista
 *    przekaźników konfiguratora stacji i znakowanie zabezpieczeń na SLD), kody funkcji
 *    nastaw bez powtórzeń w kolejności nastaw;
 *  - sprzęgło: łącznik `bus_coupler`, sekcja po drugiej stronie i stan normalny
 *    (`normal_state`, a bez niego bieżący `status`).
 */
import type {
  Bay,
  BayPrimaryDevice,
  Branch,
  EnergyNetworkModel,
  ProtectionAssignment,
  Substation,
} from '../../../types/enm';
import { NAZWA_RODZAJU_APARATU_PL, type RodzajAparatuPolaSn } from '../../field/wyposazeniePola';
import { kodFunkcjiZabezpieczenia } from '../../shared/etykietyZabezpieczen';
import { nazwaKatalogowa } from '../../shared/nazwaKatalogowa';

/** Sekcja rozdzielnicy w opisie sprzęgła: szyna sekcji i jej nazwa. */
export interface SekcjaOpisu {
  readonly busRef: string;
  readonly etykieta: string;
}

// ---------------------------------------------------------------------------
// Sprzęgło
// ---------------------------------------------------------------------------

/** „Sekcja 2” → „z sekcją 2”; nazwa własna → „z sekcją „Rozdzielnia A””. */
export function zSekcja(etykieta: string): string {
  const numer = /^sekcja\s+(.+)$/i.exec(etykieta.trim());
  return numer ? `z sekcją ${numer[1]}` : `z sekcją „${etykieta.trim()}”`;
}

/** Stan normalny łącznika sprzęgła z modelu (`normal_state`, bez niego `status`). */
export function stanNormalnySprzegla(galaz: Branch): 'normalnie otwarte' | 'normalnie zamknięte' {
  const normalny = 'normal_state' in galaz ? (galaz as { normal_state?: string | null }).normal_state : undefined;
  return (normalny ?? galaz.status) === 'open' ? 'normalnie otwarte' : 'normalnie zamknięte';
}

/**
 * Opis sprzęgła widziany z szyny `busRef`: „Sprzęgło z sekcją 2 · normalnie otwarte”. Sekcja po
 * drugiej stronie z listy sekcji, bez niej nazwa szyny z modelu.
 */
export function opisSprzegla(
  snapshot: EnergyNetworkModel | null,
  galaz: Branch,
  busRef: string,
  sekcje: readonly SekcjaOpisu[],
): string {
  const druga = galaz.from_bus_ref === busRef ? galaz.to_bus_ref : galaz.from_bus_ref;
  const sekcja = sekcje.find((s) => s.busRef === druga);
  const szyna = (snapshot?.buses ?? []).find((b) => b.ref_id === druga);
  const strona = sekcja
    ? zSekcja(sekcja.etykieta)
    : szyna?.name
      ? `z szyną „${szyna.name}”`
      : 'z szyną spoza sekcji stacji';
  return `Sprzęgło ${strona} · ${stanNormalnySprzegla(galaz)}`;
}

/** Łącznik sprzęgła pola sprzęgła: gałąź `bus_coupler` z `equipment_refs` pola. */
export function lacznikSprzeglaPola(snapshot: EnergyNetworkModel | null, pole: Bay): Branch | null {
  return (
    (snapshot?.branches ?? []).find(
      (g) => g.type === 'bus_coupler' && (pole.equipment_refs ?? []).includes(g.ref_id),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Odejście
// ---------------------------------------------------------------------------

const TYPY_ODCINKA: ReadonlySet<string> = new Set(['cable', 'line_overhead']);
/** Gałęzie, przez które ciąg przechodzi dalej (odcinki i łączniki w torze ciągu). */
const TYPY_CIAGU: ReadonlySet<string> = new Set([
  'cable',
  'line_overhead',
  'switch',
  'breaker',
  'disconnector',
  'fuse',
]);
/** Role pola liniowego — pole, którego zacisk MA mieć odcinek sieci. */
const ROLE_LINIOWE: ReadonlySet<string> = new Set(['IN', 'OUT', 'FEEDER']);

export type CelOdejscia =
  | { readonly rodzaj: 'stacja'; readonly nazwa: string }
  | { readonly rodzaj: 'koniec' }
  | { readonly rodzaj: 'rozgalezienie' };

export interface OdejsciePola {
  readonly odcinek: string;
  readonly rodzajOdcinka: 'kabel' | 'linia napowietrzna';
  readonly cel: CelOdejscia;
}

function stacjaWezla(
  snapshot: EnergyNetworkModel,
  busRef: string,
  wlasnaStacja: string | null | undefined,
): Substation | null {
  const stacje = snapshot.substations ?? [];
  const zSzyny = stacje.find((s) => s.ref_id !== wlasnaStacja && (s.bus_refs ?? []).includes(busRef));
  if (zSzyny) return zSzyny;
  const pole = (snapshot.bays ?? []).find(
    (b) =>
      (b.terminal_bus_ref === busRef || b.bus_ref === busRef)
      && Boolean(b.substation_ref)
      && b.substation_ref !== wlasnaStacja,
  );
  return pole ? stacje.find((s) => s.ref_id === pole.substation_ref) ?? null : null;
}

/** Odcinek na zacisku pola i cel ciągu; `null` — zacisk bez odcinka (albo pole bez zacisku). */
export function odejsciePola(snapshot: EnergyNetworkModel | null, pole: Bay): OdejsciePola | null {
  const zacisk = pole.terminal_bus_ref;
  if (!snapshot || !zacisk) return null;
  const galezie = snapshot.branches ?? [];
  const odcinek = galezie.find(
    (g) => TYPY_ODCINKA.has(g.type) && (g.from_bus_ref === zacisk || g.to_bus_ref === zacisk),
  );
  if (!odcinek) return null;
  const odwiedzone = new Set<string>([odcinek.ref_id]);
  let wezel = odcinek.from_bus_ref === zacisk ? odcinek.to_bus_ref : odcinek.from_bus_ref;
  let cel: CelOdejscia = { rodzaj: 'koniec' };
  // Każdy krok zużywa jedną gałąź — przejście kończy się najpóźniej po wszystkich gałęziach.
  for (let krok = 0; krok <= galezie.length; krok += 1) {
    const stacja = stacjaWezla(snapshot, wezel, pole.substation_ref);
    if (stacja) {
      cel = { rodzaj: 'stacja', nazwa: stacja.name || 'stacja bez nazwy' };
      break;
    }
    const dalej = galezie.filter(
      (g) =>
        TYPY_CIAGU.has(g.type)
        && !odwiedzone.has(g.ref_id)
        && (g.from_bus_ref === wezel || g.to_bus_ref === wezel),
    );
    if (dalej.length === 0) {
      cel = { rodzaj: 'koniec' };
      break;
    }
    if (dalej.length > 1) {
      cel = { rodzaj: 'rozgalezienie' };
      break;
    }
    odwiedzone.add(dalej[0].ref_id);
    wezel = dalej[0].from_bus_ref === wezel ? dalej[0].to_bus_ref : dalej[0].from_bus_ref;
  }
  return {
    odcinek: odcinek.name || 'odcinek bez nazwy',
    rodzajOdcinka: odcinek.type === 'cable' ? 'kabel' : 'linia napowietrzna',
    cel,
  };
}

/** Pole liniowe (wejściowe, wyjściowe, odpływowe) — jego zacisk ma mieć odcinek sieci. */
export function czyPoleLiniowe(pole: Bay): boolean {
  return ROLE_LINIOWE.has(pole.bay_role);
}

/** Etykieta wiersza odejścia: pole wejściowe ma linię zasilającą, pozostałe — odejście. */
export function etykietaOdejscia(pole: Bay): string {
  return pole.bay_role === 'IN' ? 'Linia zasilająca' : 'Odejście';
}

/** Tekst odejścia: „Odejście: kabel Odcinek 1 → stacja S-12”; brak odejścia — `null`. */
export function tekstOdejscia(pole: Bay, odejscie: OdejsciePola): string {
  const cel =
    odejscie.cel.rodzaj === 'stacja'
      ? `stacja ${odejscie.cel.nazwa}`
      : odejscie.cel.rodzaj === 'rozgalezienie'
        ? 'rozgałęzienie ciągu'
        : 'koniec ciągu bez stacji';
  const strzalka = pole.bay_role === 'IN' ? '←' : '→';
  return `${etykietaOdejscia(pole)}: ${odejscie.rodzajOdcinka} ${odejscie.odcinek} ${strzalka} ${cel}`;
}

/** Tekst braku odejścia pola liniowego. */
export function tekstBrakuOdejscia(pole: Bay): string {
  return pole.bay_role === 'IN' ? 'Bez linii zasilającej' : 'Bez odejścia';
}

// ---------------------------------------------------------------------------
// Aparat główny
// ---------------------------------------------------------------------------

/** Kolejność wyboru aparatu głównego pola. */
const PRIORYTET_APARATU: readonly RodzajAparatuPolaSn[] = ['CB', 'LOAD_SWITCH', 'FUSE', 'DS'];

export interface AparatGlowny {
  readonly rodzaj: RodzajAparatuPolaSn;
  /** Pozycja katalogu aparatu; `null` — aparat jest wartością roboczą bez pozycji katalogowej. */
  readonly catalogRef: string | null;
}

/**
 * Aparat główny pola z aparatów pierwotnych MODELU POLA (`GET …/enm/field-view`,
 * `base_model.primary_devices`) — backend składa je z rekordu `Bay.primary_devices`, a bez niego
 * z łączników gałęzi pola (`equipment_refs`, także łącznik sprzęgła); front ich nie składa drugi
 * raz. `null` — pole nie ma aparatu łączeniowego.
 */
export function aparatGlownyPola(urzadzenia: readonly BayPrimaryDevice[]): AparatGlowny | null {
  for (const rodzaj of PRIORYTET_APARATU) {
    const urzadzenie = urzadzenia.find((d) => d.kind === rodzaj);
    if (urzadzenie) return { rodzaj, catalogRef: urzadzenie.catalog_ref ?? null };
  }
  return null;
}

/**
 * Tekst aparatu: nazwa pozycji katalogu (`nazwyKatalogu`), bez niej rodzaj „z katalogu”;
 * aparat bez pozycji katalogowej jest jawnie wartością roboczą. Rodzina rozdzielnicy pola
 * dochodzi po kropce środkowej.
 */
export function tekstAparatu(
  aparat: AparatGlowny,
  pole: Bay,
  nazwyKatalogu: ReadonlyMap<string, string>,
): string {
  const rodzaj = NAZWA_RODZAJU_APARATU_PL[aparat.rodzaj];
  const nazwaZKatalogu = aparat.catalogRef ? nazwyKatalogu.get(aparat.catalogRef) : undefined;
  const nazwa = nazwaZKatalogu ? nazwaKatalogowa(nazwaZKatalogu) : undefined;
  const opis = aparat.catalogRef
    ? nazwa
      ? `Aparat: ${nazwa}`
      : `Aparat: ${rodzaj} z katalogu`
    : `Aparat: ${rodzaj} — wartość robocza bez pozycji katalogowej`;
  const rodzina = pole.switchgear_family_ref ? nazwyKatalogu.get(pole.switchgear_family_ref) : undefined;
  return rodzina ? `${opis} · rozdzielnica ${nazwaKatalogowa(rodzina)}` : opis;
}

export const TEKST_BRAKU_APARATU = 'Aparat nieprzypisany';

/** Odczyt modelu pola jeszcze trwa albo się nie udał — aparat nie jest wtedy „nieprzypisany”. */
export const TEKST_APARATU_BEZ_ODCZYTU = 'Aparat: model pola w odczycie';

/** Czy opis pól ma pozycję katalogu do nazwania (aparat z katalogu albo rodzina rozdzielnicy). */
export function czyPotrzebneNazwyKatalogu(
  pola: readonly Bay[],
  urzadzeniaPola: (pole: Bay) => readonly BayPrimaryDevice[] | null,
): boolean {
  return pola.some(
    (p) => Boolean(p.switchgear_family_ref) || Boolean(aparatGlownyPola(urzadzeniaPola(p) ?? [])?.catalogRef),
  );
}

// ---------------------------------------------------------------------------
// Zabezpieczenie
// ---------------------------------------------------------------------------

export interface ZabezpieczeniePola {
  readonly nazwa: string;
  /** Kody funkcji nastaw (ANSI/IEC) bez powtórzeń, w kolejności nastaw. */
  readonly kody: readonly string[];
  readonly wlaczone: boolean;
}

/** Sterownik pola z modelu (`Bay.protection_ref` → `ProtectionAssignment`); `null` — brak. */
export function zabezpieczeniePola(
  snapshot: EnergyNetworkModel | null,
  pole: Bay,
): ZabezpieczeniePola | null {
  if (!pole.protection_ref) return null;
  const przypisanie: ProtectionAssignment | undefined = (snapshot?.protection_assignments ?? []).find(
    (z) => z.ref_id === pole.protection_ref,
  );
  if (!przypisanie) return null;
  return {
    nazwa: przypisanie.name || 'sterownik bez nazwy',
    kody: [...new Set((przypisanie.settings ?? []).map((n) => kodFunkcjiZabezpieczenia(n.function_type)))],
    wlaczone: przypisanie.is_enabled,
  };
}

/** Rola bez sterownika zabezpieczeniowego w torze (pole pomiarowe). */
export function czyRolaBezZabezpieczenia(pole: Bay): boolean {
  return pole.bay_role === 'MEASUREMENT';
}

/** Tekst sterownika: „Zabezpieczenie: 50, 51, 51N”; sterownik bez nastaw mówi to wprost. */
export function tekstZabezpieczenia(zabezpieczenie: ZabezpieczeniePola): string {
  const funkcje =
    zabezpieczenie.kody.length > 0 ? zabezpieczenie.kody.join(', ') : `${zabezpieczenie.nazwa} bez nastaw funkcji`;
  return `Zabezpieczenie: ${funkcje}${zabezpieczenie.wlaczone ? '' : ' (wyłączone w modelu)'}`;
}

export const TEKST_BRAKU_STEROWNIKA = 'Brak sterownika';
export const TEKST_ZABEZPIECZENIA_BEZPIECZNIKAMI = 'Zabezpieczenie: bezpieczniki aparatu pola';

// ---------------------------------------------------------------------------
// Opis pola wiersz po wierszu (tabela pól GPZ, karta pola E-11)
// ---------------------------------------------------------------------------

/** Miejsce karty pola E-11, które naprawia brak (fokus wejścia „Konfiguruj”). */
export type FokusPola = 'odejscie' | 'aparat' | 'zabezpieczenie';

export const FOKUSY_POLA: readonly FokusPola[] = ['odejscie', 'aparat', 'zabezpieczenie'];

export interface PozycjaOpisuPola {
  readonly fokus: FokusPola;
  readonly tekst: string;
  /** `true` — pozycja nazywa brak; wołający dokłada akcję naprawczą. */
  readonly brak: boolean;
}

/** Akcja naprawcza braku — czasownik dopisywany do tekstu braku. */
export const AKCJA_NAPRAWCZA_PL: Readonly<Record<FokusPola, string>> = {
  odejscie: 'wyprowadź odcinek z pola',
  aparat: 'przypisz aparat z katalogu',
  zabezpieczenie: 'dodaj zabezpieczenie',
};

/**
 * Odejście (pole liniowe albo pole z odcinkiem na zacisku), aparat główny i zabezpieczenie
 * (poza polem pomiarowym) — każda pozycja z modelu, brak nazwany wprost.
 */
export function pozycjeOpisuPola(
  snapshot: EnergyNetworkModel | null,
  pole: Bay,
  /** Aparaty pierwotne z modelu pola; `null` — model pola jeszcze nieodczytany. */
  urzadzenia: readonly BayPrimaryDevice[] | null,
  nazwyKatalogu: ReadonlyMap<string, string>,
): PozycjaOpisuPola[] {
  const pozycje: PozycjaOpisuPola[] = [];
  const odejscie = odejsciePola(snapshot, pole);
  if (odejscie) pozycje.push({ fokus: 'odejscie', tekst: tekstOdejscia(pole, odejscie), brak: false });
  else if (czyPoleLiniowe(pole)) pozycje.push({ fokus: 'odejscie', tekst: tekstBrakuOdejscia(pole), brak: true });

  const aparat = urzadzenia ? aparatGlownyPola(urzadzenia) : null;
  pozycje.push(
    urzadzenia === null
      ? { fokus: 'aparat', tekst: TEKST_APARATU_BEZ_ODCZYTU, brak: false }
      : aparat
        ? { fokus: 'aparat', tekst: tekstAparatu(aparat, pole, nazwyKatalogu), brak: aparat.catalogRef === null }
        : { fokus: 'aparat', tekst: TEKST_BRAKU_APARATU, brak: true },
  );

  if (!czyRolaBezZabezpieczenia(pole)) {
    const zabezpieczenie = zabezpieczeniePola(snapshot, pole);
    if (zabezpieczenie) {
      pozycje.push({
        fokus: 'zabezpieczenie',
        tekst: tekstZabezpieczenia(zabezpieczenie),
        brak: zabezpieczenie.kody.length === 0,
      });
    } else if (aparat?.rodzaj === 'FUSE') {
      pozycje.push({ fokus: 'zabezpieczenie', tekst: TEKST_ZABEZPIECZENIA_BEZPIECZNIKAMI, brak: false });
    } else {
      pozycje.push({ fokus: 'zabezpieczenie', tekst: TEKST_BRAKU_STEROWNIKA, brak: true });
    }
  }
  return pozycje;
}

// ---------------------------------------------------------------------------
// Powiązany obiekt pola (konfigurator stacji)
// ---------------------------------------------------------------------------

/**
 * Obiekt na zacisku pola w jednym zdaniu (kolumna „Powiązany obiekt” konfiguratora stacji):
 * odejście, transformator, bateria, zespół uziemiający, źródło, sprzęgło. `null` — zacisk
 * pola nie ma obiektu w modelu.
 */
export function powiazanyObiektPola(
  snapshot: EnergyNetworkModel | null,
  pole: Bay,
  sekcje: readonly SekcjaOpisu[] = [],
): string | null {
  if (!snapshot) return null;
  if (pole.bay_role === 'COUPLER') {
    const sprzeglo = lacznikSprzeglaPola(snapshot, pole);
    return sprzeglo ? opisSprzegla(snapshot, sprzeglo, pole.bus_ref, sekcje) : null;
  }
  const odejscie = odejsciePola(snapshot, pole);
  if (odejscie) return tekstOdejscia(pole, odejscie);
  const zacisk = pole.terminal_bus_ref;
  if (!zacisk) return null;
  const transformator = (snapshot.transformers ?? []).find(
    (t) => t.hv_bus_ref === zacisk || t.lv_bus_ref === zacisk,
  );
  if (transformator) return `Transformator ${transformator.name || 'bez nazwy'}`;
  const bateria = (snapshot.shunt_capacitors ?? []).find((s) => s.bus_ref === zacisk);
  if (bateria) return `Bateria kondensatorów ${bateria.name || 'bez nazwy'}`;
  const zespol = (snapshot.zespoly_uziemiajace ?? []).find((z) => z.bay_ref === pole.ref_id);
  if (zespol) return `Zespół uziemiający ${zespol.name || 'bez nazwy'}`;
  const zrodlo = (snapshot.generators ?? []).find((g) => g.bus_ref === zacisk);
  if (zrodlo) return `Źródło ${zrodlo.name || 'bez nazwy'}`;
  return null;
}
