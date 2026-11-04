/**
 * Sterownik zabezpieczeń pola (IED) — JEDYNE odczyty struktury zabezpieczeń modelu po stronie
 * frontu (karta OCHRONA-JEDNO-ZRODLO, ADR-022). Lustro akcesorów odczytu backendu
 * (`backend/src/enm/zabezpieczenie.py`): te same reguły, te same nazwy pojęć.
 *
 * Model ma JEDNĄ strukturę zabezpieczeń — `ProtectionAssignment` w `protection_assignments`:
 * pole (`bay_ref`), typ katalogowy, wejścia (CT/VT, 3I0, 3U0), funkcje z rejestru, grupy
 * nastaw 1–4 z aktywną grupą bazową i macierz wyzwoleń. Blok przekaźnika na schemacie, karta
 * pola, inspektor, kreatory i ekran zabezpieczeń czytają TĘ strukturę wyłącznie przez ten
 * moduł — nie ma kodów funkcji w rekordzie pola ani powiązań na aparatach.
 *
 * Reguła wyłącznika macierzy (jedna, jak `ref_aparatu_wyzwalanego` backendu): aparat pola
 * wyzwalany przez funkcję jest wpisany w macierzy referencją gałęzi, którą reprezentuje
 * (`linked_ref`), a gdy jej nie ma — własną referencją aparatu (`device_ref`).
 */
import type {
  BayPrimaryDevice,
  EnergyNetworkModel,
  ProtectionAssignment,
  WejsciaZabezpieczenia,
} from '../../types/enm';
import { funkcjaEaz, type WejscieFunkcjiEaz } from './funkcjeEaz';

type ModelZeSterownikami = Pick<EnergyNetworkModel, 'protection_assignments'>;

/** Sterowniki modelu w kolejności identyfikatorów (determinizm). */
export function sterowniki(enm: Partial<ModelZeSterownikami> | null | undefined): ProtectionAssignment[] {
  return [...(enm?.protection_assignments ?? [])].sort((a, b) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0));
}

/** Sterownik pola (najwyżej jeden — walidator modelu odrzuca drugi) albo `null`. */
export function sterownikPola(
  enm: Partial<ModelZeSterownikami> | null | undefined,
  bayRef: string | null | undefined,
): ProtectionAssignment | null {
  if (!bayRef) return null;
  return sterowniki(enm).find((s) => s.bay_ref === bayRef) ?? null;
}

/** Kody funkcji sterownika w kolejności zapisu, bez powtórzeń (dwa stopnie jednej funkcji —
 *  jeden kod). Domyślnie tylko funkcje włączone. */
export function kodyFunkcjiSterownika(
  sterownik: ProtectionAssignment | null | undefined,
  opcje: { readonly tylkoWlaczone?: boolean } = {},
): string[] {
  const tylkoWlaczone = opcje.tylkoWlaczone ?? true;
  const kody: string[] = [];
  for (const f of sterownik?.funkcje ?? []) {
    if (tylkoWlaczone && f.wlaczona === false) continue;
    if (!kody.includes(f.kod)) kody.push(f.kod);
  }
  return kody;
}

/** Kody funkcji POLA — z jego sterownika (pusta lista: pole bez sterownika). */
export function kodyFunkcjiPola(
  enm: Partial<ModelZeSterownikami> | null | undefined,
  bayRef: string | null | undefined,
  opcje: { readonly tylkoWlaczone?: boolean } = {},
): string[] {
  return kodyFunkcjiSterownika(sterownikPola(enm, bayRef), opcje);
}

/** Aparaty, na które działa funkcja (macierz wyzwoleń); pusta lista — funkcja nie wyzwala. */
export function aparatyFunkcji(sterownik: ProtectionAssignment | null | undefined, funkcjaRef: string): string[] {
  return [...(sterownik?.macierz_wyzwolen?.find((w) => w.funkcja_ref === funkcjaRef)?.aparat_refs ?? [])];
}

