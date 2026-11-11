/*
 * Projekcja wyniku biegu na tabelę wszystkich elementów (karta UI-02 PANEL-DOLNY,
 * kontrakt UI-17: wynik w kontekście elementu). Funkcje czyste — zero fizyki,
 * zero wyliczeń: wartości, jednostki i format przychodzą z backendu
 * (`overlay_payload.elements[ref].metrics[kod] = {value, unit, format_hint}`),
 * tu jest wyłącznie zapis polski (`formatMetricValuePl`) i układ kolumn.
 *
 * TRZY RÓŻNE STANY KOMÓRKI (nigdy jeden udający drugi):
 *  - brak wyniku — element nie ma tej wielkości (albo wartość `null`): komórki NIE MA,
 *    tabela pokazuje „—" z opisem „brak wyniku";
 *  - zero — wartość 0 jest liczbą i dostaje zapis „0,00" (wg formatu z backendu);
 *  - wynik nieaktualny — stan CAŁEGO biegu (baner i przygaszenie w zakładce),
 *    nie komórki.
 */
import type { RawMetricValue, RawOverlayElement } from '../../../ui/sld-overlay/rawResultOverlayStore';
import { formatMetricValuePl } from '../../../ui/sld/v3/canvas/resultLabelTemplates';
import { formatElementTypeLabelPl } from '../../../ui/shared/elementTypeLabels';
import { resolveSelectedElementFromSnapshot } from '../../../ui/shared/selectionResolution';
import type { EnergyNetworkModel } from '../../../types/enm';
import { czyZnanaMetryka, etykietaMetryki, porownajKodyMetryk } from '../../wyniki/etykietyMetryk';
import { nazwaObiektuZMigawki } from '../../wyniki/wzorzec/useNazwaObiektu';
import type { DefinicjaKolumny, WierszTabeli } from '../../wyniki/wzorzec/wzorzecModel';

/** Klucze kolumn stałych; kolumny wielkości mają klucz `m:<kod metryki>`. */
export const KOLUMNA_ELEMENT = 'element';
export const KOLUMNA_RODZAJ = 'rodzaj';
export const KOLUMNA_WAZNOSC = 'waznosc';
export const KOLUMNA_IDENTYFIKATOR = 'ref';

export function kluczKolumnyMetryki(kod: string): string {
  return `m:${kod}`;
}

/**
 * Rodzaj obiektu nakładki (zamknięty `OverlayElementKind` backendu,
 * `domain/result_contract_v1.py`) — używany wtedy, gdy migawka modelu nie zna
 * elementu (wynik starszy niż usunięcie obiektu albo brak migawki).
 */
const RODZAJ_NAKLADKI_PL: Readonly<Record<string, string>> = {
  bus: 'Szyna',
  branch: 'Gałąź',
  device: 'Aparat',
  substation: 'Stacja',
  bay: 'Pole',
  junction: 'Złącze',
  corridor: 'Ciąg liniowy',
  transformer: 'Transformator',
  load: 'Obciążenie',
  generator: 'Źródło',
  measurement: 'Pomiar',
  protection_assignment: 'Przypisanie zabezpieczenia',
};

/** Ważność elementu z jego uwag (badges). Element bez uwag = „bez uwag", nie „informacja". */
const WAZNOSC_PL: Readonly<Record<string, { etykieta: string; ranga: number }>> = {
  BLOCKER: { etykieta: 'Blokada', ranga: 4 },
  IMPORTANT: { etykieta: 'Istotne', ranga: 3 },
  WARNING: { etykieta: 'Ostrzeżenie', ranga: 2 },
  INFO: { etykieta: 'Informacja', ranga: 1 },
};
export const BEZ_UWAG = 'bez uwag';

export function rodzajElementu(
  snapshot: EnergyNetworkModel | null,
  ref: string,
  element: RawOverlayElement,
): string {
  if (snapshot) {
    const zModelu = resolveSelectedElementFromSnapshot(snapshot, ref);
    if (zModelu) return formatElementTypeLabelPl(zModelu.type);
  }
  return RODZAJ_NAKLADKI_PL[element.kind] ?? 'Obiekt modelu';
}

export function waznoscElementu(element: RawOverlayElement): { etykieta: string; ranga: number } {
  if (!Array.isArray(element.badges) || element.badges.length === 0) {
    return { etykieta: BEZ_UWAG, ranga: 0 };
  }
  return WAZNOSC_PL[element.severity] ?? { etykieta: 'nieokreślona', ranga: 0 };
}

function metrykaZWartoscia(metryka: RawMetricValue | undefined): metryka is RawMetricValue & { value: number } {
  return metryka !== undefined && typeof metryka.value === 'number' && Number.isFinite(metryka.value);
}

export interface TabelaWynikowPanelu {
  readonly kolumny: DefinicjaKolumny[];
  readonly wiersze: WierszTabeli[];
  /** Rodzaje obecne w tabeli (do filtra), posortowane po polsku. */
  readonly rodzaje: string[];
  /** Kody metryk bez etykiety w rejestrze (rozjazd z backendem — jawny komunikat, nie kolumna). */
  readonly nieznaneKody: string[];
}

