/*
 * EkranRozplywu — kompozycja okna „Rozpływ mocy" (karta E8.3, dopełnienie
 * W-603): podzakładki Szyny/Gałęzie NAD dwiema konkretyzacjami wspólnego
 * wzorca ekranu analizy (`TabelaSzyn` karta E8.1, `TabelaGalezi` karta E8.3).
 * Roving tabindex — wzór zakładek `ui2/spaces/wyniki/WynikiWarsztat.tsx`.
 *
 * `TabelaSzyn` pozostaje NIETKNIĘTY i eksportowany osobno (zgodność z
 * istniejącymi testami, które renderują go samodzielnie bez podzakładek);
 * ten komponent jest NOWĄ nadrzędną kompozycją — decyzja wykonawcy karty §3
 * („najlepiej nowy komponent nadrzędny”). Domyślna podzakładka: Szyny (bez
 * zaskakującego przełączania względem zachowania sprzed karty E8.3).
 */

import { useState } from 'react';
import type { AdvancementMode } from '../../shell/modeModel';
import { TabelaGalezi } from './TabelaGalezi';
import { TabelaSzyn } from './TabelaSzyn';
import { ROZPLYW_STRINGS } from './strings';
import './rozplyw.css';

const PODZAKLADKI = [
  { id: 'szyny', etykieta: ROZPLYW_STRINGS.podzakladkaSzyny },
  { id: 'galezie', etykieta: ROZPLYW_STRINGS.podzakladkaGalezie },
] as const;

type PodzakladkaId = (typeof PODZAKLADKI)[number]['id'];

export interface EkranRozplywuProps {
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
  onEksport?: () => void;
}

export function EkranRozplywu({ trybZaawansowania, onOtworzDowod, onEksport }: EkranRozplywuProps) {
  const [podzakladka, setPodzakladka] = useState<PodzakladkaId>('szyny');

  return (
    <div className="mvd-rozplyw-ekran" data-testid="mvd-rozplyw-ekran">
      <div
        role="tablist"
        aria-label={ROZPLYW_STRINGS.ariaPodzakladki}
        className="mvd-rozplyw-podzakladki"
      >
        {PODZAKLADKI.map((z) => (
          <button
            key={z.id}
            role="tab"
            type="button"
            aria-selected={podzakladka === z.id}
            tabIndex={podzakladka === z.id ? 0 : -1}
            className={
              podzakladka === z.id
                ? 'mvd-rozplyw-podzakladka mvd-on'
                : 'mvd-rozplyw-podzakladka'
            }
            data-testid={`mvd-rozplyw-podzakladka-${z.id}`}
            onClick={() => setPodzakladka(z.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const idx = PODZAKLADKI.findIndex((x) => x.id === podzakladka);
                const krok = e.key === 'ArrowRight' ? 1 : PODZAKLADKI.length - 1;
                setPodzakladka(PODZAKLADKI[(idx + krok) % PODZAKLADKI.length].id);
              }
            }}
          >
            {z.etykieta}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mvd-rozplyw-podzakladki-tresc">
        {podzakladka === 'szyny' && (
          <TabelaSzyn
            trybZaawansowania={trybZaawansowania}
            onOtworzDowod={onOtworzDowod}
            onEksport={onEksport}
          />
        )}
        {podzakladka === 'galezie' && (
          <TabelaGalezi
            trybZaawansowania={trybZaawansowania}
            onOtworzDowod={onOtworzDowod}
            onEksport={onEksport}
          />
        )}
      </div>
    </div>
  );
}