/** Wszystkie aparaty macierzy wyzwoleń sterownika (posortowane, bez powtórzeń). */
export function aparatySterownika(sterownik: ProtectionAssignment | null | undefined): string[] {
  const zbior = new Set<string>();
  for (const w of sterownik?.macierz_wyzwolen ?? []) for (const a of w.aparat_refs) zbior.add(a);
  return [...zbior].sort();
}

/** Referencja aparatu pola w macierzy wyzwoleń: gałąź, którą reprezentuje, albo sam aparat. */
export function refAparatuWyzwalanego(aparat: Pick<BayPrimaryDevice, 'device_ref' | 'linked_ref'>): string {
  return aparat.linked_ref ?? aparat.device_ref;
}

function napis(v: string | null | undefined): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** Wejście funkcji → aparaty, z których je zrealizowano (JEDNA reguła układów — lustro
 *  `wejscia_funkcji_w_aparacie`). */
export function wejsciaFunkcjiWAparacie(
  wejscia: WejsciaZabezpieczenia | null | undefined,
): Partial<Record<WejscieFunkcjiEaz, readonly string[]>> {
  const wynik: Partial<Record<WejscieFunkcjiEaz, readonly string[]>> = {};
  const ct = napis(wejscia?.ct_ref);
  const vt = napis(wejscia?.vt_ref);
  if (ct) wynik.I = [ct];
  if (vt) wynik.U = [vt];
  const i0Ferranti = napis(wejscia?.i0_ct_ref);
  if (wejscia?.i0_uklad === 'HOLMGREEN' && ct) wynik['3I0'] = [ct];
  else if (wejscia?.i0_uklad === 'FERRANTI' && i0Ferranti) wynik['3I0'] = [i0Ferranti];
  const u0Trojkat = napis(wejscia?.u0_vt_ref);
  if (wejscia?.u0_uklad === 'OTWARTY_TROJKAT' && u0Trojkat) wynik['3U0'] = [u0Trojkat];
  else if (wejscia?.u0_uklad === 'Z_NAPIEC_FAZOWYCH' && vt) wynik['3U0'] = [vt];
  const strona2 = (wejscia?.ct_strony_2_refs ?? []).filter((r) => napis(r) !== null);
  if (strona2.length > 0) wynik.I_STRONY_2 = strona2;
  return wynik;
}

/** Wejścia zrealizowane przekładnikami (sygnał binarny `SYGNAL` jest zawsze dostępny). */
export function wejsciaDostepne(sterownik: ProtectionAssignment | null | undefined): ReadonlySet<WejscieFunkcjiEaz> {
  const zbior = new Set<WejscieFunkcjiEaz>(['SYGNAL']);
  for (const w of Object.keys(wejsciaFunkcjiWAparacie(sterownik?.wejscia)) as WejscieFunkcjiEaz[]) zbior.add(w);
  return zbior;
}

/** Wymagane wejścia funkcji (rejestr), których sterownik nie ma przypiętych. */
export function brakujaceWejscia(sterownik: ProtectionAssignment | null | undefined, kod: string): WejscieFunkcjiEaz[] {
  const wpis = funkcjaEaz(kod);
  if (wpis === null) return [];
  const dostepne = wejsciaDostepne(sterownik);
  return wpis.wejsciaWymagane.filter((w) => !dostepne.has(w));
}

/** Kody włączonych funkcji mierzących z aparatu (przekładnik przypięty do ich wejścia). */
export function funkcjeZasilaneZAparatu(sterownik: ProtectionAssignment | null | undefined, deviceRef: string): string[] {
  if (!sterownik) return [];
  const wejscia = wejsciaFunkcjiWAparacie(sterownik.wejscia);
  const zasilane = (Object.keys(wejscia) as WejscieFunkcjiEaz[]).filter((w) => wejscia[w]?.includes(deviceRef));
  if (zasilane.length === 0) return [];
  return kodyFunkcjiSterownika(sterownik).filter((kod) => {
    const wpis = funkcjaEaz(kod);
    const potrzebne = wpis ? [...wpis.wejsciaWymagane, ...wpis.wejsciaOpcjonalne] : [];
    return potrzebne.some((w) => zasilane.includes(w));
  });
}