/**
 * Tabela wszystkich elementów wyniku: element (nazwa z modelu), rodzaj, każda
 * wielkość obecna w wyniku (z jednostką z backendu), ważność, identyfikator
 * (wyłącznie w szczegółach audytowych). Kolejność wierszy deterministyczna:
 * nazwa elementu (po polsku), remis — identyfikator.
 */
export function zbudujTabeleWynikow(
  elementy: Readonly<Record<string, RawOverlayElement>>,
  snapshot: EnergyNetworkModel | null,
): TabelaWynikowPanelu {
  const refy = Object.keys(elementy);
  const jednostki = new Map<string, Set<string>>();
  const nieznane = new Set<string>();
  for (const ref of refy) {
    for (const [kod, metryka] of Object.entries(elementy[ref].metrics ?? {})) {
      if (!czyZnanaMetryka(kod)) {
        nieznane.add(kod);
        continue;
      }
      if (!metrykaZWartoscia(metryka)) continue;
      const zbior = jednostki.get(kod) ?? new Set<string>();
      zbior.add(metryka.unit);
      jednostki.set(kod, zbior);
    }
  }
  const kody = [...jednostki.keys()].sort(porownajKodyMetryk);
  const jednostkaKolumny = (kod: string): string | undefined => {
    const zbior = jednostki.get(kod);
    if (!zbior || zbior.size !== 1) return undefined;
    const [jedyna] = [...zbior];
    return jedyna === '' ? undefined : jedyna;
  };

  const kolumny: DefinicjaKolumny[] = [
    { klucz: KOLUMNA_ELEMENT, etykieta: 'Element' },
    { klucz: KOLUMNA_RODZAJ, etykieta: 'Rodzaj' },
    ...kody.map(
      (kod): DefinicjaKolumny => ({
        klucz: kluczKolumnyMetryki(kod),
        etykieta: etykietaMetryki(kod),
        jednostka: jednostkaKolumny(kod),
        mono: true,
      }),
    ),
    { klucz: KOLUMNA_WAZNOSC, etykieta: 'Ważność' },
    { klucz: KOLUMNA_IDENTYFIKATOR, etykieta: 'Identyfikator', tylkoEkspercki: true },
  ];

  const wiersze = refy.map((ref): WierszTabeli => {
    const element = elementy[ref];
    const waznosc = waznoscElementu(element);
    const wiersz: WierszTabeli = {
      [KOLUMNA_ELEMENT]: { wartosc: nazwaObiektuZMigawki(snapshot, ref) },
      [KOLUMNA_RODZAJ]: { wartosc: rodzajElementu(snapshot, ref, element) },
      [KOLUMNA_WAZNOSC]: { wartosc: waznosc.etykieta, sortKey: waznosc.ranga },
      [KOLUMNA_IDENTYFIKATOR]: { wartosc: ref },
    };
    for (const kod of kody) {
      const metryka = element.metrics?.[kod];
      if (!metrykaZWartoscia(metryka)) continue; // brak wyniku — komórki nie ma
      wiersz[kluczKolumnyMetryki(kod)] = {
        wartosc: formatMetricValuePl(metryka),
        // Jednostka przy wartości tylko wtedy, gdy kolumna nie ma jednej wspólnej.
        jednostka: jednostkaKolumny(kod) === undefined && metryka.unit !== '' ? metryka.unit : undefined,
        sortKey: metryka.value,
      };
    }
    return wiersz;
  });
  wiersze.sort((a, b) => {
    const nazwa = String(a[KOLUMNA_ELEMENT].wartosc).localeCompare(String(b[KOLUMNA_ELEMENT].wartosc), 'pl');
    return nazwa !== 0 ? nazwa : String(a[KOLUMNA_IDENTYFIKATOR].wartosc).localeCompare(String(b[KOLUMNA_IDENTYFIKATOR].wartosc));
  });

  const rodzaje = [...new Set(wiersze.map((w) => String(w[KOLUMNA_RODZAJ].wartosc)))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );
  return { kolumny, wiersze, rodzaje, nieznaneKody: [...nieznane].sort() };
}

export interface FiltrWynikow {
  /** `null` = wszystkie rodzaje. */
  readonly rodzaj: string | null;
  readonly tekst: string;
}

/** Filtr po rodzaju i tekstowy (nazwa, rodzaj, identyfikator) — bez zmiany kolejności. */
export function filtrujWiersze(wiersze: readonly WierszTabeli[], filtr: FiltrWynikow): WierszTabeli[] {
  const fraza = filtr.tekst.trim().toLocaleLowerCase('pl');
  return wiersze.filter((wiersz) => {
    if (filtr.rodzaj !== null && wiersz[KOLUMNA_RODZAJ].wartosc !== filtr.rodzaj) return false;
    if (fraza === '') return true;
    return [KOLUMNA_ELEMENT, KOLUMNA_RODZAJ, KOLUMNA_IDENTYFIKATOR].some((klucz) =>
      String(wiersz[klucz].wartosc).toLocaleLowerCase('pl').includes(fraza),
    );
  });
}
