/**
 * Dane projektu szablonu GPZ — odczyt warunku wymagalności i postać wartości do ładunku
 * (karta GPZ-H5-APARATURA). Lustro reguły backendu `schema.py::dana_projektu_wymagana`;
 * zgodność przypina wspólna fikstura przypadków generowana przez backend
 * (`__tests__/wymagalnosc_danych_projektu.json`). Bez fizyki i bez wartości domyślnych
 * danych projektu — jedyną wartością domyślną jest parametr szablonu (`transformer_count`).
 */
import type { DanaProjektuSzablonu, TemplateParamInt } from './api';

function wartoscSciezki(dane: Readonly<Record<string, unknown>>, sciezka: string): unknown {
  let wartosc: unknown = dane;
  for (const czesc of sciezka.split('.')) {
    if (wartosc === null || typeof wartosc !== 'object' || Array.isArray(wartosc)) return undefined;
    wartosc = (wartosc as Record<string, unknown>)[czesc];
  }
  return wartosc;
}

/**
 * Czy dana jest wymagana przy danych zastosowania `dane`. `parametry` — parametry
 * liczbowe szablonu (wartość domyślna dla parametru niepodanego w `dane`).
 */
export function czyDanaProjektuWymagana(
  dana: DanaProjektuSzablonu,
  dane: Readonly<Record<string, unknown>>,
  parametry: Readonly<Record<string, TemplateParamInt>>,
): boolean {
  if (dana.wymagalnosc === 'opcjonalnie') return false;
  for (const warunek of dana.wymagana_gdy) {
    let wartosc = wartoscSciezki(dane, warunek.klucz);
    if (wartosc === undefined || wartosc === null) {
      wartosc = parametry[warunek.klucz]?.default;
    }
    if (warunek.rowna !== null && (wartosc === undefined || wartosc === null || String(wartosc) !== warunek.rowna)) {
      return false;
    }
    if (
      warunek.co_najmniej !== null
      && (typeof wartosc !== 'number' || !Number.isInteger(wartosc) || wartosc < warunek.co_najmniej)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Wartość pola formularza (tekst kontrolki) w postaci ładunku wg `typ_wartosci`:
 * liczba całkowita jako liczba (operacja odrzuca numer zapisany tekstem), wybór i tekst
 * bez zmian, pusty tekst — brak danej (`undefined`, nigdy wartość domyślna). Tekst, który
 * nie jest liczbą, idzie bez zmian — odmowę z nazwą pola daje operacja, nie formularz.
 */
export function wartoscDanejProjektuDoLadunku(
  dana: DanaProjektuSzablonu,
  tekst: string,
): string | number | undefined {
  const przyciety = tekst.trim();
  if (przyciety === '') return undefined;
  if (dana.typ_wartosci === 'liczba_calkowita') {
    return /^\d+$/.test(przyciety) ? Number.parseInt(przyciety, 10) : przyciety;
  }
  return przyciety;
}
