/*
 * Zakładka „Wyniki" panelu dolnego (karta UI-02 PANEL-DOLNY; kontrakt UI-02 §2 i UI-17:
 * wynik w kontekście elementu, tabela wszystkich elementów — bez opuszczania schematu).
 *
 * Tabela wszystkich elementów biegu OGLĄDANEGO (karta K8: magazyn kontekstu wyniku —
 * ten sam bieg co schemat, pasek stanu, inspektor i „Dowody"; wybór biegu tutaj
 * zmienia go wszędzie). Wiersze i kolumny buduje czysta
 * projekcja `tabelaWynikowPanelu.ts` z wyniku `results/v1` wskazanego biegu, tabelę
 * renderuje wspólny wzorzec `TabelaWynikow` (sortowanie, wybór wiersza) — bez trzeciej
 * tabeli. Pojedynczy klik wiersza zaznacza element TĄ SAMĄ ścieżką co „Problemy"
 * (`onWybierzElement` → `zaznaczElementModelu`: schemat + inspektor); wiersz
 * zaznaczonego elementu jest wyróżniony (jedno zaznaczenie z `useSelectionStore`).
 *
 * Świeżość: JEDEN predykat `kontekstWyniku.swiezoscBiegu` (rewizja biegu ≠ rewizja
 * bieżąca ⇒ nieaktualny; werdykt serwera przypadku jest daną wejściową) = baner
 * „nieaktualne" i przygaszona tabela. Rewizja nieznana = jawny komunikat, nie
 * werdykt „aktualne". Zaznaczenie elementu na schemacie podświetla i PRZEWIJA do
 * widoku jego wiersz (wspólny wzorzec `TabelaWynikow`).
 */
import { useMemo, useState } from 'react';

import { useSelectionStore } from '../../../ui/selection/store';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  ETYKIETA_RODZINY,
  etykietaBiegu,
  rodzinaAnalizy,
  useKontekstWynikuStore,
  useSwiezoscBiegu,
  zdanieSwiezosci,
} from '../../wyniki/kontekst/kontekstWyniku';
import { TabelaWynikow } from '../../wyniki/wzorzec';
import '../../wyniki/wzorzec/wzorzec.css';
import { useShellStore } from '../useShellStore';
import type { KontekstPaneluDolnego } from './rejestrZakladek';
import {
  KOLUMNA_IDENTYFIKATOR,
  filtrujWiersze,
  zbudujTabeleWynikow,
} from './tabelaWynikowPanelu';
import { useBiegWynikowPanelu } from './wynikiPanelu';

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
  const wybierzBieg = useKontekstWynikuStore((s) => s.wybierzBieg);
  const ponow = useKontekstWynikuStore((s) => s.ponowWynik);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const swiezosc = useSwiezoscBiegu(bieg);
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

  const nieaktualne = swiezosc?.stan === 'nieaktualny';
  const rodzina = rodzinaAnalizy(bieg.analysis_type);

  return (
    <div
      className="mvd-dolny-wyniki"
      data-testid="mvd-wyniki"
      data-run-id={bieg.id}
      data-rodzina={rodzina ?? undefined}
      data-swiezosc={swiezosc?.stan}
    >
      <div className="mvd-dolny-narzedzia">
        <label className="mvd-dolny-pole">
          <span>{rodzina ? `Przebieg (${ETYKIETA_RODZINY[rodzina]} na schemacie)` : 'Przebieg'}</span>
          <select
            value={bieg.id}
            onChange={(e) => wybierzBieg(e.target.value, 'panel')}
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

      {swiezosc?.stan === 'nieznany' && (
        <p className="mvd-dolny-stan" data-testid="mvd-wyniki-swiezosc-nieznana">
          {zdanieSwiezosci(swiezosc)}
        </p>
      )}
      {swiezosc && nieaktualne && (
        <p className="mvd-dolny-baner" role="status" data-testid="mvd-wyniki-nieaktualne">
          {`Wynik nieaktualny względem modelu: ${zdanieSwiezosci(swiezosc)} Przelicz, aby zobaczyć stan bieżącego modelu.`}
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
