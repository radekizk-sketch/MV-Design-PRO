/*
 * EKRAN ANALIZY — wspólny wzorzec okna wyników (karta E8.1 / W-606). JEDEN
 * reużywalny szkielet: nagłówek (analiza PL + świeżość + akcje) → ZAŁOŻENIA →
 * TABELA wyników → WYKRES (slot) → stopka (eksport). Fundament wszystkich okien
 * U3/U4 (rozpływ, zwarcia, analizy specjalne, OZE).
 *
 * W pełni sterowany propsami; zero fizyki, zero mutacji, zero wołań API/store'ów
 * (adaptery konkretnych analiz wywołują ten wzorzec — np. `rozplyw/TabelaSzyn`).
 * Znacznik świeżości = współdzielony `FreshnessBadge` z `ui2/inspector` (JEDYNY —
 * SPEC_POWIAZANIA §6.2): renderowany, gdy nagłówek niesie obie rewizje.
 * Identyfikator przebiegu — wyłącznie w trybie eksperckim, jako wyrażenie `{...}`.
 */

import './wzorzec.css';
import '../../inspector/inspector.css';
import { FreshnessBadge } from '../../inspector';
import { PanelCoSieZmienilo } from '../../freshness';
import { SekcjaZalozen } from './SekcjaZalozen';
import { TabelaWynikow } from './TabelaWynikow';
import { WZORZEC_STRINGS } from './strings';
import type { EkranAnalizyProps } from './wzorzecModel';

export function EkranAnalizy({
  naglowek,
  zalozenia,
  kolumny,
  wiersze,
  wykres,
  onOtworzDowod,
  onEksport,
  onPrzelicz,
  onPokazElement,
  trybZaawansowania,
  kluczWiersza,
  onWybierzWiersz,
  wybranyWiersz,
  onPoprawWModelu,
  wierszDecyzyjny,
  rodzajWiersza,
}: EkranAnalizyProps) {
  const { analizaPL, runId, rewizjaModelu, rewizjaDanych, caseId } = naglowek;
  const maSwiezosc = rewizjaModelu !== undefined && rewizjaDanych !== undefined;
  // V12K-264: przyczyny unieważnienia pokazujemy TYLKO wtedy, gdy wynik faktycznie
  // jest nieaktualny i wiadomo, o który wariant pracy zapytać. Panel przy aktualnym
  // wyniku byłby szumem, a bez `caseId` nie ma czego pytać — i to jest brak danej,
  // nie powód do zgadywania.
  const pokazPrzyczyny =
    maSwiezosc && caseId !== undefined && rewizjaDanych! < rewizjaModelu!;
  const trybEkspercki = trybZaawansowania === 'expert';

  return (
    <div className="mvd-wyn" data-testid="mvd-wyn-ekran">
      <header className="mvd-wyn-head" data-testid="mvd-wyn-naglowek">
        <h2 className="mvd-wyn-title">{analizaPL}</h2>
        {maSwiezosc && (
          <FreshnessBadge
            rewizjaDanej={rewizjaDanych}
            rewizjaModelu={rewizjaModelu}
            onPrzelicz={onPrzelicz}
          />
        )}
        {trybEkspercki && runId && (
          <span
            className="mvd-wyn-run mvd-num"
            aria-label={WZORZEC_STRINGS.identyfikatorPrzebiegu}
            data-testid="mvd-wyn-run-id"
          >
            {runId}
          </span>
        )}
        {onEksport && (
          <div className="mvd-wyn-akcje">
            <button
              type="button"
              className="mvd-btn"
              onClick={onEksport}
              data-mvd-action="eksport"
            >
              {WZORZEC_STRINGS.eksport}
            </button>
          </div>
        )}
      </header>

      {pokazPrzyczyny && (
        <PanelCoSieZmienilo
          caseId={caseId!}
          rewizjaDanych={rewizjaDanych!}
          onPokazElement={onPokazElement}
        />
      )}

      <SekcjaZalozen zalozenia={zalozenia} />

      <TabelaWynikow
        kolumny={kolumny}
        wiersze={wiersze}
        onOtworzDowod={onOtworzDowod}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={kluczWiersza}
        onWybierzWiersz={onWybierzWiersz}
        wybranyWiersz={wybranyWiersz}
        onPoprawWModelu={onPoprawWModelu}
        wierszDecyzyjny={wierszDecyzyjny}
        rodzajWiersza={rodzajWiersza}
      />

      {wykres && (
        <section className="mvd-wyn-wykres" data-testid="mvd-wyn-wykres" aria-label={WZORZEC_STRINGS.wykresTytul}>
          {wykres}
        </section>
      )}
    </div>
  );
}
