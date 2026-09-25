/**
 * EkranStabilnosci — REALNY dostawca ui2 ekranu kanonicznego E-32
 * „Stabilność dynamiczna" (karta P-3, FLOW §0.3 „kontrakt ekranu prowadzącego").
 *
 * UCZCIWOŚĆ (2026-09-23): bieg `dynamic_stability` nie rozwiązuje sieci — kąty mocy,
 * napięcie i częstotliwość po zwarciu oraz czas wyłączenia wpisuje użytkownik. Ekran
 * NIE wystawia werdyktu STABILNY/NIESTABILNY ani statusów kryteriów i nie opowiada
 * zadziałania zabezpieczeń. Rama:
 *  - nagłówek: eyebrow + JEDNO zdanie celu,
 *  - stan wejścia: brak zakończonego przebiegu DYNAMIC_STABILITY → formularz scenariusza,
 *  - OCENA: rekord `NIE_OCENIONO` z backendu (zdanie, czego brakuje, akcja naprawcza),
 *  - ZAŁOŻENIA i ECHO scenariusza (liczby wpisane przez użytkownika, bez porównań),
 *  - PRZEBIEG czasowy na żądanie z uwagą backendu (przebieg zadany),
 *  - ŚLAD AUTOMATYKI na żądanie: bez zdarzeń, efekt topologii ZADEKLAROWANY,
 *  - odesłanie do pełnego dowodu (`setWynikiTab('dowod', runId)`), raportowalność.
 *
 * Język inżyniera (karta #145): elementy nazwane mostem nazw wyników (`useNazwaObiektu`),
 * stan sieci i zakres wyłączeń z typowanych map polskich etykiet, statusy i ograniczenia
 * raportowe z pól `*_pl` backendu — ekran nie pokazuje referencji ani kodów.
 *
 * ZERO fizyki, ZERO progów w UI. Stylowanie wyłącznie tokenami --mvd-*.
 */

import { useMemo, useState } from 'react';
import './stabilnosc.css';
// Style wspólnego wzorca (SekcjaZalozen) — import jawny, bo ekran nie renderuje
// ramy `EkranAnalizy`, która normalnie wnosi ten arkusz.
import '../wzorzec/wzorzec.css';

import { useAppStateStore } from '../../../ui/app-state';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useShellStore } from '../../shell/useShellStore';
import { SekcjaZalozen, useNazwaObiektu } from '../wzorzec';
import { OcenaNiewykonana } from '../wzorzec/OcenaNiewykonana';
import { usePrzebiegStabilnosci, useWynikStabilnosci } from './api';
import { FormularzScenariusza } from './FormularzScenariusza';
import {
  ETYKIETY_STANU_SIECI,
  ETYKIETY_ZAKRESU_WYLACZEN,
  naEchoScenariusza,
  naSeriePrzebiegu,
  naZalozeniaStabilnosci,
  wybierzPrzebiegStabilnosci,
} from './model';
import { STABILNOSC_STRINGS as T } from './strings';
import { WykresPrzebieguChart } from './WykresPrzebieguChart';

function Stan({
  tytul,
  opis,
  akcja,
  onAkcja,
  tone,
  testid,
}: {
  tytul: string;
  opis: string;
  akcja?: string;
  onAkcja?: () => void;
  tone: 'idle' | 'loading' | 'error';
  testid: string;
}) {
  return (
    <div
      className="mvd-stabilnosc-stan"
      data-testid={testid}
      data-tone={tone}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <h4>{tytul}</h4>
      <p>{opis}</p>
      {akcja && onAkcja && (
        <button
          type="button"
          className="mvd-stabilnosc-akcja"
          data-testid={`${testid}-akcja`}
          onClick={onAkcja}
        >
          {akcja}
        </button>
      )}
    </div>
  );
}

