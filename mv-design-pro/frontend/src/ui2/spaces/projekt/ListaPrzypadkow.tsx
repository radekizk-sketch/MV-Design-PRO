/*
 * Lista przypadków obliczeniowych (W-101) — tabela: przypadek, konfiguracja,
 * status wyników, ostatni przebieg. W pełni sterowana propsami (wiersze z
 * `mapujPrzypadki`). Gramatyka MODEL_INTERAKCJI §2: klik = selekcja
 * (`onZaznaczPrzypadek`), 2× klik = otwarcie (`onOtworzPrzypadek`). Liczby/czasy
 * `tabular-nums`. Słownik V12K-026: „przypadek obliczeniowy" dozwolone w ui2.
 */

import { Tag } from './Kafel';
import type { WariantTagu } from './Kafel';
import { PULPIT_STRINGS, STATUS_WYNIKOW_LABEL, formatCzasPrzebiegu } from './strings';
import type { PrzypadekWiersz } from './pulpitAdapter';
import type { StudyCaseResultStatus } from '../../../ui/study-cases/types';

const STATUS_WARIANT: Record<StudyCaseResultStatus, WariantTagu> = {
  NONE: 'mut',
  FRESH: 'ok',
  OUTDATED: 'warn',
};

interface ListaPrzypadkowProps {
  wiersze: PrzypadekWiersz[];
  zaznaczonyId?: string | null;
  onZaznaczPrzypadek: (id: string) => void;
  onOtworzPrzypadek: (id: string) => void;
}

export function ListaPrzypadkow({
  wiersze,
  zaznaczonyId,
  onZaznaczPrzypadek,
  onOtworzPrzypadek,
}: ListaPrzypadkowProps) {
  return (
    <section className="mvd-pulpit-cases" aria-label={PULPIT_STRINGS.przypadkiTytul}>
      <h3 className="mvd-pulpit-cases-title">{PULPIT_STRINGS.przypadkiTytul}</h3>
      {wiersze.length === 0 ? (
        <p className="mvd-cases-empty">{PULPIT_STRINGS.brakPrzypadkow}</p>
      ) : (
        <div className="mvd-cases-scroll">
          <table className="mvd-cases-table">
            <thead>
              <tr>
                <th>{PULPIT_STRINGS.kolPrzypadek}</th>
                <th>{PULPIT_STRINGS.kolKonfiguracja}</th>
                <th>{PULPIT_STRINGS.kolWyniki}</th>
                <th>{PULPIT_STRINGS.kolOstatniPrzebieg}</th>
              </tr>
            </thead>
            <tbody>
              {wiersze.map((w) => (
                <tr
                  key={w.id}
                  className={`mvd-cases-row${zaznaczonyId === w.id ? ' mvd-on' : ''}`}
                  aria-selected={zaznaczonyId === w.id}
                  onClick={() => onZaznaczPrzypadek(w.id)}
                  onDoubleClick={() => onOtworzPrzypadek(w.id)}
                >
                  <td>
                    <span className="mvd-cases-name">{w.nazwa}</span>
                    {w.aktywny && (
                      <span className="mvd-cases-active">{PULPIT_STRINGS.aktywny}</span>
                    )}
                  </td>
                  <td>{w.konfiguracja}</td>
                  <td>
                    <Tag wariant={STATUS_WARIANT[w.statusWynikow]}>
                      {STATUS_WYNIKOW_LABEL[w.statusWynikow]}
                    </Tag>
                  </td>
                  <td className="mvd-cases-time">
                    {formatCzasPrzebiegu(w.ostatniPrzebiegISO)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