/** Kody włączonych funkcji działających na aparat (macierz wyzwoleń; `null` — brak aparatu). */
export function funkcjeWylaczajaceAparat(sterownik: ProtectionAssignment | null | undefined, aparatRef: string | null): string[] {
  if (!sterownik || aparatRef === null) return [];
  // Kolejność = kolejność funkcji sterownika (jak `funkcjeZasilaneZAparatu` i backend
  // `funkcje_wylaczajace_aparat`), nie kolejność wierszy macierzy.
  const dzialajace = new Set(
    sterownik.macierz_wyzwolen.filter((w) => w.aparat_refs.includes(aparatRef)).map((w) => w.funkcja_ref),
  );
  const kody: string[] = [];
  for (const f of sterownik.funkcje) {
    if (f.wlaczona !== false && dzialajace.has(f.ref) && !kody.includes(f.kod)) kody.push(f.kod);
  }
  return kody;
}

/** Numer grupy nastaw czytanej przez ocenę (aktywna grupa bazowa sterownika). */
export function numerGrupyEfektywnej(sterownik: ProtectionAssignment): number {
  return sterownik.aktywna_grupa ?? 1;
}

/** Nastawy funkcji w grupie (domyślnie aktywnej) — klucz schematu → wartość. */
export function nastawyFunkcji(
  sterownik: ProtectionAssignment | null | undefined,
  funkcjaRef: string,
  numerGrupy?: number,
): Record<string, number | string | boolean> {
  if (!sterownik) return {};
  const numer = numerGrupy ?? numerGrupyEfektywnej(sterownik);
  const grupa = sterownik.grupy_nastaw.find((g) => g.numer === numer);
  const wpis = grupa?.funkcje?.find((f) => f.funkcja_ref === funkcjaRef);
  const wynik: Record<string, number | string | boolean> = {};
  for (const n of wpis?.nastawy ?? []) wynik[n.klucz] = n.wartosc;
  return wynik;
}

/** Przekładnik źródła 3U0 pola: uzwojenie otwartego trójkąta przypięte do sterownika pola
 *  (lustro `ref_zrodla_u0_pola`); `null` — źródło niepowiązane. */
export function refZrodlaU0Pola(
  enm: Partial<ModelZeSterownikami> | null | undefined,
  bayRef: string | null | undefined,
): string | null {
  const wejscia = sterownikPola(enm, bayRef)?.wejscia;
  return wejscia?.u0_uklad === 'OTWARTY_TROJKAT' ? napis(wejscia.u0_vt_ref) : null;
}

/** Liczba nastaw zapisanych w grupie efektywnej sterownika (wszystkie funkcje). */
export function liczbaNastawGrupyEfektywnej(sterownik: ProtectionAssignment | null | undefined): number {
  if (!sterownik) return 0;
  const grupa = sterownik.grupy_nastaw.find((g) => g.numer === numerGrupyEfektywnej(sterownik));
  return (grupa?.funkcje ?? []).reduce((suma, f) => suma + (f.nastawy?.length ?? 0), 0);
}

/** Nazwa urządzenia sterownika do wiersza listy: wyrób z katalogu (`materialized_params.name_pl`
 *  z rekordu katalogu) albo nazwa sterownika w modelu — nigdy rodzaj zgadnięty z funkcji. */
export function nazwaUrzadzeniaSterownika(sterownik: ProtectionAssignment): string {
  const zKatalogu = sterownik.materialized_params?.['name_pl'];
  return typeof zKatalogu === 'string' && zKatalogu.trim() ? zKatalogu : sterownik.name;
}
