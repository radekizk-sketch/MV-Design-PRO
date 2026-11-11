/**
 * Zapis nastaw funkcji sterownika do wiersza tabeli (karta OCHRONA-JEDNO-ZRODLO, standard
 * warsztatu §10 kontraktu prezentacji inżynierskiej): funkcja = wiersz, nastawy z jednostkami,
 * czas, aparat wyzwalany. JEDEN zapis dla karty pola (inspektor) i edytora nastaw (E-27) —
 * te same wartości modelu w tej samej postaci w obu miejscach.
 *
 * Wyłącznie odczyt i formatowanie wartości zapisanych w modelu (`grupy_nastaw` sterownika) wg
 * schematu nastaw rejestru funkcji (`funkcjeEaz.ts`, lustro backendu). ZERO fizyki: przeliczenie
 * progu na stronę pierwotną i ocena zakresów to backend (`ocena_nadpradowa.rozwiaz_nastawy`).
 */
import type { Bay, Branch, EnergyNetworkModel, ProtectionAssignment } from '../../types/enm';
import { etykietaWartosciNastawy, funkcjaEaz, type SchematNastawyEaz } from './funkcjeEaz';
import { aparatyFunkcji, nastawyFunkcji, refAparatuWyzwalanego } from './sterownikZabezpieczen';

/** Nastawa czasu działania funkcji: charakterystyka, mnożnik czasowy albo wartość w sekundach. */
export function czyNastawaCzasu(schemat: Pick<SchematNastawyEaz, 'klucz' | 'jednostka'>): boolean {
  return schemat.klucz === 'krzywa' || schemat.klucz === 'tms' || schemat.jednostka === 's';
}

/** Liczba nastawy po polsku — wartość wpisana przez projektanta, bez dopełniania zerami. */
export function liczbaNastawy(wartosc: number): string {
  return wartosc
    .toLocaleString('pl-PL', { maximumFractionDigits: 3, useGrouping: false })
    .replace(/[\u00a0\u202f\u2009]/g, ' ');
}

/** Strona przekładnika progu prądowego w zapisie skróconym kolumny (PZ-09). */
const STRONA_PROGU_SKROT: Readonly<Record<string, string>> = {
  A_WTORNY: 'A wt.',
  A_PIERWOTNY: 'A pierw.',
};

/** Charakterystyka czasowa w zapisie skróconym kolumny („IEC SI", „DT"); pełna nazwa w podpowiedzi. */
function krzywaSkrot(kod: string): string {
  return kod.replace(/_/g, ' ');
}

/** Zapis jednej wartości nastawy (bez nazwy nastawy) wg schematu rejestru. */
export function zapisWartosciNastawy(
  schemat: SchematNastawyEaz,
  wartosc: number | string | boolean,
  nastawy: Readonly<Record<string, number | string | boolean>> = {},
): string {
  if (schemat.typ === 'LOGICZNA') return wartosc === true ? 'tak' : 'nie';
  if (typeof wartosc !== 'number') {
    return schemat.klucz === 'krzywa' ? krzywaSkrot(String(wartosc)) : etykietaWartosciNastawy(String(wartosc));
  }
  if (schemat.klucz === 'tms') return `TMS ${liczbaNastawy(wartosc)}`;
  if (schemat.klucz === 'prog' && typeof nastawy.jednostka_progu === 'string') {
    return `${liczbaNastawy(wartosc)} ${STRONA_PROGU_SKROT[nastawy.jednostka_progu] ?? schemat.jednostka ?? ''}`.trim();
  }
  const jednostka = schemat.jednostka && schemat.jednostka !== '1' ? ` ${schemat.jednostka}` : '';
  return `${liczbaNastawy(wartosc)}${jednostka}`;
}

/** Opis nastaw jednej funkcji w grupie: kolumna nastaw, kolumna czasu, podpowiedź z nazwami. */
export interface OpisNastawFunkcji {
  /** Nastawy inne niż czas (próg, kąt, kierunek…) — `null`, gdy żadnej nie zapisano. */
  readonly nastawy: string | null;
  /** Charakterystyka i czas (krzywa, TMS, zwłoki) — `null`, gdy żadnej nie zapisano. */
  readonly czas: string | null;
  /** Pełne nazwy nastaw z wartościami (podpowiedź wiersza). */
  readonly podpowiedz: string;
  /** Liczba nastaw zapisanych w grupie wobec liczby nastaw schematu funkcji. */
  readonly zapisane: number;
  readonly wSchemacie: number;
}

export function opisNastawFunkcji(
  sterownik: ProtectionAssignment | null | undefined,
  funkcja: { readonly ref: string; readonly kod: string },
  numerGrupy?: number,
): OpisNastawFunkcji {
  const schemat = funkcjaEaz(funkcja.kod)?.nastawy ?? [];
  const wartosci = nastawyFunkcji(sterownik, funkcja.ref, numerGrupy);
  const nastawy: string[] = [];
  const czas: string[] = [];
  const podpowiedz: string[] = [];
  let zapisane = 0;
  for (const s of schemat) {
    const wartosc = wartosci[s.klucz];
    if (wartosc === undefined) continue;
    zapisane += 1;
    const pelna =
      typeof wartosc === 'string' ? etykietaWartosciNastawy(wartosc) : zapisWartosciNastawy(s, wartosc, wartosci);
    podpowiedz.push(`${s.nazwaPl}: ${pelna}`);
    // Strona przekładnika jest częścią zapisu progu („2 A wt."), nie osobną pozycją kolumny.
    if (s.klucz === 'jednostka_progu' && wartosci.prog !== undefined) continue;
    (czyNastawaCzasu(s) ? czas : nastawy).push(zapisWartosciNastawy(s, wartosc, wartosci));
  }
  return {
    nastawy: nastawy.length > 0 ? nastawy.join(' · ') : null,
    czas: czas.length > 0 ? czas.join(' · ') : null,
    podpowiedz: podpowiedz.join('; '),
    zapisane,
    wSchemacie: schemat.length,
  };
}

/** Nazwa aparatu wyzwalanego przez funkcję: oznaczenie aparatu pola (Q0), nazwa gałęzi albo
 *  sama referencja — nigdy nazwa zgadnięta. */
export function nazwaAparatuWyzwalanego(
  model: Partial<Pick<EnergyNetworkModel, 'branches'>> | null | undefined,
  bay: Pick<Bay, 'primary_devices'> | null | undefined,
  ref: string,
): string {
  const aparat = (bay?.primary_devices ?? []).find((d) => refAparatuWyzwalanego(d) === ref || d.device_ref === ref);
  if (aparat?.designation) return aparat.designation;
  const galaz = (model?.branches ?? []).find((b: Branch) => b.ref_id === ref);
  return galaz?.name?.trim() || ref;
}

/** Aparaty wyzwalane przez funkcję w zapisie kolumny („Q0"; kilka — po przecinku). */
export function aparatyWyzwalaneFunkcji(
  model: Partial<Pick<EnergyNetworkModel, 'branches'>> | null | undefined,
  bay: Pick<Bay, 'primary_devices'> | null | undefined,
  sterownik: ProtectionAssignment | null | undefined,
  funkcjaRef: string,
): string | null {
  const nazwy = aparatyFunkcji(sterownik, funkcjaRef).map((r) => nazwaAparatuWyzwalanego(model, bay, r));
  return nazwy.length > 0 ? nazwy.join(', ') : null;
}
