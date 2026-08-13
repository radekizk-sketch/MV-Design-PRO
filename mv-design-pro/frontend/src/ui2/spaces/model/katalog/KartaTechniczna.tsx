/**
 * KartaTechniczna — karta techniczna typu katalogowego (W-205/W-206).
 *
 * Sekcje:
 *   1. Nagłówek: nazwa, producent, kategoria, rodzaj (badge), id.
 *   2. Parametry techniczne: uporządkowane pola z definicją PL (symbol, jednostka,
 *      norma). Tylko pola z jednoznacznym znaczeniem normowym (słownik definicji) —
 *      pola niejednoznaczne pomijane (zero zgadywania, karta E4.1 §2).
 *   3. Pochodzenie danych: źródło / status weryfikacji / status katalogu / norma /
 *      nota — jeśli API je niesie; w przeciwnym razie „wkrótce".
 *
 * Tylko odczyt — katalog jest niezmienny (kanon katalog-first).
 */

import { definicjaParametru } from './parametryDefinicje';
import { ParametrRow } from './ParametrRow';
import {
  ETYKIETY_KATEGORII,
  ETYKIETY_RODZAJU_APARATU,
  ETYKIETY_RODZAJU_FALOWNIKA,
  ETYKIETY_STATUSU_KATALOGU,
  ETYKIETY_WERYFIKACJI,
  STRINGS,
} from './strings';
import type { KatalogPozycja, KategoriaId } from './types';

export interface KartaTechnicznaProps {
  pozycja: KatalogPozycja;
  kategoria: KategoriaId;
  poleParametrow: readonly string[];
}

function czytajTekst(pozycja: KatalogPozycja, klucz: string): string | null {
  const raw = pozycja[klucz];
  if (typeof raw !== 'string') {
    return null;
  }
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function rodzajBadge(pozycja: KatalogPozycja, kategoria: KategoriaId): string | null {
  if (kategoria === 'APARAT') {
    const kind = czytajTekst(pozycja, 'equipment_kind');
    return kind ? (ETYKIETY_RODZAJU_APARATU[kind] ?? kind) : null;
  }
  if (kategoria === 'FALOWNIK') {
    const kind = czytajTekst(pozycja, 'kind');
    return kind ? (ETYKIETY_RODZAJU_FALOWNIKA[kind] ?? kind) : null;
  }
  return null;
}

interface WierszPochodzenia {
  etykieta: string;
  wartosc: string;
}

function zbudujPochodzenie(pozycja: KatalogPozycja): WierszPochodzenia[] {
  const wiersze: WierszPochodzenia[] = [];

  const zrodlo = czytajTekst(pozycja, 'source_reference');
  wiersze.push({ etykieta: STRINGS.pochodzenieZrodlo, wartosc: zrodlo ?? STRINGS.wkrotce });

  const weryfikacja = czytajTekst(pozycja, 'verification_status');
  if (weryfikacja) {
    wiersze.push({
      etykieta: STRINGS.pochodzenieWeryfikacja,
      wartosc: ETYKIETY_WERYFIKACJI[weryfikacja] ?? weryfikacja,
    });
  }

  const status = czytajTekst(pozycja, 'catalog_status');
  if (status) {
    wiersze.push({
      etykieta: STRINGS.pochodzenieStatus,
      wartosc: ETYKIETY_STATUSU_KATALOGU[status] ?? status,
    });
  }

  const norma = czytajTekst(pozycja, 'standard');
  if (norma) {
    wiersze.push({ etykieta: STRINGS.pochodzenieNorma, wartosc: norma });
  }

  const nota = czytajTekst(pozycja, 'verification_note');
  if (nota) {
    wiersze.push({ etykieta: STRINGS.pochodzenieNota, wartosc: nota });
  }

  return wiersze;
}

export function KartaTechniczna({
  pozycja,
  kategoria,
  poleParametrow,
}: KartaTechnicznaProps): JSX.Element {
  const producent =
    typeof pozycja.manufacturer === 'string' && pozycja.manufacturer.trim().length > 0
      ? pozycja.manufacturer
      : STRINGS.producentNieznany;
  const badge = rodzajBadge(pozycja, kategoria);

  const parametry = poleParametrow
    .map((klucz) => ({ klucz, definicja: definicjaParametru(klucz) }))
    .filter(
      (p): p is { klucz: string; definicja: NonNullable<typeof p.definicja> } =>
        p.definicja !== null && pozycja[p.klucz] !== undefined && pozycja[p.klucz] !== null,
    );

  const pochodzenie = zbudujPochodzenie(pozycja);

  return (
    <section className="mvd-katalog__karta" aria-label={pozycja.name}>
      <header>
        <h3>{pozycja.name}</h3>
        <p className="mvd-katalog__param-def">
          {ETYKIETY_KATEGORII[kategoria]}
          {badge ? ` · ${badge}` : ''} · {producent}
        </p>
        <p className="mvd-katalog__param-def">{pozycja.id}</p>
      </header>

      <h4 className="mvd-katalog__sekcja-tytul">{STRINGS.kartaParametry}</h4>
      {parametry.length > 0 ? (
        <div>
          {parametry.map(({ klucz, definicja }) => (
            <ParametrRow key={klucz} definicja={definicja} wartosc={pozycja[klucz]} />
          ))}
        </div>
      ) : (
        <p className="mvd-katalog__param-def">{STRINGS.kartaBrakParametrow}</p>
      )}

      <h4 className="mvd-katalog__sekcja-tytul">{STRINGS.kartaPochodzenie}</h4>
      <div>
        {pochodzenie.map((w) => (
          <div key={w.etykieta} className="mvd-katalog__param mvd-katalog__param--tekst">
            <span>{w.etykieta}</span>
            <span className="mvd-katalog__param-wartosc mvd-katalog__param-wartosc--tekst">
              {w.wartosc}
            </span>
          </div>
        ))}
      </div>

      <p className="mvd-katalog__param-def">{STRINGS.immutableNota}</p>
    </section>
  );
}
