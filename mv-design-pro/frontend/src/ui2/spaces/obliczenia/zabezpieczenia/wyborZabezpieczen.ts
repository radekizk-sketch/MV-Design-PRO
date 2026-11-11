/**
 * Wybór zabezpieczeń PRZYPADKU obliczeniowego — model formularza i klient API (ADR-022, karta
 * EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN).
 *
 * Przypadek WYBIERA grupę nastaw sterownika (1–4, z grup zdefiniowanych w modelu) albo NADPISUJE
 * nastawy funkcji w grupie efektywnej przypadku. Nastawy bazowe są danymi modelu i są zawsze
 * czytane z modelu (`grupy_nastaw` sterownika); przypadek niesie wyłącznie deltę. Zapis idzie
 * końcówką delty scenariusza przypadku (`PUT /api/scenariusze-laczeniowe/study-cases/{case}/
 * zabezpieczenia-przypadku`), którą backend sprawdza TĄ SAMĄ regułą co zapis nastaw modelu
 * (`enm.nastawy_zabezpieczen.bledy_sterownika`) — sprzeczność wraca jako 422 z polem i zdaniem.
 * Odczyt pola nastawy (tekst → wartość wg schematu rejestru) to ta sama funkcja co w edytorze
 * nastaw karty pola (`wartoscZTekstu`) — jedna definicja.
 *
 * ZERO fizyki: model formularza przepisuje liczby i klucze; ocenę, czas wyłączenia i świeżość
 * wyników liczy backend.
 */

import type { ProtectionAssignment } from '../../../../types/enm';
import { funkcjaEaz, type SchematNastawyEaz } from '../../../../ui/shared/funkcjeEaz';
import { nastawyFunkcji, numerGrupyEfektywnej } from '../../../../ui/shared/sterownikZabezpieczen';
import { wartoscZTekstu } from '../../../kreatory/przekaznik/PoleNastawy';
import { komunikatZapytania } from '../../../shared/bladZapytania';

export type WartoscNastawy = number | string | boolean;

/** Delta nastaw przypadku: sterownik → funkcja (ref) → klucz nastawy → wartość. */
export type NadpisaniaNastaw = Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, WartoscNastawy>>>>>>;

/** Kontrakt `GET/PUT …/zabezpieczenia-przypadku` (1:1 z backendem). */
export interface WyborZabezpieczenPrzypadku {
  readonly case_id: string;
  readonly scenario_id: string | null;
  readonly revision: number | null;
  readonly hash: string | null;
  readonly protection_groups: Readonly<Record<string, number>>;
  readonly protection_overrides: NadpisaniaNastaw;
}

/** Jedno nadpisanie w formularzu (tekst pola jak w edytorze nastaw). */
export interface WierszNadpisania {
  readonly sterownikRef: string;
  readonly funkcjaRef: string;
  readonly klucz: string;
  readonly tekst: string;
}

export interface FormularzWyboru {
  /** Sterownik → grupa wybrana w przypadku (brak klucza = grupa aktywna z modelu). */
  readonly grupy: Readonly<Record<string, number>>;
  readonly nadpisania: readonly WierszNadpisania[];
}

export const FORMULARZ_PUSTY: FormularzWyboru = { grupy: {}, nadpisania: [] };

function tekstWartosci(wartosc: WartoscNastawy): string {
  if (typeof wartosc === 'boolean') return wartosc ? 'true' : 'false';
  return String(wartosc);
}

function porzadek(a: WierszNadpisania, b: WierszNadpisania): number {
  return (
    a.sterownikRef.localeCompare(b.sterownikRef) ||
    a.funkcjaRef.localeCompare(b.funkcjaRef) ||
    a.klucz.localeCompare(b.klucz)
  );
}

/** Zapisany wybór → stan formularza (kolejność deterministyczna). */
export function formularzZWyboru(wybor: WyborZabezpieczenPrzypadku | null): FormularzWyboru {
  if (!wybor) return FORMULARZ_PUSTY;
  const nadpisania: WierszNadpisania[] = [];
  for (const [sterownikRef, funkcje] of Object.entries(wybor.protection_overrides)) {
    for (const [funkcjaRef, nastawy] of Object.entries(funkcje)) {
      for (const [klucz, wartosc] of Object.entries(nastawy)) {
        nadpisania.push({ sterownikRef, funkcjaRef, klucz, tekst: tekstWartosci(wartosc) });
      }
    }
  }
  return { grupy: { ...wybor.protection_groups }, nadpisania: nadpisania.sort(porzadek) };
}