export function EkranStabilnosci() {
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const clearRouteManagedSurface = useNetworkBuildStore((s) => s.clearRouteManagedSurface);
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const [sladWidoczny, setSladWidoczny] = useState(false);
  const [przebiegWidoczny, setPrzebiegWidoczny] = useState(false);
  const nazwaObiektu = useNazwaObiektu();

  const przebieg = useMemo(
    () => wybierzPrzebiegStabilnosci(przebiegi, activeRunId),
    [przebiegi, activeRunId],
  );
  const dane = useWynikStabilnosci(przebieg?.id ?? null);
  const wiersz = dane?.wiersz ?? null;

  // Przebieg czasowy — ładowany NA ŻĄDANIE (klik „Pokaż przebieg").
  const przebiegDane = usePrzebiegStabilnosci(przebieg?.id ?? null, przebiegWidoczny);
  const punktyPrzebiegu = przebiegDane?.przebieg?.points ?? [];
  const seriePrzebiegu = naSeriePrzebiegu(przebiegDane?.przebieg?.quantities ?? []);
  const maSzereg =
    przebiegDane?.stan === 'gotowe' &&
    przebiegDane.przebieg?.has_time_series === true &&
    punktyPrzebiegu.length > 0;

  const otworzDowod = () => {
    if (przebieg) setWynikiTab('dowod', przebieg.id);
  };

  return (
    <div className="mvd-stabilnosc" data-testid="mvd-stabilnosc">
      <header className="mvd-stabilnosc-head">
        <span className="mvd-stabilnosc-lbl">{T.eyebrow}</span>
        <h3>{T.tytul}</h3>
        <p className="mvd-stabilnosc-cel">{T.cel}</p>
      </header>

      {!przebieg ? (
        <div className="mvd-stabilnosc-stan" data-testid="mvd-stabilnosc-zero" data-tone="idle">
          <h4>{T.zeroTytul}</h4>
          <p>{T.zeroOpis}</p>
          <FormularzScenariusza />
          <button
            type="button"
            className="mvd-stabilnosc-akcja"
            data-testid="mvd-stabilnosc-zero-akcja"
            onClick={() => setActiveSpace('obliczenia')}
          >
            {T.zeroAkcja}
          </button>
        </div>
      ) : dane?.stan === 'laduje' ? (
        <Stan
          tytul={T.ladowanieTytul}
          opis={T.ladowanieOpis}
          tone="loading"
          testid="mvd-stabilnosc-ladowanie"
        />
      ) : dane?.stan === 'blad' ? (
        <Stan
          tytul={T.bladTytul}
          opis={T.bladOpis}
          akcja={T.zeroAkcja}
          onAkcja={() => setActiveSpace('obliczenia')}
          tone="error"
          testid="mvd-stabilnosc-blad"
        />
      ) : !wiersz ? (
        <Stan
          tytul={T.brakWierszaTytul}
          opis={T.brakWierszaOpis}
          tone="idle"
          testid="mvd-stabilnosc-brak-wiersza"
        />
      ) : (
        <>
          {wiersz.ocena && (
            <OcenaNiewykonana ocena={wiersz.ocena} testid="mvd-stabilnosc-ocena" />
          )}

          <SekcjaZalozen zalozenia={naZalozeniaStabilnosci(wiersz, nazwaObiektu)} />

          <section className="mvd-stabilnosc-sekcja" data-testid="mvd-stabilnosc-echo">
            <h4>{T.echoTytul}</h4>
            <p className="mvd-stabilnosc-nota">{T.echoOpis}</p>
            <table className="mvd-stabilnosc-tabela">
              <thead>
                <tr>
                  <th scope="col">{T.kolWielkosc}</th>
                  <th scope="col">{T.kolWartosc}</th>
                </tr>
              </thead>
              <tbody>
                {naEchoScenariusza(wiersz).map((poz) => (
                  <tr key={poz.klucz} data-testid={`mvd-stabilnosc-echo-${poz.klucz}`}>
                    <td>{poz.wielkosc}</td>
                    <td className="mvd-num">{poz.wartosc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mvd-stabilnosc-sekcja" data-testid="mvd-stabilnosc-przebieg">
            <h4>{T.przebiegTytul}</h4>
            <p className="mvd-stabilnosc-nota">{T.przebiegOpis}</p>
            <button
              type="button"
              className="mvd-stabilnosc-dowod"
              aria-expanded={przebiegWidoczny}
              data-testid="mvd-stabilnosc-przebieg-btn"
              onClick={() => setPrzebiegWidoczny((w) => !w)}
            >
              {przebiegWidoczny ? T.przebiegUkryj : T.przebiegPokaz}
            </button>
            {przebiegWidoczny &&
              (przebiegDane?.stan === 'laduje' ? (
                <p className="mvd-stabilnosc-nota" data-testid="mvd-stabilnosc-przebieg-ladowanie">
                  {T.przebiegLadowanie}
                </p>
              ) : przebiegDane?.stan === 'blad' ? (
                <p
                  className="mvd-stabilnosc-nota"
                  role="alert"
                  data-testid="mvd-stabilnosc-przebieg-blad"
                >
                  {T.przebiegBlad}
                </p>
              ) : maSzereg ? (
                <>
                  {przebiegDane.przebieg?.uwaga_pl && (
                    <p
                      className="mvd-stabilnosc-nota"
                      data-testid="mvd-stabilnosc-przebieg-uwaga"
                    >
                      {przebiegDane.przebieg.uwaga_pl}
                    </p>
                  )}
                  <WykresPrzebieguChart punkty={punktyPrzebiegu} serie={seriePrzebiegu} />
                </>
              ) : (
                <p className="mvd-stabilnosc-nota" data-testid="mvd-stabilnosc-przebieg-brak">
                  {T.przebiegBrak}
                </p>
              ))}
          </section>

          <section className="mvd-stabilnosc-sekcja" data-testid="mvd-stabilnosc-slad">
            <h4>{T.sladTytul}</h4>
            <p className="mvd-stabilnosc-nota">{T.sladOpis}</p>
            <button
              type="button"
              className="mvd-stabilnosc-dowod"
              aria-expanded={sladWidoczny}
              data-testid="mvd-stabilnosc-slad-btn"
              onClick={() => setSladWidoczny((w) => !w)}
            >
              {sladWidoczny ? T.sladUkryj : T.sladPokaz}
            </button>
            {sladWidoczny &&
              (!dane?.sladDostepny ? (
                <p className="mvd-stabilnosc-nota" role="alert" data-testid="mvd-stabilnosc-slad-blad">
                  {T.sladBladPobrania}
                </p>
              ) : (
                <>
                  <p className="mvd-stabilnosc-nota" data-testid="mvd-stabilnosc-slad-brak">
                    {T.sladBrak}
                  </p>
                  {dane.efektTopologii && (
                    <div data-testid="mvd-stabilnosc-topologia">
                      <p className="mvd-stabilnosc-nota">{T.sladTopologiaTytul}</p>
                      <dl className="mvd-stabilnosc-siatka">
                        <div className="mvd-stabilnosc-wartosc">
                          <dt>{T.sladStanSieci}</dt>
                          <dd>
                            {dane.efektTopologii.network_state
                              ? ETYKIETY_STANU_SIECI[dane.efektTopologii.network_state]
                              : T.kreska}
                          </dd>
                        </div>
                        <div className="mvd-stabilnosc-wartosc">
                          <dt>{T.sladZakresWylaczen}</dt>
                          <dd>
                            {dane.efektTopologii.outage_scope
                              ? ETYKIETY_ZAKRESU_WYLACZEN[dane.efektTopologii.outage_scope]
                              : T.kreska}
                          </dd>
                        </div>
                        <div className="mvd-stabilnosc-wartosc">
                          <dt>{T.sladOtwarte}</dt>
                          <dd>
                            {(dane.efektTopologii.opened_element_ids ?? []).length > 0
                              ? (dane.efektTopologii.opened_element_ids ?? [])
                                  .map((ref) => nazwaObiektu(ref))
                                  .join(', ')
                              : T.kreska}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </>
              ))}
            <button
              type="button"
              className="mvd-stabilnosc-dowod"
              data-testid="mvd-stabilnosc-dowod"
              title={T.sladDowodOpis}
              onClick={otworzDowod}
            >
              {T.sladDowod}
            </button>
          </section>

          <section className="mvd-stabilnosc-sekcja" data-testid="mvd-stabilnosc-raport">
            <h4>{T.raportTytul}</h4>
            <dl className="mvd-stabilnosc-siatka">
              <div className="mvd-stabilnosc-wartosc" data-testid="mvd-stabilnosc-raport-status">
                <dt>{T.raportStatus}</dt>
                <dd>{wiersz.reporting_status_pl ?? T.kreska}</dd>
              </div>
              <div className="mvd-stabilnosc-wartosc" data-testid="mvd-stabilnosc-raport-dowod">
                <dt>{T.raportUzasadnienie}</dt>
                <dd>{wiersz.proof_status_pl ?? T.kreska}</dd>
              </div>
              <div
                className="mvd-stabilnosc-wartosc"
                data-testid="mvd-stabilnosc-raport-ograniczenia"
              >
                <dt>{T.raportOgraniczenia}</dt>
                <dd>
                  {(wiersz.reporting_limitations_pl ?? []).length > 0
                    ? (wiersz.reporting_limitations_pl ?? []).join(' ')
                    : T.raportBrakOgraniczen}
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}

      <div className="mvd-stabilnosc-stopka">
        <span className="mvd-stabilnosc-lbl">{T.nastepnyEyebrow}</span>
        <p>{T.nastepnyOpis}</p>
        <button
          type="button"
          className="mvd-stabilnosc-powrot"
          data-testid="mvd-stabilnosc-powrot"
          title={T.powrotOpis}
          onClick={clearRouteManagedSurface}
        >
          {T.powrotHub}
        </button>
      </div>
    </div>
  );
}
