/**
 * Warsztat przestrzeni „Wyniki" (scalenia U3 #1–#3, zarządca) — wygaszanie
 * mostu wyników okno po oknie: „Rozpływ mocy" (TabelaSzyn, karta E8.1),
 * „Zwarcia" (EkranZwarc, karta E8.2) i „Dowód obliczeń" (PrzegladDowodu,
 * karta E9.1) to okna nowej powłoki; „Pozostałe analizy" to slot mostu
 * (powierzchnia trasowa #analysis — zabezpieczenia, porównania, E10+).
 *
 * Zakładka startowa wg rodzaju aktywnego przebiegu (rozpływ/zwarcie/most);
 * wyliczana przy montażu — bez zaskakującego przełączania w trakcie pracy.
 * 2×klik na wartości z dowodem przełącza na zakładkę „Dowód obliczeń"
 * (okno E9.1; fokus kroku wg elementu = TODO-KARTA w DowodPrzebiegu).
 *
 * Założenia przebiegu zwarciowego (współczynnik c, czas cieplny) pochodzą
 * z konfiguracji AKTYWNEGO przypadku obliczeniowego — przekazywane tylko, gdy
 * aktywny przebieg należy do aktywnego przypadku (inaczej „—", zero zgadywania).
 */
import { useState, type ReactNode } from 'react';

import type { AdvancementMode } from '../../shell/modeModel';
import { EkranRozplywu } from '../../wyniki/rozplyw';
import { EkranZwarc } from '../../wyniki/zwarcia';
import { useAppStateStore } from '../../../ui/app-state';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import { EkranZdolnosci, MacierzNcRfg, PulpitOze } from '../../oze';
import { EkranJakosci } from '../../wyniki/jakosc';
import { EkranPorownania } from '../../wyniki/porownanie';
import { DowodPrzebiegu } from './DowodPrzebiegu';
import { useWpiecieWynikow } from './useWpiecieWynikow';
import { WYNIKI_WARSZTAT_STRINGS as T } from './strings';
import './wynikiWarsztat.css';

const ZAKLADKI = [
  { id: 'rozplyw', etykieta: T.zakladkaRozplyw },
  { id: 'zwarcia', etykieta: T.zakladkaZwarcia },
  { id: 'dowod', etykieta: T.zakladkaDowod },
  { id: 'jakosc', etykieta: T.zakladkaJakosc },
  { id: 'porownanie', etykieta: T.zakladkaPorownanie },
  { id: 'ncrfg', etykieta: T.zakladkaNcRfg },
  { id: 'pulpit-oze', etykieta: T.zakladkaPulpitOze },
  { id: 'zdolnosc', etykieta: T.zakladkaZdolnosc },
  { id: 'pozostale', etykieta: T.zakladkaPozostale },
] as const;

type ZakladkaId = (typeof ZAKLADKI)[number]['id'];

export interface WynikiWarsztatProps {
  trybZaawansowania: AdvancementMode;
  /** Zawartość zakładki „Pozostałe analizy" (most — LegacySurface). */
  pozostale: ReactNode;
  /** Nawigacja do przestrzeni „Dokumentacja" (pulpit OZE — decyzja AppRoot). */
  onOtworzDokumentacje: () => void;
}

/** Parametry zwarciowe konfiguracji aktywnego przypadku — tylko gdy aktywny
 * przebieg należy do tego przypadku (uczciwość źródła danych). */
function useZalozeniaZwarcioweAktywnegoPrzypadku(): {
  wspolczynnikC?: number;
  czasCieplnyS?: number;
} {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const activeCase = useStudyCasesStore((s) => s.activeCase);
  const przebieg = activeRunId ? przebiegi.find((r) => r.id === activeRunId) : undefined;
  if (!przebieg || !activeCase || przebieg.study_case_id !== activeCase.id) return {};
  return {
    wspolczynnikC: activeCase.config?.c_factor_max ?? undefined,
    czasCieplnyS: activeCase.config?.thermal_time_seconds ?? undefined,
  };
}

/** Porównanie A/B (E12.1) dla aktywnego projektu — bez projektu uczciwy stan pusty. */
function PorownanieAktywnegoProjektu({ trybZaawansowania }: { trybZaawansowania: AdvancementMode }) {
  const projektId = useAppStateStore((s) => s.activeProjectId);
  if (!projektId) {
    return (
      <p className="mvd-wyniki-pusty" data-testid="mvd-wyniki-porownanie-bez-projektu">
        {T.porownanieBezProjektu}
      </p>
    );
  }
  return <EkranPorownania projektId={projektId} trybZaawansowania={trybZaawansowania} />;
}

export function WynikiWarsztat({
  trybZaawansowania,
  pozostale,
  onOtworzDokumentacje,
}: WynikiWarsztatProps) {
  const { aktywnyRodzaj } = useWpiecieWynikow();
  const [zakladka, setZakladka] = useState<ZakladkaId>(
    aktywnyRodzaj === 'rozplyw' ? 'rozplyw' : aktywnyRodzaj === 'zwarcie' ? 'zwarcia' : 'pozostale',
  );
  const zalozeniaZwarciowe = useZalozeniaZwarcioweAktywnegoPrzypadku();

  // 2×klik na wartości z dowodem → zakładka „Dowód obliczeń" (okno E9.1).
  const otworzDowod = (_ref: string) => {
    setZakladka('dowod');
  };

  return (
    <div className="mvd-wyniki-warsztat" data-testid="mvd-wyniki-warsztat">
      <div role="tablist" aria-label={T.ariaZakladki} className="mvd-wyniki-zakladki">
        {ZAKLADKI.map((z) => (
          <button
            key={z.id}
            role="tab"
            type="button"
            aria-selected={zakladka === z.id}
            tabIndex={zakladka === z.id ? 0 : -1}
            className={zakladka === z.id ? 'mvd-wyniki-zakladka mvd-on' : 'mvd-wyniki-zakladka'}
            data-testid={`mvd-wyniki-zakladka-${z.id}`}
            onClick={() => setZakladka(z.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const idx = ZAKLADKI.findIndex((x) => x.id === zakladka);
                const krok = e.key === 'ArrowRight' ? 1 : ZAKLADKI.length - 1;
                setZakladka(ZAKLADKI[(idx + krok) % ZAKLADKI.length].id);
              }
            }}
          >
            {z.etykieta}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mvd-wyniki-tresc">
        {zakladka === 'rozplyw' && (
          <EkranRozplywu trybZaawansowania={trybZaawansowania} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'zwarcia' && (
          <EkranZwarc
            trybZaawansowania={trybZaawansowania}
            onOtworzDowod={otworzDowod}
            wspolczynnikC={zalozeniaZwarciowe.wspolczynnikC}
            czasCieplnyS={zalozeniaZwarciowe.czasCieplnyS}
          />
        )}
        {zakladka === 'dowod' && <DowodPrzebiegu trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'jakosc' && (
          <EkranJakosci trybZaawansowania={trybZaawansowania} onOtworzDowod={otworzDowod} />
        )}
        {zakladka === 'porownanie' && <PorownanieAktywnegoProjektu trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'ncrfg' && <MacierzNcRfg trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'zdolnosc' && <EkranZdolnosci trybZaawansowania={trybZaawansowania} />}
        {zakladka === 'pulpit-oze' && (
          <PulpitOze
            trybZaawansowania={trybZaawansowania}
            onNawiguj={() => onOtworzDokumentacje()}
          />
        )}
        {zakladka === 'pozostale' && pozostale}
      </div>
    </div>
  );
}
