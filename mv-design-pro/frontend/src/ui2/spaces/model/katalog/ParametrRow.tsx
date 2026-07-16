/**
 * ParametrRow — wiersz parametru karty technicznej.
 *
 * Renderuje: symbol branżowy + etykieta PL + definicja (drobnym drukiem)
 * oraz wartość mono z jednostką. Wartości liczbowe formatowane kanonicznym
 * `formatPolishValue` (separator PL, brak → „—").
 *
 * Wzorzec „mono z jednostkami" jak w inspektorze — brak `ui2/inspector/ValueRow`
 * w bazie, więc komponent jest samodzielny w obrębie modułu katalog.
 */

import { formatPolishValue } from '../../../../ui/shared/formatPolishValue';
import type { DefinicjaParametru } from './types';

export interface ParametrRowProps {
  definicja: DefinicjaParametru;
  wartosc: unknown;
}

/** Formatuje wartość wg typu definicji (liczba → mono z jednostką; tekst → dosłownie). */
export function formatujWartosc(definicja: DefinicjaParametru, wartosc: unknown): string {
  if (definicja.typ === 'tekst') {
    if (typeof wartosc === 'string' && wartosc.trim().length > 0) {
      return wartosc;
    }
    return '—';
  }
  const liczba = typeof wartosc === 'number' ? wartosc : null;
  return formatPolishValue(liczba, {
    decimals: definicja.miejscaDziesietne ?? 2,
    unit: definicja.jednostka || undefined,
    placeholder: 'long',
  });
}

export function ParametrRow({ definicja, wartosc }: ParametrRowProps): JSX.Element {
  const tekstWartosci = formatujWartosc(definicja, wartosc);
  return (
    <div className="mvd-katalog__param" data-pole={definicja.symbol}>
      <div>
        <span className="mvd-katalog__param-symbol">{definicja.symbol}</span>
        <span>{definicja.etykieta}</span>
        <span className="mvd-katalog__param-def">
          {definicja.definicja} ({definicja.norma})
        </span>
      </div>
      <span className="mvd-katalog__param-wartosc">{tekstWartosci}</span>
    </div>
  );
}
