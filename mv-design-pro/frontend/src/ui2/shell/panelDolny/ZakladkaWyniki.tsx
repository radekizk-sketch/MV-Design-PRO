/*
 * Zakładka „Wyniki" panelu dolnego (karta UI-02 PANEL-DOLNY; kontrakt UI-02 §2 i UI-17:
 * wynik w kontekście elementu, tabela wszystkich elementów — bez opuszczania schematu).
 *
 * Tabela wszystkich elementów zakończonego biegu aktywnego zakresu (domyślnie
 * najnowszego; wybór biegu, gdy jest ich kilka). Wiersze i kolumny buduje czysta
 * projekcja `tabelaWynikowPanelu.ts` z wyniku `results/v1` wskazanego biegu, tabelę
 * renderuje wspólny wzorzec `TabelaWynikow` (sortowanie, wybór wiersza) — bez trzeciej
 * tabeli. Pojedynczy klik wiersza zaznacza element TĄ SAMĄ ścieżką co „Problemy"
 * (`onWybierzElement` → `zaznaczElementModelu`: schemat + inspektor); wiersz
 * zaznaczonego elementu jest wyróżniony (jedno zaznaczenie z `useSelectionStore`).
 *
 * Świeżość: bieg niesie rewizję modelu, na której go policzono (`model_revision`);
 * rozjazd z bieżącą rewizją (`rewizjaBiezacegoModelu`) = baner „nieaktualne" z opisem
 * `opisSwiezosci` i przygaszona tabela. Rewizja nieznana = jawny komunikat, nie
 * werdykt „aktualne".
 */
import { useMemo, useState } from 'react';

import { useSelectionStore } from '../../../ui/selection/store';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { opisSwiezosci, type OpisSwiezosci } from '../../freshness';
import { etykietaAnalizy, formatCzas } from '../../spaces/obliczenia/przebiegi/strings';
import { TabelaWynikow } from '../../wyniki/wzorzec';
import '../../wyniki/wzorzec/wzorzec.css';
import { useShellStore } from '../useShellStore';
import type { KontekstPaneluDolnego } from './rejestrZakladek';
import {
  KOLUMNA_IDENTYFIKATOR,
  filtrujWiersze,
  zbudujTabeleWynikow,
} from './tabelaWynikowPanelu';
import { useBiegWynikowPanelu, useWynikiPaneluStore } from './wynikiPanelu';

/** Świeżość wyniku JEDNEGO biegu względem bieżącej rewizji modelu; `null` = nie do oceny. */
export function swiezoscBiegu(run: ExecutionRun, rewizjaModelu: number | null): OpisSwiezosci | null {
  const rewizjaDanej = run.model_revision;
  if (typeof rewizjaDanej !== 'number' || typeof rewizjaModelu !== 'number') return null;
  if (rewizjaDanej === rewizjaModelu) {
    return { stan: 'aktualne', rewizjaDanej, rewizjaModelu };
  }
  return { stan: 'nieaktualne', rewizjaDanej, rewizjaModelu, przyczyna: 'model-zmieniony' };
}

export function etykietaBiegu(run: ExecutionRun): string {
  return `${etykietaAnalizy(run.analysis_type)} · ${formatCzas(run.finished_at ?? run.started_at)}`;
}

/** Licznik zakładki: liczba elementów wyniku pokazywanego biegu (gdy wynik jest wczytany). */
export function LicznikWynikow() {
  const { stan } = useBiegWynikowPanelu();
  if (stan?.rodzaj !== 'gotowe') return null;
  return (
    <span className="mvd-bottom-licznik mvd-num" data-testid="mvd-bottom-licznik-wyniki">
      {Object.keys(stan.wynik.elementy).length}
    </span>
  );
}