/** Grupa efektywna sterownika w przypadku: wybrana w przypadku albo aktywna z modelu. */
export function grupaEfektywnaPrzypadku(sterownik: ProtectionAssignment, grupy: Readonly<Record<string, number>>): number {
  return grupy[sterownik.ref_id] ?? numerGrupyEfektywnej(sterownik);
}

/** Numery grup nastaw zdefiniowanych w modelu (rosnąco). */
export function grupyModelu(sterownik: ProtectionAssignment): number[] {
  return [...new Set(sterownik.grupy_nastaw.map((g) => g.numer))].sort((a, b) => a - b);
}

/** Schemat nastawy funkcji sterownika z rejestru (`null` — funkcja albo klucz spoza rejestru). */
export function schematNastawy(
  sterownik: ProtectionAssignment,
  funkcjaRef: string,
  klucz: string,
): SchematNastawyEaz | null {
  const funkcja = sterownik.funkcje.find((f) => f.ref === funkcjaRef);
  return funkcja ? (funkcjaEaz(funkcja.kod)?.nastawy.find((s) => s.klucz === klucz) ?? null) : null;
}

/** Wartość bazowa nastawy z MODELU w grupie efektywnej przypadku (`null` — brak w modelu). */
export function wartoscBazowa(
  sterownik: ProtectionAssignment,
  funkcjaRef: string,
  klucz: string,
  grupy: Readonly<Record<string, number>>,
): WartoscNastawy | null {
  return nastawyFunkcji(sterownik, funkcjaRef, grupaEfektywnaPrzypadku(sterownik, grupy))[klucz] ?? null;
}

/** Ładunek zapisu albo błąd pierwszego nieczytelnego pola (indeks wiersza). */
export type WynikLadunku =
  | { readonly ok: true; readonly ladunek: Pick<WyborZabezpieczenPrzypadku, 'protection_groups' | 'protection_overrides'> }
  | { readonly ok: false; readonly wiersz: number };

export function ladunekWyboru(
  formularz: FormularzWyboru,
  sterowniki: readonly ProtectionAssignment[],
): WynikLadunku {
  const overrides: Record<string, Record<string, Record<string, WartoscNastawy>>> = {};
  for (const [i, w] of formularz.nadpisania.entries()) {
    const sterownik = sterowniki.find((s) => s.ref_id === w.sterownikRef);
    const schemat = sterownik ? schematNastawy(sterownik, w.funkcjaRef, w.klucz) : null;
    const wartosc = schemat ? wartoscZTekstu(schemat, w.tekst) : null;
    if (wartosc === null) return { ok: false, wiersz: i };
    const funkcje = (overrides[w.sterownikRef] ??= {});
    (funkcje[w.funkcjaRef] ??= {})[w.klucz] = wartosc;
  }
  return { ok: true, ladunek: { protection_groups: { ...formularz.grupy }, protection_overrides: overrides } };
}

/** Czy formularz różni się od zapisanego wyboru (przycisk „Zapisz"). */
export function czyZmieniony(formularz: FormularzWyboru, zapisany: WyborZabezpieczenPrzypadku | null): boolean {
  return JSON.stringify(formularzZWyboru(zapisany)) !== JSON.stringify({
    grupy: Object.fromEntries(Object.entries(formularz.grupy).sort(([a], [b]) => a.localeCompare(b))),
    nadpisania: [...formularz.nadpisania].sort(porzadek),
  });
}

/** Dodaj nadpisanie (wartość startowa = wartość bazowa z modelu); duplikat — bez zmian. */
export function dodajNadpisanie(
  formularz: FormularzWyboru,
  sterownik: ProtectionAssignment,
  funkcjaRef: string,
  klucz: string,
): FormularzWyboru {
  if (formularz.nadpisania.some((w) => w.sterownikRef === sterownik.ref_id && w.funkcjaRef === funkcjaRef && w.klucz === klucz)) {
    return formularz;
  }
  const bazowa = wartoscBazowa(sterownik, funkcjaRef, klucz, formularz.grupy);
  const wiersz = { sterownikRef: sterownik.ref_id, funkcjaRef, klucz, tekst: bazowa === null ? '' : tekstWartosci(bazowa) };
  return { ...formularz, nadpisania: [...formularz.nadpisania, wiersz].sort(porzadek) };
}

