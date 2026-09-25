/*
 * Pulpit instalacji OZE — kokpit specjalisty (karta P47; kontrakt V2 — karta AB-1a Pakiet D2
 * §6). Jeden ekran: lewa kolumna to lista modułów projektu (typ modułu z klasyfikacji
 * backendu, dowód certyfikatu, powód odrzucenia tabliczki albo jawny brak, plakietki rekordów
 * wymagań), prawa to karta wybranego modułu (sekcje 1–5).
 *
 * ŹRÓDŁO OCENY (karta AB-1a Pakiet D2): pulpit opisuje INSTALACJĘ z modelu, więc czyta ocenę
 * zatwierdzonego modelu przypadku (`GET /api/ncrfg-tests/cases/{case_id}/compliance` — ta sama
 * trasa i ta sama ocena wymagań co certyfikat; dane modułów i dowód certyfikatu wyprowadza
 * serwer z modelu, źródło danych `ZATWIERDZONY_MODEL`). Dawny bieg „co-jeśli" z wejściami
 * złożonymi po stronie klienta z modelu był DRUGĄ ścieżką tego samego mostu model → wejście
 * solvera (`application/ncrfg_compliance/model_bridge.py`) i nigdy nie niósł dowodu
 * certyfikatu (dowód wyprowadza wyłącznie serwer) — pulpit pokazywał wtedy „brak dowodu" przy
 * urządzeniu z wykazu PTPiREE. Analiza „co-jeśli" z danymi deklarowanymi zostaje w macierzy.
 *
 * Granice (NOT-A-SOLVER / Single Model): warstwa tylko zestawia i prezentuje; dane DER czytane
 * read-only ze store'a (`useStationDerStore`); zero mutacji modelu. Bez statusu modułu i bez
 * liczników. Operator nigdy nie jest zgadywany (`ncrfg/operator.ts`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { selectAllDers, useStationDerStore } from '../../../ui/network-build/station-der';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { EtykietaWerdyktu } from '../../wyniki/wzorzec/KartaWerdyktu';
import { InformacjeAudytowe } from '../../wyniki/wzorzec/InformacjeAudytowe';
import { PrzyciskAkcjiStanu } from '../../wyniki/wzorzec/PrzyciskAkcjiStanu';
import { useAkcjaDodajZrodloOze } from '../../wyniki/wzorzec/akcjeStanuZerowego';
import { opisyModulow } from '../macierz';
import { MACIERZ_STRINGS } from '../macierz/strings';
import { pobierzZgodnoscPrzypadkuNcRfg } from '../ncrfg/api';
import { OpisDokumentuWarstwy } from '../ncrfg/komponenty';
import { operatorEfektywny, operatorZModelu } from '../ncrfg/operator';
import type { ZgodnoscPrzypadkuNcRfg } from '../ncrfg/typy';
import { WyborOperatora } from '../ncrfg/WyborOperatora';
import { useNcRfgStore } from '../ncRfgStore';
import { KartaModulu } from './KartaModulu';
import { zbudujPozycje, type PozycjaModulu } from './pulpitModel';
import { PULPIT_STRINGS } from './strings';

import '../macierz/macierz.css';
import './pulpit.css';

/** Opis pozycji listy: typ modułu z klasyfikacji backendu albo nazwany stan jego braku. */
function opisKlasyPozycji(pozycja: PozycjaModulu, ocenaWczytana: boolean): string {
  if (pozycja.wynik !== null) {
    const modul = pozycja.wynik.klasyfikacja.modul;
    return modul !== null
      ? `${PULPIT_STRINGS.listaKlasa} ${modul}`
      : PULPIT_STRINGS.listaPonizejProgu;
  }
  if (pozycja.pominietyPowodPl !== null) return pozycja.pominietyPowodPl;
  return ocenaWczytana ? PULPIT_STRINGS.listaPozaOcena : PULPIT_STRINGS.listaBezOceny;
}

/** Dowód certyfikatu pozycji listy: numer dokumentu z wykazu, odrzucenie tabliczki albo brak. */
function DowodPozycji({ pozycja }: { readonly pozycja: PozycjaModulu }): JSX.Element | null {
  if (pozycja.wynik === null) return null;
  const dowod = pozycja.wynik.dowod_certyfikatu;
  const stan = dowod ? 'dowod' : pozycja.odrzucony ? 'odrzucony' : 'brak';
  return (
    <span
      className="mvd-oze-pulpit-poz-meta"
      data-testid={`mvd-oze-pulpit-poz-dowod-${pozycja.derRef}`}
      data-stan={stan}
    >
      {dowod
        ? `${PULPIT_STRINGS.listaDowod}: ${dowod.numer_dokumentu}`
        : pozycja.odrzucony
          ? PULPIT_STRINGS.listaOdrzucony
          : PULPIT_STRINGS.listaBrakDowodu}
    </span>
  );
}

