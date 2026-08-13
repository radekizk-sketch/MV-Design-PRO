/*
 * MAPA PROCESU — oś E1–E8 renderowana WYŁĄCZNIE z kanonicznego rejestru
 * `ETAPY` (`etapy.ts`). Komponent nie ma własnej listy etapów ani własnej
 * kolejności: każdy etap kanonu trafia na mapę i nic poza kanonem na mapie nie
 * występuje (równość dwustronna pilnowana testem `mapaProcesu.test.tsx`).
 *
 * CO MAPA MÓWI, A CZEGO NIE MÓWI. Mapa pokazuje sekwencję etapów i wskazuje
 * etap BIEŻĄCY — ten wyznaczony regułą następnej akcji z kontraktu gotowości.
 * Mapa świadomie NIE maluje „ukończenia" etapów: pulpit nie ma dla etapów E6–E8
 * mierzalnego sygnału w store'ach read-only, a malowanie ukończenia bez sygnału
 * byłoby fabrykacją stanu projektu. Mierzalny stan (model, gotowość, ostatni
 * przebieg, spójność) pokazują kafle pulpitu, każdy z własnym źródłem.
 *
 * Każdy etap jest klikalny i prowadzi do przestrzeni z rejestru — nie ma tu
 * martwych klików ani pozycji bez celu.
 */

import './proces.css';
import type { SpaceId } from '../shell/spaces';
import { ETAPY, type EtapId } from './etapy';
import { PROCES_STRINGS } from './strings';

export interface MapaProcesuProps {
  /** Etap bieżący — z reguły następnej akcji (jedyne źródło wskazania). */
  etapBiezacy: EtapId;
  /** Klik etapu → nawigacja do przestrzeni etapu. */
  onWybierzEtap: (przestrzen: SpaceId, etap: EtapId) => void;
}

export function MapaProcesu({ etapBiezacy, onWybierzEtap }: MapaProcesuProps) {
  return (
    <nav className="mvd-proces" aria-label={PROCES_STRINGS.mapaTytul} data-testid="mvd-proces-mapa">
      <span className="mvd-proces-lbl">{PROCES_STRINGS.mapaTytul}</span>
      <ol className="mvd-proces-tor">
        {ETAPY.map((etap) => {
          const biezacy = etap.id === etapBiezacy;
          return (
            <li key={etap.id} className="mvd-proces-el">
              <button
                type="button"
                className={`mvd-proces-krok${biezacy ? ' mvd-proces-krok-biezacy' : ''}`}
                aria-current={biezacy ? 'step' : undefined}
                title={etap.cel}
                data-testid={`mvd-proces-krok-${etap.id}`}
                onClick={() => onWybierzEtap(etap.przestrzen, etap.id)}
              >
                <span className="mvd-proces-krok-nr mvd-num">{etap.id}</span>
                <span className="mvd-proces-krok-nazwa">{etap.nazwa}</span>
                {biezacy && (
                  <span className="mvd-sr-only">{PROCES_STRINGS.mapaBiezacyOpis}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mvd-proces-opis">{PROCES_STRINGS.mapaOpis}</p>
    </nav>
  );
}