// ---------------------------------------------------------------------------
// Klient API
// ---------------------------------------------------------------------------

const BAZA = '/api/scenariusze-laczeniowe/study-cases';

/** Błąd zapisu z polem i zdaniem backendu (422 — wybór nie przystaje do modelu). */
export class BladZapisuWyboru extends Error {
  constructor(
    message: string,
    readonly pole: string | null,
  ) {
    super(message);
  }
}

async function bladOdpowiedzi(odpowiedz: Response, czynnosc: string): Promise<BladZapisuWyboru> {
  const tresc = (await odpowiedz.json().catch(() => null)) as { detail?: unknown } | null;
  const detail = tresc?.detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const pierwszy = detail[0] as { komunikat?: unknown; pole?: unknown; msg?: unknown };
    const komunikat = typeof pierwszy.komunikat === 'string' ? pierwszy.komunikat : String(pierwszy.msg ?? '');
    return new BladZapisuWyboru(komunikat || komunikatZapytania(odpowiedz, czynnosc), typeof pierwszy.pole === 'string' ? pierwszy.pole : null);
  }
  if (typeof detail === 'string' && detail.trim()) return new BladZapisuWyboru(detail, null);
  return new BladZapisuWyboru(komunikatZapytania(odpowiedz, czynnosc), null);
}

export async function pobierzWybor(caseId: string): Promise<WyborZabezpieczenPrzypadku> {
  const odpowiedz = await fetch(`${BAZA}/${encodeURIComponent(caseId)}/zabezpieczenia-przypadku`);
  if (!odpowiedz.ok) throw await bladOdpowiedzi(odpowiedz, 'Nie udało się odczytać zabezpieczeń przypadku');
  return (await odpowiedz.json()) as WyborZabezpieczenPrzypadku;
}

export async function zapiszWybor(
  caseId: string,
  ladunek: Pick<WyborZabezpieczenPrzypadku, 'protection_groups' | 'protection_overrides'>,
): Promise<WyborZabezpieczenPrzypadku> {
  const odpowiedz = await fetch(`${BAZA}/${encodeURIComponent(caseId)}/zabezpieczenia-przypadku`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ladunek),
  });
  if (!odpowiedz.ok) throw await bladOdpowiedzi(odpowiedz, 'Nie udało się zapisać zabezpieczeń przypadku');
  return (await odpowiedz.json()) as WyborZabezpieczenPrzypadku;
}

/** Wybory WSZYSTKICH przypadków projektu przypadku `caseId` (znaczniki w karcie pola). */
export async function pobierzWyboryPrzypadkow(caseId: string): Promise<WyborZabezpieczenPrzypadku[]> {
  const odpowiedz = await fetch(`${BAZA}/${encodeURIComponent(caseId)}/zabezpieczenia-przypadkow`);
  if (!odpowiedz.ok) throw await bladOdpowiedzi(odpowiedz, 'Nie udało się odczytać zabezpieczeń przypadków projektu');
  return ((await odpowiedz.json()) as { przypadki: WyborZabezpieczenPrzypadku[] }).przypadki;
}

// ---------------------------------------------------------------------------
// Znaczniki w karcie pola: „w przypadku X nadpisane: …"
// ---------------------------------------------------------------------------

/** Wpis znacznika jednego przypadku dla sterownika. */
export interface ZnacznikPrzypadku {
  readonly caseId: string;
  readonly grupa: number | null;
  /** Nadpisania sterownika: funkcja (ref) → klucz → wartość. */
  readonly nastawy: Readonly<Record<string, Readonly<Record<string, WartoscNastawy>>>>;
}

/** Przypadki, których wybór dotyczy sterownika (grupa albo nadpisanie), w kolejności listy. */
export function znacznikiSterownika(
  wybory: readonly WyborZabezpieczenPrzypadku[],
  sterownikRef: string,
): ZnacznikPrzypadku[] {
  return wybory
    .map((w) => ({
      caseId: w.case_id,
      grupa: w.protection_groups[sterownikRef] ?? null,
      nastawy: w.protection_overrides[sterownikRef] ?? {},
    }))
    .filter((z) => z.grupa !== null || Object.keys(z.nastawy).length > 0);
}
