/**
 * OZNACZENIA ZACISKÓW PRZEKŁADNIKA PRĄDOWEGO NA SCHEMACIE (karta UX-04/POLE-LINIOWE-WZORZEC,
 * decyzja architekta §11.7 pkt 6, 2026-10-30).
 *
 * PN-EN 61869-2 oznacza zaciski pierwotne przekładnika prądowego P1 i P2, a zaciski wtórne
 * S1 i S2. Rysunek ENEA Zeszyt 1 Z.10 (s.89) i Z.11.1 (s.91) opisuje zaciski pierwotne T1:
 * P1 od strony szyny, P2 od strony kabla. Biegunowość jest daną modelu, nie rysunku: zacisk P1
 * to port `we` aparatu (`BayPrimaryDevice.ports`), P2 — port `wy` (backend
 * `rodzaje_aparatury.PORT_WEJSCIA`/`PORT_WYJSCIA`: „Przekładnik prądowy Z.10: P1 = we, P2 = wy”).
 * Tor pola rysuje się od szyny (`torPolaZPortow`), więc port `we` leży na schemacie po stronie
 * szyny; rekord z portami podanymi odwrotnie da odwrotne oznaczenia — rysunek pokazuje model.
 *
 * Napisy „P1”/„P2” wyglądają jak kryptonimy projektu (`P<cyfra>`), których strażnik
 * `scripts/no_codenames_guard.py` zakazuje w tekstach interfejsu. Strażnik ma WĄSKI wyjątek
 * wyłącznie dla wiersza deklaracji poniżej w tym pliku (literał równy oznaczeniu zacisku) —
 * każde inne miejsce czyta oznaczenia z tej stałej, a „P1” poza nią nadal jest blokowane
 * (self-test strażnika `scripts/test_no_codenames_guard.py`).
 */
import type { PortAparatuPolaView } from '../../v2/model/widokPolStacji';
import { PORT_WEJSCIA, PORT_WYJSCIA } from './rodzajeAparatuPola';

// Wiersz deklaracji jest kontekstem wyjątku strażnika — nie dziel go na kilka wierszy.
export const ZACISKI_PRZEKLADNIKA_PRADOWEGO = { pierwotne: ['P1', 'P2'], wtorne: ['S1', 'S2'] } as const;

/** Oznaczenie zacisku pierwotnego przekładnika prądowego. */
export type ZacisPierwotnyPrzekladnika = (typeof ZACISKI_PRZEKLADNIKA_PRADOWEGO.pierwotne)[number];

/** Port aparatu w torze → zacisk pierwotny przekładnika prądowego (P1 = `we`, P2 = `wy`). */
export const ZACISK_PIERWOTNY_PORTU: Readonly<Record<string, ZacisPierwotnyPrzekladnika>> = {
  [PORT_WEJSCIA]: ZACISKI_PRZEKLADNIKA_PRADOWEGO.pierwotne[0],
  [PORT_WYJSCIA]: ZACISKI_PRZEKLADNIKA_PRADOWEGO.pierwotne[1],
};

/** Zaciski pierwotne przekładnika w kolejności toru od szyny: zacisk portu, którym aparat wchodzi
 *  do toru (`we`), i zacisk portu wyjścia (`wy`). `null`, gdy rekord nie niesie obu portów
 *  z węzłem pola — wtedy biegunowości nie ma w modelu i schemat jej nie rysuje (zero domysłu). */
export function zaciskiPierwotneWTorze(
  ports: readonly PortAparatuPolaView[] | undefined,
): { readonly odSzyny: ZacisPierwotnyPrzekladnika; readonly odOdplywu: ZacisPierwotnyPrzekladnika } | null {
  const we = ports?.find((p) => p.portId === PORT_WEJSCIA);
  const wy = ports?.find((p) => p.portId === PORT_WYJSCIA);
  if (!we?.wezel || !wy?.wezel) return null;
  return { odSzyny: ZACISK_PIERWOTNY_PORTU[PORT_WEJSCIA], odOdplywu: ZACISK_PIERWOTNY_PORTU[PORT_WYJSCIA] };
}

/** Znacznik właściciela etykiety zacisku przekładnika (`<pole>#zacisk-przekladnika-<aparat>-<zacisk>`)
 *  — jedno źródło dla kompozycji pola GPZ i filtra poziomu szczegółu sceny (oznaczenia zacisków
 *  są szczegółem pola: wyłącznie LOD 2, jak podpisy aparatów). */
export const ZNACZNIK_ZACISKU_PRZEKLADNIKA = '#zacisk-przekladnika-';