export interface PulpitOzeProps {
  /** Tryb zaawansowania — odsłania identyfikatory katalogowe i odcisk. */
  readonly trybZaawansowania: AdvancementMode;
  /** Nawigacja do dokumentacji modułu (implementacja poza tą kartą). */
  readonly onNawiguj: (cel: 'dokumentacja') => void;
}

export function PulpitOze({ trybZaawansowania, onNawiguj }: PulpitOzeProps): JSX.Element {
  const ders = useStationDerStore((state) => selectAllDers(state));
  const opisy = useMemo(() => opisyModulow(ders), [ders]);
  const derPoId = useMemo(() => new Map(ders.map((d) => [d.id, d])), [ders]);
  // K6 / H-5: stan zerowy strumienia OZE prowadzi do dodania modulu wytworczego.
  const akcjaZrodlo = useAkcjaDodajZrodloOze();

  const katalog = useNcRfgStore((s) => s.katalog);
  const bladKatalogu = useNcRfgStore((s) => s.bladKatalogu);
  const operatorWybor = useNcRfgStore((s) => s.operatorWybor);
  const zaladujKatalog = useNcRfgStore((s) => s.zaladujKatalog);
  const ustawOperator = useNcRfgStore((s) => s.ustawOperator);
  // Aktywny przypadek — ocena czyta jego zatwierdzony model (serwer).
  const caseId = useAppStateStore((s) => s.activeCaseId);

  const [zgodnosc, setZgodnosc] = useState<ZgodnoscPrzypadkuNcRfg | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [bladOceny, setBladOceny] = useState<string | null>(null);

  const [wybranyModul, setWybranyModul] = useState<string>('');
  // Wyróżnienie moduł→węzeł (P47b): klik modułu podświetla wiersze jego węzła
  // w sekcjach siły sieci i adekwatności Q; ponowny klik tego samego modułu
  // wyłącza wyróżnienie. `null` → brak wyróżnienia.
  const [wyroznionyModul, setWyroznionyModul] = useState<string | null>(null);

  const wybierzModul = (derRef: string): void => {
    setWybranyModul(derRef);
    setWyroznionyModul((poprzedni) => (poprzedni === derRef ? null : derRef));
  };

  const zModelu = useMemo(() => operatorZModelu(ders), [ders]);
  const operatorId = operatorEfektywny(zModelu, operatorWybor);

  useEffect(() => {
    void zaladujKatalog();
  }, [zaladujKatalog]);

  useEffect(() => {
    if (!wybranyModul && opisy[0]) setWybranyModul(opisy[0].derRef);
  }, [opisy, wybranyModul]);

  const zaladujOcene = useCallback(async (): Promise<void> => {
    if (!caseId || operatorId === null) return;
    setLadowanie(true);
    setBladOceny(null);
    try {
      setZgodnosc(await pobierzZgodnoscPrzypadkuNcRfg(caseId, operatorId));
    } catch (err) {
      setZgodnosc(null);
      setBladOceny(err instanceof Error ? err.message : PULPIT_STRINGS.bladOceny);
    } finally {
      setLadowanie(false);
    }
  }, [caseId, operatorId]);

  // Zmiana przypadku albo operatora unieważnia poprzednią ocenę i wczytuje ocenę bieżącą.
  useEffect(() => {
    setZgodnosc(null);
    void zaladujOcene();
  }, [zaladujOcene]);

  const ocenaWczytana = zgodnosc !== null;
  const bieg = zgodnosc?.bieg ?? null;
  const pozycje = useMemo(() => zbudujPozycje(opisy, zgodnosc), [opisy, zgodnosc]);
  const opisWybrany = opisy.find((o) => o.derRef === wybranyModul) ?? opisy[0] ?? null;
  const derWybrany = opisWybrany ? (derPoId.get(opisWybrany.derRef) ?? null) : null;
  const pozycjaWybrana = opisWybrany
    ? (pozycje.find((p) => p.derRef === opisWybrany.derRef) ?? null)
    : null;

  const powodBlokadyOceny =
    opisy.length === 0
      ? PULPIT_STRINGS.brakModulow
      : !caseId
        ? PULPIT_STRINGS.brakPrzypadku
        : operatorId === null
          ? MACIERZ_STRINGS.brakOperatora
          : ladowanie
            ? PULPIT_STRINGS.wTrakcie
            : null;

  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');

  return (
    <div className="mvd-oze" data-testid="mvd-oze-pulpit">
      <header className="mvd-oze-head">
        <div className="mvd-oze-head-main">
          <h3 className="mvd-oze-title">{PULPIT_STRINGS.tytul}</h3>
          <p className="mvd-oze-sub">{PULPIT_STRINGS.podtytul}</p>
        </div>
        <div className="mvd-oze-head-akcje">
          <div className="mvd-oze-pola">
            <WyborOperatora
              zModelu={zModelu}
              operatorzy={katalog?.operators ?? null}
              wybor={operatorWybor}
              onWybor={ustawOperator}
              etykieta={PULPIT_STRINGS.operator}
              testid="mvd-oze-pulpit-operator"
            />
            {katalog ? (
              <div className="mvd-oze-pole">
                <span>{PULPIT_STRINGS.wersjaProcedury}</span>
                <OpisDokumentuWarstwy
                  dokument={katalog.procedure_version}
                  testid="mvd-oze-pulpit-wersja-procedury"
                />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="mvd-btn mvd-btn-glowny"
            onClick={() => void zaladujOcene()}
            disabled={Boolean(powodBlokadyOceny)}
            title={powodBlokadyOceny ?? PULPIT_STRINGS.odswiez}
            data-testid="mvd-oze-pulpit-odswiez"
          >
            {ladowanie ? PULPIT_STRINGS.wTrakcie : PULPIT_STRINGS.odswiez}
          </button>
          {bieg ? (
            <InformacjeAudytowe
              trybEkspercki={trybEkspercki}
              testid="mvd-oze-pulpit-odcisk"
              wiersze={[
                { etykieta: PULPIT_STRINGS.odcisk, wartosc: bieg.deterministic_hash },
                { etykieta: MACIERZ_STRINGS.odciskWejsciaBiegu, wartosc: bieg.input_hash },
                { etykieta: MACIERZ_STRINGS.wersjaSolvera, wartosc: bieg.solver_version },
              ]}
            />
          ) : null}
        </div>
      </header>

      <p className="mvd-oze-info mvd-oze-opis-biegu" data-testid="mvd-oze-pulpit-zrodlo-oceny">
        {PULPIT_STRINGS.zrodloOceny}
      </p>
      {!caseId && opisy.length > 0 ? (
        <p className="mvd-oze-info mvd-oze-opis-biegu" data-testid="mvd-oze-pulpit-brak-przypadku">
          {PULPIT_STRINGS.brakPrzypadku}
        </p>
      ) : null}

      {bladKatalogu ? (
        <div className="mvd-oze-blad" data-testid="mvd-oze-pulpit-blad-katalogu">
          {PULPIT_STRINGS.bladKatalogu}: {bladKatalogu}
        </div>
      ) : null}
      {bladOceny ? (
        <div className="mvd-oze-blad" role="alert" data-testid="mvd-oze-pulpit-blad-oceny">
          {PULPIT_STRINGS.bladOceny}: {bladOceny}
        </div>
      ) : null}

      {opisy.length === 0 ? (
        <section className="mvd-oze-info" data-testid="mvd-oze-pulpit-pusty">
          <h4>{PULPIT_STRINGS.brakModulow}</h4>
          <p>{PULPIT_STRINGS.brakModulowOpis}</p>
          {/* K6 / H-5: stan zerowy prowadzi do dodania modułu wytwórczego. */}
          <PrzyciskAkcjiStanu akcja={akcjaZrodlo} testid="mvd-oze-pulpit-pusty" />
        </section>
      ) : (
        <div className="mvd-oze-pulpit-uklad">
          <nav
            className="mvd-oze-pulpit-lista"
            data-testid="mvd-oze-pulpit-lista"
            aria-label={PULPIT_STRINGS.listaTytul}
          >
            <div className="mvd-oze-pulpit-lista-h">{PULPIT_STRINGS.listaTytul}</div>
            {pozycje.map((poz) => (
              <button
                key={poz.derRef}
                type="button"
                className="mvd-oze-pulpit-poz"
                onClick={() => wybierzModul(poz.derRef)}
                aria-pressed={opisWybrany?.derRef === poz.derRef}
                data-wyrozniony={wyroznionyModul === poz.derRef ? 'true' : undefined}
                data-testid={`mvd-oze-pulpit-poz-${poz.derRef}`}
              >
                <span className="mvd-oze-pulpit-poz-nazwa">
                  {poz.nazwa} · {poz.rodzaj}
                </span>
                <span
                  className="mvd-oze-pulpit-poz-klasa"
                  data-testid={`mvd-oze-pulpit-poz-klasa-${poz.derRef}`}
                >
                  {opisKlasyPozycji(poz, ocenaWczytana)}
                </span>
                <DowodPozycji pozycja={poz} />
                {poz.ocena && poz.ocena.wymagania.length > 0 ? (
                  <span
                    className="mvd-oze-pulpit-poz-plakietki"
                    aria-label={PULPIT_STRINGS.listaWymagania}
                    data-testid={`mvd-oze-pulpit-poz-wymagania-${poz.derRef}`}
                  >
                    {poz.ocena.wymagania.map((rekord, indeks) => (
                      <span key={`${rekord.wymaganie_id}-${indeks}`} title={rekord.nazwa_pl}>
                        <EtykietaWerdyktu
                          etykieta={rekord.etykieta}
                          status={rekord.status_maszynowy}
                        />
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="mvd-oze-pulpit-panel">
            {opisWybrany && derWybrany && pozycjaWybrana ? (
              <KartaModulu
                opis={opisWybrany}
                der={derWybrany}
                pozycja={pozycjaWybrana}
                ocenaWczytana={ocenaWczytana}
                trybEkspercki={trybEkspercki}
                onNawiguj={onNawiguj}
                wyroznionyModul={wyroznionyModul}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
