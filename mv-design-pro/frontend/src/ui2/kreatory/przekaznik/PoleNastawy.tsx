/**
 * Pole nastawy funkcji sterownika — JEDNA definicja odczytu i edycji nastawy wg schematu rejestru
 * funkcji EAZ (`ui/shared/funkcjeEaz.ts`, lustro backendu): reguła widoczności rodziny czasu,
 * odczyt tekstu pola na wartość i kontrolka pola. Używa jej edytor nastaw karty pola (zapis
 * nastaw bazowych modelu) i sekcja „Zabezpieczenia w tym przypadku" karty przypadku (nadpisania
 * nastaw przypadku) — oba miejsca czytają i zapisują nastawę tak samo.
 */

import './edytorNastaw.css';

import { etykietaWartosciNastawy, type SchematNastawyEaz } from '../../../ui/shared/funkcjeEaz';
import { NASTAWY_STRINGS as T } from './stringsNastaw';

/** Wartości formularza jednej funkcji: klucz nastawy → tekst pola (pusty = brak, nie zero). */
export type WartosciFunkcji = Readonly<Record<string, string>>;

/**
 * Nastawy widoczne w formularzu wg reguły rodziny czasu (lustro walidacji zapisu backendu):
 * funkcja z charakterystyką czasową ma mnożnik TMS tylko przy charakterystyce zależnej, a zwłokę
 * tylko przy czasie niezależnym (DT); bez wybranej charakterystyki — żadnej z nich.
 */
export function czyNastawaWidoczna(schemat: SchematNastawyEaz, wartosci: WartosciFunkcji, zKrzywa: boolean): boolean {
  if (!zKrzywa) return true;
  const krzywa = wartosci.krzywa ?? '';
  if (schemat.klucz === 'tms') return krzywa !== '' && krzywa !== 'DT';
  if (schemat.klucz === 'zwloka_s') return krzywa === 'DT';
  return true;
}

/** Tekst pola → wartość nastawy wg schematu (`null` — pole puste albo nieczytelne). */
export function wartoscZTekstu(schemat: SchematNastawyEaz, tekst: string): number | string | boolean | null {
  const t = tekst.trim();
  if (t === '') return null;
  if (schemat.typ === 'LOGICZNA') return t === 'true';
  if (schemat.typ === 'WYBOR') return t;
  const liczba = Number(t.replace(',', '.'));
  return Number.isFinite(liczba) ? liczba : null;
}

/** Jednostka pola nastawy w komórce tabeli (strona przekładnika progu idzie z wyboru obok). */
function jednostkaPola(schemat: SchematNastawyEaz): string | null {
  if (schemat.klucz === 'prog' || !schemat.jednostka || schemat.jednostka === '1') return null;
  return schemat.jednostka;
}

export function PoleNastawy({
  schemat,
  wartosc,
  onZmiana,
  testid,
}: {
  schemat: SchematNastawyEaz;
  wartosc: string;
  onZmiana: (tekst: string) => void;
  testid: string;
}) {
  if (schemat.typ === 'LOGICZNA') {
    return (
      <label className="mvd-edytor-nastaw-pole" title={schemat.nazwaPl}>
        <input
          type="checkbox"
          checked={wartosc === 'true'}
          onChange={(e) => onZmiana(e.target.checked ? 'true' : 'false')}
          aria-label={schemat.nazwaPl}
          data-testid={testid}
        />
        <span>{schemat.nazwaPl}</span>
      </label>
    );
  }
  if (schemat.typ === 'WYBOR') {
    return (
      <select
        className="mvd-edytor-nastaw-wybor"
        value={wartosc}
        onChange={(e) => onZmiana(e.target.value)}
        aria-label={schemat.nazwaPl}
        title={schemat.nazwaPl}
        data-testid={testid}
      >
        <option value="">{schemat.klucz === 'jednostka_progu' ? T.stronaPusta : T.wybierz}</option>
        {schemat.wartosci.map((w) => (
          <option key={w} value={w}>
            {schemat.klucz === 'jednostka_progu' ? T.stronaSkrot(w) : etykietaWartosciNastawy(w)}
          </option>
        ))}
      </select>
    );
  }
  const jednostka = jednostkaPola(schemat);
  return (
    <span className="mvd-edytor-nastaw-pole" title={schemat.nazwaPl}>
      {schemat.klucz === 'tms' ? <span className="mvd-edytor-nastaw-prefiks">TMS</span> : null}
      <input
        type="number"
        step="any"
        min={0}
        className="mvd-num"
        value={wartosc}
        onChange={(e) => onZmiana(e.target.value)}
        aria-label={schemat.nazwaPl}
        data-testid={testid}
      />
      {jednostka ? <span className="mvd-edytor-nastaw-jednostka">{jednostka}</span> : null}
    </span>
  );
}

