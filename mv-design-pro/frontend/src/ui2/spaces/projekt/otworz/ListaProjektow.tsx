/*
 * Lista istniejących projektów (W-102, karta E2.2) — tabela: nazwa, ostatnia
 * zmiana. Gramatyka MODEL_INTERAKCJI §2: 1× klik / `↑` `↓` `Home` `End` =
 * selekcja (roving tabindex, wzorzec `nav/ContextTree.tsx`), 2× klik /
 * `Enter` = otwarcie. Przycisk „Otwórz" daje tę samą operację jawnie —
 * dla wyboru myszą bez podwójnego kliku (dostępność). W pełni sterowana
 * propsami, zero store'ów, zero API.
 *
 * Stany (karta §3): ładowanie (`ladowanie`), pusta lista (`projekty.length
 * === 0`), gotowa (tabela). `Esc` nie dotyczy — brak dialogu (karta §3).
 */

import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { OTWORZ_STRINGS } from './strings';
import { formatCzasPrzebiegu } from '../strings';
import type { ProjektWiersz } from './adapters/projektyAdapter';

export interface ListaProjektowProps {
  projekty: ProjektWiersz[];
  /** Stan „ładowanie" (szkielet) — sterowany przez wołającego. */
  ladowanie?: boolean;
  zaznaczonyId: string | null;
  /** 1× klik / nawigacja klawiaturą = selekcja. */
  onZaznacz: (id: string) => void;
  /** 2× klik / `Enter` / przycisk „Otwórz" = otwarcie. */
  onOtworz: (id: string) => void;
}

export function ListaProjektow({
  projekty,
  ladowanie = false,
  zaznaczonyId,
  onZaznacz,
  onOtworz,
}: ListaProjektowProps) {
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  function idAt(indeks: number): string | null {
    return projekty[indeks]?.id ?? null;
  }

  function fokusuj(id: string) {
    onZaznacz(id);
    rowRefs.current.get(id)?.focus();
  }

  function obslugaKlawiszy(event: KeyboardEvent<HTMLTableRowElement>, id: string) {
    // Indeks liczony od wiersza, w którym faktycznie wystąpiło zdarzenie
    // klawiatury (parametr `id`) — nie od zewnętrznego `zaznaczonyId`, który
    // bywa `null` mimo że przeglądarka ma już fokus na pierwszym wierszu
    // (roving tabindex, wzorzec `nav/ContextTree.tsx`).
    const biezacyIndeks = projekty.findIndex((p) => p.id === id);
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const nastepny = idAt(biezacyIndeks + 1);
        if (nastepny) fokusuj(nastepny);
        return;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const poprzedni = idAt(biezacyIndeks - 1);
        if (poprzedni) fokusuj(poprzedni);
        return;
      }
      case 'Home': {
        event.preventDefault();
        const pierwszy = idAt(0);
        if (pierwszy) fokusuj(pierwszy);
        return;
      }
      case 'End': {
        event.preventDefault();
        const ostatni = idAt(projekty.length - 1);
        if (ostatni) fokusuj(ostatni);
        return;
      }
      case 'Enter': {
        event.preventDefault();
        onOtworz(id);
        return;
      }
      default:
        return;
    }
  }

  return (
    <section className="mvd-pulpit-cases" aria-label={OTWORZ_STRINGS.projektyTytul}>
      <div className="mvd-otworz-projekty-head">
        <h3 className="mvd-pulpit-cases-title">{OTWORZ_STRINGS.projektyTytul}</h3>
        <button
          type="button"
          className="mvd-btn mvd-btn-primary"
          disabled={!zaznaczonyId}
          onClick={() => {
            if (zaznaczonyId) onOtworz(zaznaczonyId);
          }}
        >
          {OTWORZ_STRINGS.otworz}
        </button>
      </div>

      {ladowanie ? (
        <p className="mvd-cases-empty" role="status">
          {OTWORZ_STRINGS.ladowanieProjektow}
        </p>
      ) : projekty.length === 0 ? (
        <p className="mvd-cases-empty">{OTWORZ_STRINGS.brakProjektow}</p>
      ) : (
        <div className="mvd-cases-scroll">
          <table className="mvd-cases-table">
            <thead>
              <tr>
                <th scope="col">{OTWORZ_STRINGS.kolNazwa}</th>
                <th scope="col">{OTWORZ_STRINGS.kolOstatniaZmiana}</th>
              </tr>
            </thead>
            <tbody>
              {projekty.map((p, indeks) => {
                const zaznaczony = p.id === zaznaczonyId;
                const wOgnisku = zaznaczonyId == null ? indeks === 0 : zaznaczony;
                return (
                  <tr
                    key={p.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(p.id, el);
                      else rowRefs.current.delete(p.id);
                    }}
                    className={zaznaczony ? 'mvd-cases-row mvd-on' : 'mvd-cases-row'}
                    aria-selected={zaznaczony}
                    tabIndex={wOgnisku ? 0 : -1}
                    onClick={() => onZaznacz(p.id)}
                    onDoubleClick={() => onOtworz(p.id)}
                    onKeyDown={(event) => obslugaKlawiszy(event, p.id)}
                  >
                    <td>{p.nazwa}</td>
                    <td className="mvd-cases-time">{formatCzasPrzebiegu(p.ostatniaZmianaISO)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
