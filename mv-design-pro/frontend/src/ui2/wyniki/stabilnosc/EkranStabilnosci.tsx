/**
 * EkranStabilnosci — REALNY dostawca ui2 ekranu kanonicznego E-32
 * „Stabilność dynamiczna" (karta P-3, FLOW §0.3 „kontrakt ekranu prowadzącego").
 * Zastępuje zastępczy `EkranKontraktuAnalizy` dla E-32.
 *
 * Rama prowadząca (wzorzec EkranAnalizy: ZAŁOŻENIA → WERDYKT → TABELA →
 * ślad na żądanie):
 *  - nagłówek: eyebrow + JEDNO zdanie celu inżynierskiego,
 *  - stan wejścia: brak zakończonego przebiegu DYNAMIC_STABILITY → uczciwy
 *    stan zerowy z akcją „Przejdź do obliczeń",
 *  - ZAŁOŻENIA: scenariusz zakłócenia (element, czas wyłączenia, kryteria),
 *  - WERDYKT stabilności z backendu (STABLE/UNSTABLE, wskaźnik, margines,
 *    czynnik ograniczający, naruszone kryteria),
 *  - WIELKOŚCI po zakłóceniu ze statusami kryteriów backendu (`checks`) +
 *    jawna nota GAP: kontrakt nie niesie szeregu czasowego,
 *  - ŚLAD AUTOMATYKI na żądanie (zwinięty przycisk — wzorzec SladWywodu) +
 *    odesłanie do pełnego dowodu (`setWynikiTab('dowod', runId)`).
 *
 * ZERO fizyki, ZERO progów w UI: werdykty, marginesy i statusy kryteriów
 * pochodzą wyłącznie z backendu. Stylowanie wyłącznie tokenami --mvd-*.
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
import { akcjaNaprawcza, SekcjaZalozen, usePoprawWModelu } from '../wzorzec';
import { usePrzebiegStabilnosci, useWynikStabilnosci } from './api';
import { elementWerdyktuStabilnosci } from './model';
import {
  fmtMs,
  fmtWskaznik,
  naruszoneKryteriaPL,
  naSeriePrzebiegu,
  naWielkosciStabilnosci,
  naZalozeniaStabilnosci,
  naZdarzenia,
  werdyktStabilnosciPL,
  wybierzPrzebiegStabilnosci,
} from './model';
import { kryteriumPL, STABILNOSC_STRINGS as T, zdarzeniePL } from './strings';
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
  const poprawWModelu = usePoprawWModelu();
  const [sladWidoczny, setSladWidoczny] = useState(false);
  const [przebiegWidoczny, setPrzebiegWidoczny] = useState(false);

  const przebieg = useMemo(
    () => wybierzPrzebiegStabilnosci(przebiegi, activeRunId),
    [przebiegi, activeRunId],
  );
  const dane = useWynikStabilnosci(przebieg?.id ?? null);
  const wiersz = dane?.wiersz ?? null;
  const zdarzenia = dane?.zdarzenia ? naZdarzenia(dane.zdarzenia) : null;

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
        <Stan
          tytul={T.zeroTytul}
          opis={T.zeroOpis}
          akcja={T.zeroAkcja}
          onAkcja={() => setActiveSpace('obliczenia')}
          tone="idle"
          testid="mvd-stabilnosc-zero"
        />
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
          <SekcjaZalozen zalozenia={naZalozeniaStabilnosci(wiersz)} />

          <section
            className="mvd-stabilnosc-sekcja"
            data-testid="mvd-stabilnosc-werdykt"
            data-werdykt={wiersz.status ?? 'nieznany'}
          >
            <h4>{T.werdyktTytul}</h4>
            <p className="mvd-stabilnosc-nota">{T.werdyktOpis}</p>
            <dl className="mvd-stabilnosc-siatka">
              <div className="mvd-stabilnosc-wartosc" data-testid="mvd-stabilnosc-werdykt-status">
                <dt>{T.werdyktStatus}</dt>
                <dd>
                  <span
                    className="mvd-stabilnosc-chip"
                    data-stan={wiersz.status === 'STABLE' ? 'ok' : 'brak'}
                  >
                    {werdyktStabilnosciPL(wiersz)}
                  </span>
                </dd>
              </div>
              <div className="mvd-stabilnosc-wartosc" data-testid="mvd-stabilnosc-wskaznik">
                <dt>{T.werdyktWskaznik}</dt>
                <dd className="mvd-num">
                  {wiersz.stability_index != null ? fmtWskaznik(wiersz.stability_index) : T.kreska}
                </dd>
              </div>
              <div className="mvd-stabilnosc-wartosc" data-testid="mvd-stabilnosc-margines">
                <dt>{T.werdyktMargines}</dt>
                <dd className="mvd-num">
                  {wiersz.clearing_margin_ms != null
                    ? `${fmtMs(wiersz.clearing_margin_ms)} ${T.jednMs}`
                    : T.kreska}
                </dd>
              </div>
              <div className="mvd-stabilnosc-wartosc" data-testid="mvd-stabilnosc-czynnik">
                <dt>{T.werdyktCzynnik}</dt>
                <dd>{wiersz.limiting_factor ? kryteriumPL(wiersz.limiting_factor) : T.kreska}</dd>
              </div>
              <div className="mvd-stabilnosc-wartosc" data-testid="mvd-stabilnosc-naruszone">
                <dt>{T.werdyktNaruszone}</dt>
                <dd>{naruszoneKryteriaPL(wiersz)}</dd>
              </div>
            </dl>
            {/* F-K4 faza 3 (znalezisko Z4): utrata stabilności prowadzi do elementu
                w modelu — najpierw miejsce zwarcia, potem źródło. Typ elementu
                pochodzi z KONTRAKTU (`*_kind` rozstrzygnięte ze snapshotu biegu);
                brak rodzaju = brak akcji, bo prowadziłaby w nikąd. */}
            {wiersz.status !== 'STABLE' &&
              (() => {
                const element = elementWerdyktuStabilnosci(wiersz);
                if (!element) return null;
                return (
                  <button
                    type="button"
                    className="mvd-stabilnosc-popraw"
                    data-testid="mvd-stabilnosc-popraw"
                    title={akcjaNaprawcza().opis}
                    onClick={() => poprawWModelu(element.ref, element.typ, element.ref)}
                  >
                    {akcjaNaprawcza().etykieta}
                  </button>
                );
              })()}
          </section>

          <section className="mvd-stabilnosc-sekcja" data-testid="mvd-stabilnosc-wielkosci">
            <h4>{T.wielkosciTytul}</h4>
            <p className="mvd-stabilnosc-nota">{T.wielkosciOpis}</p>
            <table className="mvd-stabilnosc-tabela">
              <thead>
                <tr>
                  <th scope="col">{T.kolWielkosc}</th>
                  <th scope="col">{T.kolWartosc}</th>
                  <th scope="col">{T.kolStatus}</th>
                </tr>
              </thead>
              <tbody>
                {naWielkosciStabilnosci(wiersz).map((poz) => (
                  <tr key={poz.klucz} data-testid={`mvd-stabilnosc-wielkosc-${poz.klucz}`}>
                    <td>{poz.wielkosc}</td>
                    <td className="mvd-num">
                      {poz.wartosc === T.kreska ? poz.wartosc : `${poz.wartosc} ${poz.jednostka}`}
                    </td>
                    <td>
                      {poz.spelnione === undefined ? (
                        T.kreska
                      ) : (
                        <span
                          className="mvd-stabilnosc-chip"
                          data-stan={poz.spelnione ? 'ok' : 'brak'}
                        >
                          {poz.spelnione ? T.statusSpelnione : T.statusNaruszone}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Nota o braku szeregu — TYLKO gdy bieg go nie ma (starszy zapis).
                Dla biegów z szeregiem sekcja „Przebieg czasowy" niesie wykres. */}
            {!maSzereg && (
              <p className="mvd-stabilnosc-nota" data-testid="mvd-stabilnosc-brak-szeregu">
                {T.brakSzereguCzasowego}
              </p>
            )}
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
                <WykresPrzebieguChart punkty={punktyPrzebiegu} serie={seriePrzebiegu} />
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
              (zdarzenia === null ? (
                <p className="mvd-stabilnosc-nota" data-testid="mvd-stabilnosc-slad-brak">
                  {T.sladBrak}
                </p>
              ) : zdarzenia.length === 0 ? (
                <p className="mvd-stabilnosc-nota" data-testid="mvd-stabilnosc-slad-brak">
                  {T.sladBrak}
                </p>
              ) : (
                <>
                  <table className="mvd-stabilnosc-tabela" data-testid="mvd-stabilnosc-zdarzenia">
                    <thead>
                      <tr>
                        <th scope="col">{T.sladKolLp}</th>
                        <th scope="col">{T.sladKolZdarzenie}</th>
                        <th scope="col">{T.sladKolElement}</th>
                        <th scope="col">{T.sladKolOpis}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zdarzenia.map((z) => (
                        <tr key={`${z.event_seq}::${z.event_type}`}>
                          <td className="mvd-num">{z.event_seq}</td>
                          <td>{zdarzeniePL(z.event_type)}</td>
                          <td className="mvd-num">{z.element_id ?? T.kreska}</td>
                          <td>{z.detail || T.kreska}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {dane?.efektTopologii && (
                    <dl className="mvd-stabilnosc-siatka" data-testid="mvd-stabilnosc-topologia">
                      <div className="mvd-stabilnosc-wartosc">
                        <dt>{T.sladStanSieci}</dt>
                        <dd>{dane.efektTopologii.network_state ?? T.kreska}</dd>
                      </div>
                      <div className="mvd-stabilnosc-wartosc">
                        <dt>{T.sladZakresWylaczen}</dt>
                        <dd>{dane.efektTopologii.outage_scope ?? T.kreska}</dd>
                      </div>
                    </dl>
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
                <dd>{wiersz.reporting_status_pl ?? wiersz.reporting_status ?? T.kreska}</dd>
              </div>
              <div className="mvd-stabilnosc-wartosc" data-testid="mvd-stabilnosc-raport-dowod">
                <dt>{T.raportUzasadnienie}</dt>
                <dd>{wiersz.proof_status_pl ?? wiersz.proof_status ?? T.kreska}</dd>
              </div>
              <div
                className="mvd-stabilnosc-wartosc"
                data-testid="mvd-stabilnosc-raport-ograniczenia"
              >
                <dt>{T.raportOgraniczenia}</dt>
                <dd>
                  {(wiersz.reporting_limitations ?? []).length > 0
                    ? (wiersz.reporting_limitations ?? []).join(', ')
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
