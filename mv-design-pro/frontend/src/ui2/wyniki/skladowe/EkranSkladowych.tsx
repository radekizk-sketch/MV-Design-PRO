/**
 * EkranSkladowych — REALNY dostawca ui2 ekranu kanonicznego E-29
 * „Składowe symetryczne i sieć zerowa" (karta P-3, FLOW §0.3 „kontrakt ekranu
 * prowadzącego"). Zastępuje zastępczy `EkranKontraktuAnalizy` dla E-29.
 *
 * Rama prowadząca:
 *  - nagłówek: eyebrow + JEDNO zdanie celu inżynierskiego,
 *  - stan wejścia: brak zakończonego przebiegu zwarcia NIESYMETRYCZNEGO
 *    (1F/2F/2F+Z) → uczciwy stan zerowy z akcją „Przejdź do obliczeń",
 *  - ZAŁOŻENIA przebiegu (rodzaj zwarcia, metoda, c, tk — wprost z wierszy
 *    kanonicznych) → TABELA punktów (bilans Zk/Rk/Xk/X-R/κ/Ik" + werdykt
 *    raportowalności) → SKŁADOWE Z1/Z2/Z0 wybranego punktu (ślad WHITE BOX,
 *    wzór KaTeX — wzorzec DowodPrzebiegu, read-only) → UZIEMIENIE punktu
 *    neutralnego (zamrożona wersja układu przebiegu) → następny krok.
 *
 * ZERO fizyki, ZERO mutacji: wszystkie wartości z backendu (solver FROZEN /
 * ślad / snapshot przebiegu); jedyna operacja UI to deterministyczne
 * formatowanie prezentacji. Stylowanie wyłącznie tokenami --mvd-*.
 */

import { useMemo, useState } from 'react';
import './skladowe.css';
// Style wspólnego wzorca (SekcjaZalozen, TabelaWynikow) — import jawny, bo ekran
// nie renderuje ramy `EkranAnalizy`, która normalnie wnosi ten arkusz.
import '../wzorzec/wzorzec.css';

import { useAppStateStore } from '../../../ui/app-state';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { MathBlock } from '../../../ui/proof/MathRenderer';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useShellStore } from '../../shell/useShellStore';
import { SekcjaZalozen, TabelaWynikow, usePoprawWModelu } from '../wzorzec';
import { useDaneSkladowych } from './api';
import {
  fmtImpedancjaUziemienia,
  fmtZespolona,
  KLUCZ_PUNKT,
  KOLUMNY_SKLADOWYCH,
  naWierszeSkladowych,
  naZalozeniaSkladowych,
  skladowePunktu,
  uziemieniaSieci,
  uziemieniePunktu,
  werdyktPL,
  wybierzPrzebiegNiesymetryczny,
  type Zespolona,
} from './model';
import { SKLADOWE_STRINGS as T } from './strings';

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
    <div className="mvd-skladowe-stan" data-testid={testid} data-tone={tone} role={tone === 'error' ? 'alert' : undefined}>
      <h4>{tytul}</h4>
      <p>{opis}</p>
      {akcja && onAkcja && (
        <button type="button" className="mvd-skladowe-akcja" data-testid={`${testid}-akcja`} onClick={onAkcja}>
          {akcja}
        </button>
      )}
    </div>
  );
}

function WartoscSkladowej({
  etykieta,
  wartosc,
  testid,
}: {
  etykieta: string;
  wartosc: Zespolona | null;
  testid: string;
}) {
  return (
    <div className="mvd-skladowe-wartosc" data-testid={testid}>
      <dt>{etykieta}</dt>
      <dd className="mvd-num">
        {wartosc ? `${fmtZespolona(wartosc)} ${T.jednOhm}` : T.kreska}
      </dd>
    </div>
  );
}