export function ZakladkaWyniki({ onWybierzElement }: KontekstPaneluDolnego) {
  const { biegi, bieg, stan } = useBiegWynikowPanelu();
  const wybierzBieg = useWynikiPaneluStore((s) => s.wybierzBieg);
  const ponow = useWynikiPaneluStore((s) => s.ponow);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const rewizjaModelu = useSnapshotStore((s) => s.rewizjaBiezacegoModelu);
  const szczegolyAudytowe = useShellStore((s) => s.szczegolyAudytowe);
  const zaznaczony = useSelectionStore((s) => s.selectedElement?.id ?? null);
  const [rodzaj, setRodzaj] = useState<string | null>(null);
  const [tekst, setTekst] = useState('');

  const tabela = useMemo(
    () => (stan?.rodzaj === 'gotowe' ? zbudujTabeleWynikow(stan.wynik.elementy, snapshot) : null),
    [stan, snapshot],
  );
  // Rodzaj spoza bieżącej tabeli (po zmianie biegu) nie może ukryć wszystkich wierszy.
  const rodzajFiltra = rodzaj !== null && tabela?.rodzaje.includes(rodzaj) ? rodzaj : null;
  const widoczne = useMemo(
    () => (tabela ? filtrujWiersze(tabela.wiersze, { rodzaj: rodzajFiltra, tekst }) : []),
    [tabela, rodzajFiltra, tekst],
  );

  if (!bieg) {
    return (
      <p className="mvd-dolny-stan" data-testid="mvd-wyniki-brak">
        Brak wyników — aktywny zakres nie ma zakończonego przebiegu. Uruchom obliczenie przyciskiem „Oblicz".
      </p>
    );
  }

  const swiezosc = swiezoscBiegu(bieg, rewizjaModelu);
  const nieaktualne = swiezosc?.stan === 'nieaktualne';

  return (
    <div className="mvd-dolny-wyniki" data-testid="mvd-wyniki">
      <div className="mvd-dolny-narzedzia">
        <label className="mvd-dolny-pole">
          <span>Przebieg</span>
          <select
            value={bieg.id}
            onChange={(e) => wybierzBieg(e.target.value)}
            disabled={biegi.length < 2}
            data-testid="mvd-wyniki-bieg"
          >
            {biegi.map((run) => (
              <option key={run.id} value={run.id}>
                {etykietaBiegu(run)}
              </option>
            ))}
          </select>
        </label>
        <label className="mvd-dolny-pole">
          <span>Rodzaj</span>
          <select
            value={rodzajFiltra ?? ''}
            onChange={(e) => setRodzaj(e.target.value === '' ? null : e.target.value)}
            disabled={!tabela}
            data-testid="mvd-wyniki-filtr-rodzaj"
          >
            <option value="">Wszystkie rodzaje</option>
            {(tabela?.rodzaje ?? []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="mvd-dolny-pole">
          <span>Szukaj</span>
          <input
            type="search"
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            placeholder="Nazwa elementu"
            disabled={!tabela}
            data-testid="mvd-wyniki-filtr-tekst"
          />
        </label>
        {tabela && (
          <span className="mvd-dolny-licznik" data-testid="mvd-wyniki-liczba">
            {`${widoczne.length} z ${tabela.wiersze.length} elementów`}
          </span>
        )}
      </div>

      {swiezosc === null && (
        <p className="mvd-dolny-stan" data-testid="mvd-wyniki-swiezosc-nieznana">
          Świeżości wyniku nie da się ocenić — przebieg nie niesie rewizji modelu albo bieżąca rewizja nie jest znana.
        </p>
      )}
      {nieaktualne && (
        <p className="mvd-dolny-baner" role="status" data-testid="mvd-wyniki-nieaktualne">
          {`Wynik nieaktualny względem modelu: ${opisSwiezosci(swiezosc)}. Przelicz, aby zobaczyć stan bieżącego modelu.`}
        </p>
      )}

      {stan === null || stan.rodzaj === 'ladowanie' ? (
        <p className="mvd-dolny-stan" data-testid="mvd-wyniki-ladowanie">
          Wczytywanie wyników przebiegu…
        </p>
      ) : stan.rodzaj === 'blad' ? (
        <p className="mvd-dolny-stan mvd-dolny-blad" role="alert" data-testid="mvd-wyniki-blad">
          {`Nie udało się pobrać wyników przebiegu: ${stan.komunikat} `}
          <button type="button" className="mvd-dolny-akcja" onClick={() => ponow(bieg.id)}>
            Ponów
          </button>
        </p>
      ) : (
        tabela && (
          <>
            {tabela.nieznaneKody.length > 0 && (
              <p className="mvd-dolny-stan mvd-dolny-blad" role="alert" data-testid="mvd-wyniki-nieznane-kody">
                {`Wynik zawiera wielkości bez opisu w aplikacji (pominięte w tabeli): ${tabela.nieznaneKody.join(', ')}.`}
              </p>
            )}
            {tabela.wiersze.length === 0 ? (
              <p className="mvd-dolny-stan" data-testid="mvd-wyniki-pusty">
                Przebieg zakończył się bez wyników elementów.
              </p>
            ) : widoczne.length === 0 ? (
              <p className="mvd-dolny-stan" data-testid="mvd-wyniki-filtr-pusty">
                Żaden element nie spełnia filtru.
              </p>
            ) : (
              <div
                className={nieaktualne ? 'mvd-wyn mvd-dolny-tabela mvd-dolny-przygaszone' : 'mvd-wyn mvd-dolny-tabela'}
                data-testid="mvd-wyniki-tabela"
                data-nieaktualne={nieaktualne ? 'true' : 'false'}
              >
                <TabelaWynikow
                  kolumny={tabela.kolumny}
                  wiersze={widoczne}
                  szczegolyAudytowe={szczegolyAudytowe}
                  kluczWiersza={KOLUMNA_IDENTYFIKATOR}
                  onWybierzWiersz={onWybierzElement}
                  wybranyWiersz={zaznaczony}
                />
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
