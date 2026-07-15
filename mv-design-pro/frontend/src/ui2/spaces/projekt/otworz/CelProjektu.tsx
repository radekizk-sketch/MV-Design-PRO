/*
 * Cel projektu (W-102, karta E2.2; `AUDYT_RADY_SPECJALISTOW_2026-07.md`
 * W-102: „start od celu"). Cztery kafle wyboru — wybór ustawia domyślną
 * przestrzeń, przykłady i tryb zaawansowania (decyzja u wołającego; ten
 * komponent wyłącznie zgłasza wybór przez `onWybierzCel`, bez nawigacji ani
 * efektów ubocznych — w pełni sterowany propsami).
 *
 * Kafle reużywają wspólną powłokę `Kafel` (`../Kafel.tsx`, karta E2.1) —
 * klikalny kafel renderuje się jako `<button>` (gramatyka MODEL_INTERAKCJI
 * §2: kafel → wybór).
 */

import { Kafel } from '../Kafel';
import { OTWORZ_STRINGS } from './strings';

/** Cel pracy inżyniera (audyt W-102) — identyfikator wewnętrzny, nie tekst UI. */
export type CelProjektuId = 'nowa-siec' | 'przylaczenie-oze' | 'rozbudowa' | 'audyt';

interface CelDane {
  cel: CelProjektuId;
  tytul: string;
  opis: string;
}

const CELE: readonly CelDane[] = [
  { cel: 'nowa-siec', tytul: OTWORZ_STRINGS.celNowaSiec, opis: OTWORZ_STRINGS.celNowaSiecOpis },
  {
    cel: 'przylaczenie-oze',
    tytul: OTWORZ_STRINGS.celPrzylaczenieOze,
    opis: OTWORZ_STRINGS.celPrzylaczenieOzeOpis,
  },
  { cel: 'rozbudowa', tytul: OTWORZ_STRINGS.celRozbudowa, opis: OTWORZ_STRINGS.celRozbudowaOpis },
  { cel: 'audyt', tytul: OTWORZ_STRINGS.celAudyt, opis: OTWORZ_STRINGS.celAudytOpis },
];

export interface CelProjektuProps {
  /** Wybór celu (klik kafla) — decyzję o nawigacji/domyślnej przestrzeni podejmuje wołający. */
  onWybierzCel: (cel: CelProjektuId) => void;
}

export function CelProjektu({ onWybierzCel }: CelProjektuProps) {
  return (
    <section className="mvd-otworz-cel" aria-label={OTWORZ_STRINGS.celTytul}>
      <h3 className="mvd-pulpit-cases-title">{OTWORZ_STRINGS.celTytul}</h3>
      <p className="mvd-otworz-cel-konsekwencja">{OTWORZ_STRINGS.celKonsekwencja}</p>
      <div className="mvd-otworz-cel-grid">
        {CELE.map((c) => (
          <Kafel
            key={c.cel}
            tytul={c.tytul}
            onKlik={() => onWybierzCel(c.cel)}
            ariaLabel={`${c.tytul}. ${c.opis}`}
          >
            <p className="mvd-otworz-cel-opis">{c.opis}</p>
          </Kafel>
        ))}
      </div>
    </section>
  );
}