export function EkranSkladowych() {
  const trybZaawansowania = useShellStore((s) => s.advancementMode);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const clearRouteManagedSurface = useNetworkBuildStore((s) => s.clearRouteManagedSurface);
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);

  const przebieg = useMemo(
    () => wybierzPrzebiegNiesymetryczny(przebiegi, activeRunId),
    [przebiegi, activeRunId],
  );
  const dane = useDaneSkladowych(przebieg?.id ?? null);
  const rows = dane?.wynik?.rows ?? [];

  const [wybranyPunkt, setWybranyPunkt] = useState<string | null>(null);
  const poprawWModelu = usePoprawWModelu();
  const aktywnyPunkt = useMemo(() => {
    if (rows.length === 0) return null;
    if (wybranyPunkt && rows.some((r) => r.target_id === wybranyPunkt)) return wybranyPunkt;
    return rows[0].target_id;
  }, [rows, wybranyPunkt]);

  const wierszAktywny = rows.find((r) => r.target_id === aktywnyPunkt) ?? null;
  // RESULT-FIRST (delta FROZEN V12K-128): składowe z wiersza wyniku, ślad WHITE
  // BOX jako fallback (starsze biegi) i źródło wzoru/podstawienia KaTeX.
  const skladowe = skladowePunktu(wierszAktywny, dane?.slad ?? null, aktywnyPunkt);
  const uziemieniePkt = uziemieniePunktu(
    dane?.snapshotPrzebiegu ?? null,
    wierszAktywny?.element_id ?? wierszAktywny?.target_id ?? null,
  );
  const uziemienia = uziemieniaSieci(dane?.snapshotPrzebiegu ?? null);

  const otworzDowod = () => {
    if (przebieg) setWynikiTab('dowod', przebieg.id);
  };

  return (
    <div className="mvd-skladowe" data-testid="mvd-skladowe">
      <header className="mvd-skladowe-head">
        <span className="mvd-skladowe-lbl">{T.eyebrow}</span>
        <h3>{T.tytul}</h3>
        <p className="mvd-skladowe-cel">{T.cel}</p>
      </header>

      {!przebieg ? (
        <Stan
          tytul={T.zeroTytul}
          opis={T.zeroOpis}
          akcja={T.zeroAkcja}
          onAkcja={() => setActiveSpace('obliczenia')}
          tone="idle"
          testid="mvd-skladowe-zero"
        />
      ) : dane?.stan === 'laduje' ? (
        <Stan tytul={T.ladowanieTytul} opis={T.ladowanieOpis} tone="loading" testid="mvd-skladowe-ladowanie" />
      ) : dane?.stan === 'blad' ? (
        <Stan
          tytul={T.bladTytul}
          opis={T.bladOpis}
          akcja={T.zeroAkcja}
          onAkcja={() => setActiveSpace('obliczenia')}
          tone="error"
          testid="mvd-skladowe-blad"
        />
      ) : (
        <>
          <SekcjaZalozen zalozenia={naZalozeniaSkladowych(rows)} />

          <section className="mvd-skladowe-sekcja" data-testid="mvd-skladowe-tabela">
            <h4>{T.tabelaTytul}</h4>
            <p className="mvd-skladowe-nota">{T.tabelaOpis}</p>
            {/* F-K4 (znalezisko Z4): ten ekran nie ma kryterium naruszenia
                (raportowalność jest zawsze pozytywna), więc akcja jest INSPEKCYJNA —
                „Pokaż na schemacie", nie „Popraw". Nazwanie jej naprawą wmawiałoby
                projektantowi defekt, którego nikt nie stwierdził. */}
            <TabelaWynikow
              kolumny={KOLUMNY_SKLADOWYCH}
              wiersze={naWierszeSkladowych(rows)}
              onOtworzDowod={otworzDowod}
              trybZaawansowania={trybZaawansowania}
              kluczWiersza={KLUCZ_PUNKT}
              onWybierzWiersz={setWybranyPunkt}
              wybranyWiersz={aktywnyPunkt}
              onPoprawWModelu={(klucz) => {
                const wiersz = rows.find((r) => r.target_id === klucz);
                const ref = wiersz?.element_id ?? klucz;
                poprawWModelu(ref, 'Bus', wiersz?.target_name ?? ref, 'inspekcja-elementu');
              }}
              rodzajWiersza={() => 'inspekcja-elementu'}
              trybDecyzji="zawsze"
            />
          </section>

          <section className="mvd-skladowe-sekcja" data-testid="mvd-skladowe-skladowe">
            <h4>{T.skladoweTytul}</h4>
            <p className="mvd-skladowe-nota">{T.skladoweOpis}</p>
            {!skladowe ? (
              // RESULT-FIRST: brak składowych i w wyniku, i w śladzie. Rozróżnij
              // uczciwie: starszy bieg bez śladu (jedyne źródło zniknęło) vs
              // ślad dostępny lecz bez kroku „Zk" dla punktu.
              !dane?.slad ? (
                <p className="mvd-skladowe-brak" data-testid="mvd-skladowe-slad-niedostepny">
                  {T.skladoweSladNiedostepny}
                </p>
              ) : (
                <p className="mvd-skladowe-brak" data-testid="mvd-skladowe-brak-kroku">
                  {T.skladoweBrak}
                </p>
              )
            ) : (
              <>
                <dl className="mvd-skladowe-siatka" data-testid="mvd-skladowe-wartosci">
                  <WartoscSkladowej etykieta={T.skladowaZ1} wartosc={skladowe.z1} testid="mvd-skladowe-z1" />
                  <WartoscSkladowej etykieta={T.skladowaZ2} wartosc={skladowe.z2} testid="mvd-skladowe-z2" />
                  {skladowe.z0 ? (
                    <WartoscSkladowej etykieta={T.skladowaZ0} wartosc={skladowe.z0} testid="mvd-skladowe-z0" />
                  ) : (
                    <div className="mvd-skladowe-wartosc" data-testid="mvd-skladowe-z0-brak">
                      <dt>{T.skladowaZ0}</dt>
                      <dd>{T.skladoweBrakZ0}</dd>
                    </div>
                  )}
                </dl>
                {skladowe.formulaLatex && (
                  <div className="mvd-skladowe-wzor" data-testid="mvd-skladowe-wzor">
                    <span className="mvd-skladowe-lbl">{T.skladoweWzor}</span>
                    <MathBlock latex={skladowe.formulaLatex} />
                  </div>
                )}
                {skladowe.substitutionLatex && (
                  <div className="mvd-skladowe-wzor" data-testid="mvd-skladowe-podstawienie">
                    <span className="mvd-skladowe-lbl">{T.skladowePodstawienie}</span>
                    <MathBlock latex={skladowe.substitutionLatex} />
                  </div>
                )}
              </>
            )}
            <button
              type="button"
              className="mvd-skladowe-dowod"
              data-testid="mvd-skladowe-dowod"
              title={T.skladoweDowodOpis}
              onClick={otworzDowod}
            >
              {T.skladoweDowod}
            </button>
          </section>

          <section className="mvd-skladowe-sekcja" data-testid="mvd-skladowe-uziemienie">
            <h4>{T.uziemienieTytul}</h4>
            <p className="mvd-skladowe-nota">{T.uziemienieOpis}</p>
            {!dane?.snapshotPrzebiegu ? (
              <p className="mvd-skladowe-brak" data-testid="mvd-skladowe-uziemienie-niedostepne">
                {T.uziemienieSnapshotNiedostepny}
              </p>
            ) : (
              <>
                <dl className="mvd-skladowe-siatka">
                  <div className="mvd-skladowe-wartosc" data-testid="mvd-skladowe-uziemienie-punktu">
                    <dt>{T.uziemieniePunktu}</dt>
                    <dd>
                      {uziemieniePkt
                        ? [uziemieniePkt.opis, fmtImpedancjaUziemienia(uziemieniePkt)]
                            .filter(Boolean)
                            .join(' · ')
                        : T.uziemienieBrakPunktu}
                    </dd>
                  </div>
                </dl>
                {uziemienia.length > 0 ? (
                  <ul className="mvd-skladowe-lista" data-testid="mvd-skladowe-uziemienie-siec">
                    {uziemienia.map((wpis) => (
                      <li key={`${wpis.element}::${wpis.strona ?? ''}`}>
                        <b>{wpis.element}</b>
                        {wpis.strona ? ` (${wpis.strona})` : ''}
                        {' — '}
                        {wpis.opis}
                        {fmtImpedancjaUziemienia(wpis) ? ` · ${fmtImpedancjaUziemienia(wpis)}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div
                    className="mvd-skladowe-brak-blok"
                    data-testid="mvd-skladowe-uziemienie-brak"
                  >
                    <p className="mvd-skladowe-brak">{T.uziemienieBrakSieci}</p>
                    <button
                      type="button"
                      className="mvd-skladowe-dowod"
                      data-testid="mvd-skladowe-uziemienie-akcja"
                      onClick={() => setActiveSpace('model')}
                    >
                      {T.uziemienieAkcjaModel}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {wierszAktywny && (
            <section className="mvd-skladowe-sekcja" data-testid="mvd-skladowe-raport">
              <h4>{T.raportTytul}</h4>
              {wierszAktywny.reporting_status_pl || wierszAktywny.reporting_status ? (
                <dl className="mvd-skladowe-siatka">
                  <div className="mvd-skladowe-wartosc" data-testid="mvd-skladowe-raport-status">
                    <dt>{T.raportStatus}</dt>
                    <dd>{werdyktPL(wierszAktywny)}</dd>
                  </div>
                  <div className="mvd-skladowe-wartosc" data-testid="mvd-skladowe-raport-dowod">
                    <dt>{T.raportUzasadnienie}</dt>
                    <dd>{wierszAktywny.proof_status_pl ?? wierszAktywny.proof_status ?? T.kreska}</dd>
                  </div>
                  <div className="mvd-skladowe-wartosc" data-testid="mvd-skladowe-raport-ograniczenia">
                    <dt>{T.raportOgraniczenia}</dt>
                    <dd>
                      {(wierszAktywny.reporting_limitations ?? []).length > 0
                        ? (wierszAktywny.reporting_limitations ?? []).join(', ')
                        : T.raportBrakOgraniczen}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mvd-skladowe-brak" data-testid="mvd-skladowe-raport-brak">
                  {T.raportBrakStatusu}
                </p>
              )}
            </section>
          )}
        </>
      )}

      <div className="mvd-skladowe-stopka">
        <span className="mvd-skladowe-lbl">{T.nastepnyEyebrow}</span>
        <p>{T.nastepnyOpis}</p>
        <button
          type="button"
          className="mvd-skladowe-powrot"
          data-testid="mvd-skladowe-powrot"
          title={T.powrotOpis}
          onClick={clearRouteManagedSurface}
        >
          {T.powrotHub}
        </button>
      </div>
    </div>
  );
}
