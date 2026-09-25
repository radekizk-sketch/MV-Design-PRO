/**
 * KARTA POLE-ZAJĘTE — odczyt zajętości pola liniowego SN z modelu odczytu backendu.
 *
 * Zajętość pola (czy wychodzi z niego już odcinek albo czy zasila ciąg) liczy JEDNA funkcja
 * backendu (`enm/zajetosc_pol.py`) i ta sama funkcja bramkuje operacje domenowe (odmowa
 * `field.line_field_occupied`). Front czyta jej wynik z `logical_views.line_fields` i NIE
 * liczy zajętości sam — dawniej miał dwa własne predykaty (zacisk pola i `origin_bay_ref`),
 * rozjechane z backendem (karta S95-START).
 *
 * Brak modelu odczytu (odpowiedź bez `line_fields`, pole nieobecne w widoku) to zajętość
 * NIEZNANA — nigdy „wolne”: brak pomiaru nie jest dowodem, a pozycja budowy bez pewnego
 * punktu startu otwierałaby kreator, którego backend może odmówić.
 */
import type { LineFieldViewV1, LogicalViewsV1 } from '../../types/enm';

export type StanPolaLiniowego = 'wolne' | 'zajete' | 'nieznany';

export function wierszPolaLiniowego(
  logicalViews: LogicalViewsV1 | null | undefined,
  fieldRef: string | null | undefined,
): LineFieldViewV1 | null {
  if (!fieldRef) return null;
  return (logicalViews?.line_fields ?? []).find((wiersz) => wiersz.field_ref === fieldRef) ?? null;
}

export function stanPolaLiniowego(
  logicalViews: LogicalViewsV1 | null | undefined,
  fieldRef: string | null | undefined,
): StanPolaLiniowego {
  const wiersz = wierszPolaLiniowego(logicalViews, fieldRef);
  if (!wiersz) return 'nieznany';
  return wiersz.occupied ? 'zajete' : 'wolne';
}

/** Pole liniowe jest punktem startu tylko wtedy, gdy backend potwierdził, że jest WOLNE. */
export function poleLinioweWolne(
  logicalViews: LogicalViewsV1 | null | undefined,
  fieldRef: string | null | undefined,
): boolean {
  return stanPolaLiniowego(logicalViews, fieldRef) === 'wolne';
}
