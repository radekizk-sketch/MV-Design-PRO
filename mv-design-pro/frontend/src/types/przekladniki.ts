/**
 * Tabliczki przekładników CT/VT — lustro `network_model/catalog/przekladniki`.
 *
 * Osobny moduł (nie `types/enm`): rdzenie i uzwojenia wtórne niesie zarówno model ENM
 * (`Measurement.rating`, aparat pola), jak i projekcje gotowe z backendu (domena nN,
 * szablony pól z katalogu) — warstwa projekcji nie może importować modelu sieci ENM
 * (`lv_domain_projection_guard` R4), więc wspólny kształt tabliczki żyje tutaj.
 */

/** Przeznaczenie rdzenia CT / uzwojenia VT — lustro `przekladniki.PrzeznaczenieRdzenia`. */
export type PrzeznaczenieRdzenia =
  | 'ROZLICZENIE'
  | 'POMIAR'
  | 'JAKOSC_ENERGII'
  | 'REGULACJA'
  | 'ZABEZPIECZENIA'
  | 'ROZNICOWE';

/** Rdzeń przekładnika prądowego (tabliczka IEC 61869-2) — lustro
 *  `network_model/catalog/przekladniki.RdzenPrzekladnikaPradowego`. ALF wyprowadza backend z klasy. */
export interface RdzenPrzekladnikaPradowego {
  przekladnia: string;
  moc_va: number;
  klasa: string;
  /** Współczynnik bezpieczeństwa przyrządowego — wyłącznie rdzeń pomiarowy. */
  fs?: number | null;
  przeznaczenie: PrzeznaczenieRdzenia[];
}

/** Uzwojenie wtórne przekładnika napięciowego (tabliczka IEC 61869-3) — lustro
 *  `przekladniki.UzwojeniePrzekladnikaNapieciowego`. */
export interface UzwojeniePrzekladnikaNapieciowego {
  przekladnia: string;
  moc_va: number;
  klasa: string;
  przeznaczenie: PrzeznaczenieRdzenia[];
  /** Uzwojenie resztkowe w otwartym trójkącie (pomiar 3U0). */
  otwarty_trojkat?: boolean;
}
