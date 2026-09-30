/**
 * EkranDynamiki — ekran kanoniczny E-32 „Dynamika czasowa RMS" (karta AB-P1): bieg
 * `DYNAMIKA_RMS` w toku pracy projektanta, w TRYBIE SIECI i BEZ WERDYKTU.
 *
 * Tor pracy (kontrakt ekranu prowadzącego, FLOW §0.3):
 *  1. dane wejściowe — braki modelu, przez które bieg odmówi, z nazwami elementów;
 *  2. modele dynamiczne źródeł i odbiorów — stan, pochodzenie, wiązanie z profilem
 *     katalogowym (cel akcji naprawczych `der.dynamika_missing` i `load.dynamika_missing`);
 *  3. punkt pracy — JAWNIE wybrany zakończony rozpływ tej samej migawki (akcja: policz);
 *  4. scenariusz zdarzeń (nazwany, z edytora generowanego z kontraktu) i nastawy solvera;
 *  5. bieg istniejącą ścieżką wykonania z odpytywaniem stanu;
 *  6. wynik — rekordy „nie oceniono" z backendu, poziom dowodowy (model niezwalidowany),
 *     założenia (zdania z nazwami elementów, złożone w backendzie z rekordów rdzenia — bez
 *     zapisu technicznego rdzenia), oś zdarzeń, wielkości charakterystyczne i przeglądarka
 *     przebiegów sprzężona ze schematem.
 *
 * ZERO fizyki, ZERO werdyktu, ZERO wartości domyślnych w UI. Metadane produkcyjne biegu
 * (identyfikator, wersja solvera, własności numeryczne) wyłącznie w `InformacjeAudytowe`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import './dynamika.css';
import '../wzorzec/wzorzec.css';

import { useAppStateStore } from '../../../ui/app-state';
import { notify } from '../../../ui/notifications/store';
import {
  DerPersistenceApiError,
  patchDerCatalogBindings,
} from '../../../ui/sld/v2/canvas/derPersistenceApi';
import { useSelectionStore } from '../../../ui/selection/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { PanelCoSieZmienilo, useSwiezoscNaglowka, type SwiezoscNaglowka } from '../../freshness';
import { FreshnessBadge } from '../../inspector';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { useShellStore } from '../../shell/useShellStore';
import { useUruchomObliczenie } from '../../spaces/obliczenia/uruchomObliczenie';
import { InformacjeAudytowe } from '../wzorzec/InformacjeAudytowe';
import { etykietaZeSlownika } from '../wzorzec/slownikWyliczen';
import { nazwaObiektuZMigawki } from '../wzorzec/useNazwaObiektu';
import { OcenaNiewykonana } from '../wzorzec/OcenaNiewykonana';
import {
  fetchGotowoscDynamiki,
  fetchOpisScenariusza,
  fetchScenariuszeDynamiki,
  fetchWynikDynamiki,
  uruchomBiegDynamiki,
  zapiszScenariuszDynamiki,
} from './api';
import { EdytorScenariusza, FormularzNastaw, TEKSTY_WALIDACJI, type ElementyModelu } from './EdytorScenariusza';
import {
  fmtLiczba,
  pustyFormularz,
  typZaznaczenia,
  zbudujNastawy,
  type BladFormularza,
  type GotowoscDynamiki,
  type OpisScenariusza,
  type ScenariuszDynamiki,
  type WartoscFormularza,
  type WynikDynamiki,
} from './model';
import { PrzegladarkaPrzebiegow } from './PrzegladarkaPrzebiegow';
import { SekcjaModeliZrodel } from './SekcjaModeliZrodel';
import { DYNAMIKA_STRINGS as T } from './strings';

/** Kolekcje modelu, z których edytor scenariusza wybiera referencje (po nazwie). */
const KOLEKCJE_REFERENCJI = ['buses', 'branches', 'transformers', 'generators', 'sources', 'loads'];

type Wczytanie<D> =
  | { readonly stan: 'laduje' }
  | { readonly stan: 'blad'; readonly komunikat: string }
  | { readonly stan: 'gotowe'; readonly dane: D };

function komunikat(blad: unknown): string {
  return blad instanceof Error ? blad.message : String(blad);
}

export interface EkranDynamikiProps {
  readonly trybZaawansowania?: AdvancementMode;
  /** Wytwórca wskazany deep-linkiem akcji naprawczej (`setWynikiTab('dynamika', ref)`). */
  readonly wskazanyElement?: string | null;
}

export function EkranDynamiki({ trybZaawansowania = 'basic', wskazanyElement = null }: EkranDynamikiProps) {
  const caseId = useAppStateStore((s) => s.activeCaseId);
  const projektId = useAppStateStore((s) => s.activeProjectId);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const hashModelu = snapshot?.header?.hash_sha256 ?? null;
  const setSnapshot = useSnapshotStore((s) => s.setSnapshot);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);
  const zaznaczone = useSelectionStore((s) => s.selectedElements);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const biegiPrzypadku = useExecutionRunsStore((s) => s.runs);
  const { uruchom: uruchomObliczenie, wToku: rozplywWToku } = useUruchomObliczenie();

  const [opis, setOpis] = useState<Wczytanie<OpisScenariusza>>({ stan: 'laduje' });
  const [gotowosc, setGotowosc] = useState<Wczytanie<GotowoscDynamiki>>({ stan: 'laduje' });
  const [scenariusze, setScenariusze] = useState<ScenariuszDynamiki[]>([]);
  const [scenariuszId, setScenariuszId] = useState<string | null>(null);
  const [pfRunId, setPfRunId] = useState('');
  const [nastawy, setNastawy] = useState<{ [pole: string]: WartoscFormularza }>({});
  const [bledyNastaw, setBledyNastaw] = useState<BladFormularza[]>([]);
  const [zapisywanyRef, setZapisywanyRef] = useState<string | null>(null);
  const [bladWiazania, setBladWiazania] = useState<string | null>(null);
  const [bieg, setBieg] = useState<ExecutionRun | null>(null);
  const [bladBiegu, setBladBiegu] = useState<string | null>(null);
  const [wybranyBiegId, setWybranyBiegId] = useState<string | null>(null);
  const [wynik, setWynik] = useState<Wczytanie<WynikDynamiki> | null>(null);

  // Opis kontraktu scenariusza — niezależny od przypadku.
  useEffect(() => {
    let aktywne = true;
    fetchOpisScenariusza()
      .then((dane) => {
        if (!aktywne) return;
        setOpis({ stan: 'gotowe', dane });
        setNastawy(pustyFormularz(dane.nastawy_solvera));
      })
      .catch((blad: unknown) => aktywne && setOpis({ stan: 'blad', komunikat: komunikat(blad) }));
    return () => {
      aktywne = false;
    };
  }, []);

  const odswiezGotowosc = useCallback(async () => {
    if (!caseId) return;
    try {
      setGotowosc({ stan: 'gotowe', dane: await fetchGotowoscDynamiki(caseId) });
    } catch (blad) {
      setGotowosc({ stan: 'blad', komunikat: komunikat(blad) });
    }
  }, [caseId]);

  // Gotowość zależy od modelu (migawka) i od biegów rozpływu przypadku.
  useEffect(() => {
    void odswiezGotowosc();
  }, [odswiezGotowosc, hashModelu, rozplywWToku]);

  // Rejestr biegów przypadku (wynik ostatniego biegu dynamiki po wejściu na ekran).
  useEffect(() => {
    if (caseId) void useExecutionRunsStore.getState().loadRuns(caseId);
  }, [caseId]);

  useEffect(() => {
    if (!caseId) return;
    let aktywne = true;
    fetchScenariuszeDynamiki(caseId)
      .then((dane) => aktywne && setScenariusze(dane.scenariusze))
      .catch(() => aktywne && setScenariusze([]));
    return () => {
      aktywne = false;
    };
  }, [caseId]);

  // Punkt pracy: wybór ważny wyłącznie, gdy rozpływ dalej należy do tej migawki.
  const biegiRozplywu = gotowosc.stan === 'gotowe' ? gotowosc.dane.biegi_rozplywu : [];
  useEffect(() => {
    if (pfRunId && !biegiRozplywu.some((b) => b.run_id === pfRunId)) setPfRunId('');
  }, [biegiRozplywu, pfRunId]);

  // Wynik: bieg wybrany na ekranie; bez wyboru — ostatni zakończony bieg dynamiki przypadku.
  const biegiDynamiki = useMemo(
    () =>
      biegiPrzypadku
        .filter((r) => r.analysis_type === 'DYNAMIKA_RMS' && r.status === 'DONE')
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [biegiPrzypadku],
  );
  const pokazywanyBiegId = wybranyBiegId ?? biegiDynamiki[0]?.id ?? null;
  useEffect(() => {
    if (!pokazywanyBiegId) {
      setWynik(null);
      return;
    }
    let aktywne = true;
    setWynik({ stan: 'laduje' });
    fetchWynikDynamiki(pokazywanyBiegId)
      .then((dane) => aktywne && setWynik({ stan: 'gotowe', dane }))
      .catch((blad: unknown) => aktywne && setWynik({ stan: 'blad', komunikat: komunikat(blad) }));
    return () => {
      aktywne = false;
    };
  }, [pokazywanyBiegId]);

  const elementyModelu: ElementyModelu = useMemo(() => {
    const wynikMapy: Record<string, { ref: string; nazwa: string }[]> = {};
    const model = (snapshot ?? {}) as unknown as Record<string, unknown>;
    for (const kolekcja of KOLEKCJE_REFERENCJI) {
      const lista = Array.isArray(model[kolekcja]) ? (model[kolekcja] as Record<string, unknown>[]) : [];
      wynikMapy[kolekcja] = lista
        .filter((e) => typeof e.ref_id === 'string')
        .map((e) => ({
          ref: e.ref_id as string,
          // Most nazw wyników (karta #145): ta sama nazwa co na schemacie i w tabelach wyników.
          nazwa: nazwaObiektuZMigawki(snapshot, e.ref_id as string),
        }))
        .sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
    }
    return wynikMapy;
  }, [snapshot]);

  const pokazNaSchemacie = useCallback(
    (ref: string, nazwa?: string, typElementu?: 'Generator' | 'Load') => {
      const element = wynik?.stan === 'gotowe' ? wynik.dane.opis_wyniku.elementy[ref] : undefined;
      const typ = typZaznaczenia(element) ?? typElementu ?? 'Generator';
      selectElement({ id: ref, type: typ, name: nazwa ?? element?.nazwa ?? T.brakNazwy });
      centerSldOnElement(ref);
      setActiveSpace('schemat');
    },
    [centerSldOnElement, selectElement, setActiveSpace, wynik],
  );

  // Wiązanie modelu dynamicznego: kanoniczna operacja `set_der_catalog_bindings` tym samym
  // kanałem co konfigurator wytwórcy (PATCH wiązań, blokada modelu na cały cykl zapisu);
  // odpowiedź podmienia migawkę w magazynie (schemat, warsztat wytwórców i gotowość widzą
  // kopię profilu bez przeładowania). Wyłącznie zmienione pole — pozostałe wiązania nietknięte.
  const powiaz = useCallback(
    async (generatorRef: string, profileId: string | null) => {
      if (!caseId || !projektId) return;
      setZapisywanyRef(generatorRef);
      setBladWiazania(null);
      try {
        const odpowiedz = await patchDerCatalogBindings(projektId, caseId, generatorRef, {
          dynamic_model_ref: profileId,
        });
        // Pusta odpowiedź nie może skasować migawki z ekranu (wzorzec konfiguratora DER).
        if (odpowiedz.snapshot) setSnapshot(odpowiedz);
        notify(profileId ? T.powiazano : T.odwiazano, 'success');
      } catch (blad) {
        setBladWiazania(blad instanceof DerPersistenceApiError ? blad.message : komunikat(blad));
      } finally {
        setZapisywanyRef(null);
      }
      await odswiezGotowosc();
    },
    [caseId, odswiezGotowosc, projektId, setSnapshot],
  );

  // Wiązanie modelu dynamicznego ODBIORU: kanoniczna operacja `set_load_dynamic_binding`
  // przez magazyn migawki (ta sama droga co każda operacja domenowa — blokada modelu,
  // podmiana migawki, historia operacji); backend buduje kopię `Load.dynamika` z profilu.
  const powiazOdbior = useCallback(
    async (loadRef: string, profileId: string | null) => {
      if (!caseId) return;
      setZapisywanyRef(loadRef);
      setBladWiazania(null);
      try {
        const odpowiedz = await useSnapshotStore
          .getState()
          .executeDomainOperation(caseId, 'set_load_dynamic_binding', {
            load_ref: loadRef,
            dynamic_model_ref: profileId,
          });
        // Potwierdzenie sukcesu wydaje magazyn migawki (centralny komunikat operacji
        // domenowej); tu zostaje odmowa backendu pokazana wprost przy sekcji.
        if (odpowiedz === null) {
          setBladWiazania(useSnapshotStore.getState().error ?? T.wiazanieOdbioruBlad);
        } else if (odpowiedz.error) {
          setBladWiazania(odpowiedz.error);
        }
      } catch (blad) {
        setBladWiazania(komunikat(blad));
      } finally {
        setZapisywanyRef(null);
      }
      await odswiezGotowosc();
    },
    [caseId, odswiezGotowosc],
  );

  const zapiszScenariusz = useCallback(
    async (zadanie: Parameters<typeof zapiszScenariuszDynamiki>[1]) => {
      if (!caseId) return;
      const zapisany = await zapiszScenariuszDynamiki(caseId, zadanie);
      setScenariusze((lista) => [
        ...lista.filter((s) => s.scenario_id !== zapisany.scenario_id),
        zapisany,
      ]);
      setScenariuszId(zapisany.scenario_id);
    },
    [caseId],
  );

  const uruchomBieg = useCallback(async () => {
    if (!caseId || opis.stan !== 'gotowe' || !scenariuszId || !pfRunId) return;
    const { nastawy: gotowe, bledy } = zbudujNastawy(opis.dane, nastawy, TEKSTY_WALIDACJI);
    setBledyNastaw(bledy);
    if (!gotowe) return;
    setBladBiegu(null);
    try {
      const koniec = await uruchomBiegDynamiki(
        { caseId, scenarioId: scenariuszId, pfRunId, nastawy: gotowe },
        setBieg,
      );
      await useExecutionRunsStore.getState().loadRuns(caseId);
      if (koniec.status === 'DONE') {
        setWybranyBiegId(koniec.id);
      } else {
        setBladBiegu(koniec.error_message ?? T.stanBiegu.FAILED);
      }
    } catch (blad) {
      setBladBiegu(komunikat(blad));
    }
  }, [caseId, nastawy, opis, pfRunId, scenariuszId]);

  // Świeżość wyniku wobec bieżącego modelu — ta sama derywacja co na każdym ekranie wyników
  // (rewizja biegu z kontraktu przebiegu vs rewizja bieżącego modelu; brak danej = brak znacznika).
  const swiezosc = useSwiezoscNaglowka(wynik?.stan === 'gotowe' ? wynik.dane.run_id : null);

  if (!caseId) {
    return (
      <div className="mvd-dynamika" data-testid="mvd-dynamika">
        <Naglowek />
        <div className="mvd-dynamika-stan" data-testid="mvd-dynamika-bez-przypadku">
          <p>{T.brakPrzypadku}</p>
          <button type="button" className="mvd-dynamika-akcja" onClick={() => setActiveSpace('obliczenia')}>
            {T.brakPrzypadkuAkcja}
          </button>
        </div>
      </div>
    );
  }

  const dane = gotowosc.stan === 'gotowe' ? gotowosc.dane : null;
  const brakiModelu = dane?.braki_modelu ?? [];
  const biegTrwa = bieg !== null && (bieg.status === 'PENDING' || bieg.status === 'RUNNING');
  const warunki: string[] = [];
  if (!scenariuszId) warunki.push(T.warunekScenariusz);
  if (!pfRunId) warunki.push(T.warunekPunktPracy);
  // Odmowa modelu (ten sam predykat co bieg: braki adaptera i kopie nieaktualne) blokuje
  // uruchomienie; punkt pracy jest osobnym, jawnym warunkiem (wybór rozpływu).
  const modelOdmawia = brakiModelu.length > 0 || (dane?.kopie_nieaktualne.length ?? 0) > 0;
  if (modelOdmawia) warunki.push(T.warunekGotowosc);
  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');
  const zaznaczonyRef = zaznaczone[0]?.id ?? null;
  const zaznaczonyWWyniku =
    wynik?.stan === 'gotowe' && zaznaczonyRef && wynik.dane.opis_wyniku.elementy[zaznaczonyRef]
      ? zaznaczonyRef
      : null;

  return (
    <div className="mvd-dynamika" data-testid="mvd-dynamika">
      <Naglowek />

      <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-gotowosc">
        <h4>{T.gotowoscTytul}</h4>
        {gotowosc.stan === 'laduje' && <p className="mvd-dynamika-opis">{T.gotowoscLadowanie}</p>}
        {gotowosc.stan === 'blad' && (
          <div className="mvd-dynamika-blad" role="alert">
            {T.gotowoscBlad} {gotowosc.komunikat}
          </div>
        )}
        {brakiModelu.length > 0 && (
          <div className="mvd-dynamika-braki" data-testid="mvd-dynamika-braki" role="status">
            <strong>{T.brakiModeluTytul}</strong>
            <ul>
              {brakiModelu.map((b) => (
                <li key={b.kod} data-kod={b.kod}>
                  {b.komunikat_pl}
                </li>
              ))}
            </ul>
          </div>
        )}
        {dane?.gotowosc.recommended_action_pl && dane.gotowosc.status !== 'ready' && (
          <p className="mvd-dynamika-opis">{dane.gotowosc.recommended_action_pl}</p>
        )}
      </section>

      {dane && (
        <>
          {bladWiazania && (
            <div className="mvd-dynamika-blad" role="alert" data-testid="mvd-dynamika-wiazanie-blad">
              {bladWiazania}
            </div>
          )}
          <SekcjaModeliZrodel
            zrodla={dane.zrodla}
            odbiory={dane.odbiory}
            profileOdbiorow={dane.profile_odbiorow}
            wskazanyRef={wskazanyElement}
            zapisywanyRef={zapisywanyRef}
            onPowiaz={(ref, profil) => void powiaz(ref, profil)}
            onPowiazOdbior={(ref, profil) => void powiazOdbior(ref, profil)}
            onPokazNaSchemacie={(ref, nazwa) =>
              pokazNaSchemacie(
                ref,
                nazwa,
                dane.odbiory.some((o) => o.ref_id === ref) ? 'Load' : 'Generator',
              )
            }
          />

          <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-punkt-pracy">
            <h4>{T.punktPracyTytul}</h4>
            <p className="mvd-dynamika-opis">{T.punktPracyOpis}</p>
            {dane.biegi_rozplywu.length === 0 ? (
              <div className="mvd-dynamika-wiersz-akcji">
                <span className="mvd-dynamika-powod">{T.punktPracyBrak}</span>
                <button
                  type="button"
                  className="mvd-dynamika-akcja"
                  data-testid="mvd-dynamika-policz-rozplyw"
                  disabled={rozplywWToku}
                  onClick={() => uruchomObliczenie('LOAD_FLOW')}
                >
                  {rozplywWToku ? T.punktPracyLicze : T.punktPracyAkcja}
                </button>
              </div>
            ) : (
              <label className="mvd-dynamika-pole">
                <span className="mvd-dynamika-pole-etykieta">{T.punktPracyEtykieta} *</span>
                <select
                  data-testid="mvd-dynamika-punkt-pracy-wybor"
                  value={pfRunId}
                  onChange={(e) => setPfRunId(e.target.value)}
                >
                  <option value="">…</option>
                  {dane.biegi_rozplywu.map((b) => (
                    <option key={b.run_id} value={b.run_id}>
                      {T.punktPracyEtykieta} {new Date(b.finished_at ?? b.created_at).toLocaleString('pl-PL')}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        </>
      )}

      {opis.stan === 'blad' && (
        <div className="mvd-dynamika-blad" role="alert">
          {opis.komunikat}
        </div>
      )}
      {opis.stan === 'gotowe' && (
        <>
          <EdytorScenariusza
            opis={opis.dane}
            scenariusze={scenariusze}
            wybranyId={scenariuszId}
            elementy={elementyModelu}
            onWybierz={setScenariuszId}
            onZapisz={zapiszScenariusz}
          />
          <FormularzNastaw
            opis={opis.dane}
            wartosci={nastawy}
            bledy={bledyNastaw}
            onZmiana={(nazwa, v) => setNastawy((n) => ({ ...n, [nazwa]: v }))}
          />
        </>
      )}

      <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-bieg">
        <h4>{T.biegTytul}</h4>
        {warunki.length > 0 && (
          <ul className="mvd-dynamika-warunki" data-testid="mvd-dynamika-warunki">
            {warunki.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <div className="mvd-dynamika-wiersz-akcji">
          <button
            type="button"
            className="mvd-dynamika-akcja"
            data-testid="mvd-dynamika-uruchom"
            disabled={biegTrwa || !scenariuszId || !pfRunId || modelOdmawia || opis.stan !== 'gotowe'}
            onClick={() => void uruchomBieg()}
          >
            {T.uruchom}
          </button>
          {bieg && (
            <span className="mvd-dynamika-stan-biegu" data-testid="mvd-dynamika-stan-biegu" data-status={bieg.status}>
              {etykietaZeSlownika(T.stanBiegu, bieg.status)}
            </span>
          )}
        </div>
        {bladBiegu && (
          <div className="mvd-dynamika-blad" role="alert" data-testid="mvd-dynamika-bieg-blad">
            {T.bladBiegu} {bladBiegu}
          </div>
        )}
        {biegiDynamiki.length > 1 && (
          <label className="mvd-dynamika-pole">
            <span className="mvd-dynamika-pole-etykieta">{T.poprzednieBiegi}</span>
            <select
              data-testid="mvd-dynamika-wybor-biegu"
              value={pokazywanyBiegId ?? ''}
              onChange={(e) => setWybranyBiegId(e.target.value || null)}
            >
              {biegiDynamiki.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.finished_at ?? r.created_at ?? '').toLocaleString('pl-PL')}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {wynik?.stan === 'laduje' && <p className="mvd-dynamika-opis">{T.wynikLadowanie}</p>}
      {wynik?.stan === 'blad' && (
        <div className="mvd-dynamika-blad" role="alert">
          {T.wynikBlad} {wynik.komunikat}
        </div>
      )}
      {wynik?.stan === 'gotowe' && (
        <Wynik
          wynik={wynik.dane}
          swiezosc={swiezosc}
          trybEkspercki={trybEkspercki}
          zaznaczonyRef={zaznaczonyWWyniku}
          onPokazNaSchemacie={(ref) => pokazNaSchemacie(ref)}
        />
      )}
    </div>
  );
}

function Naglowek() {
  return (
    <header className="mvd-dynamika-head">
      <span className="mvd-dynamika-lbl">{T.eyebrow}</span>
      <h3>{T.tytul}</h3>
      <p className="mvd-dynamika-cel">{T.cel}</p>
    </header>
  );
}

function Wynik({
  wynik,
  swiezosc,
  trybEkspercki,
  zaznaczonyRef,
  onPokazNaSchemacie,
}: {
  wynik: WynikDynamiki;
  swiezosc: SwiezoscNaglowka;
  trybEkspercki: boolean;
  zaznaczonyRef: string | null;
  onPokazNaSchemacie: (ref: string) => void;
}) {
  const w = wynik.wlasnosci_biegu;
  const { rewizjaModelu, rewizjaDanych, caseId } = swiezosc;
  const maSwiezosc = rewizjaModelu !== undefined && rewizjaDanych !== undefined;
  return (
    <div className="mvd-dynamika-wynik" data-testid="mvd-dynamika-wynik">
      {maSwiezosc && (
        <div className="mvd-dynamika-swiezosc" data-testid="mvd-dynamika-swiezosc">
          <FreshnessBadge rewizjaDanej={rewizjaDanych} rewizjaModelu={rewizjaModelu} />
        </div>
      )}
      {maSwiezosc && caseId !== undefined && rewizjaDanych < rewizjaModelu && (
        <PanelCoSieZmienilo caseId={caseId} rewizjaDanych={rewizjaDanych} onPokazElement={onPokazNaSchemacie} />
      )}
      <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-oceny">
        <h4>{T.ocenyTytul}</h4>
        <p className="mvd-dynamika-opis" data-testid="mvd-dynamika-tryb" data-tryb={wynik.tryb_scenariusza}>
          {T.trybScenariusza}: <strong>{etykietaZeSlownika(T.tryby, wynik.tryb_scenariusza)}</strong>
        </p>
        {wynik.stopien_dowodowy.map((s) => (
          <p key={s.capability_id} className="mvd-dynamika-poziom" data-testid="mvd-dynamika-poziom" data-tier={s.tier}>
            {T.poziomDowodowy}: <strong>{s.tier_pl}</strong> ({s.claim_kind_pl}
            {s.regulatory_evidence_eligible ? '' : `, ${T.niedopuszczalnyRegulacyjnie}`})
          </p>
        ))}
        {wynik.oceny.map((ocena) => (
          <OcenaNiewykonana
            key={ocena.kryterium_id}
            ocena={ocena}
            testid={`mvd-dynamika-ocena-${ocena.kryterium_id.split('.')[1] ?? ocena.kryterium_id}`}
          />
        ))}
      </section>
      <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-zalozenia">
        <h4>{T.zalozeniaTytul}</h4>
        {/* Jedna lista: zdania z nazwami elementów złożone w backendzie z rekordów rdzenia
            i założeń wejścia (karta modeli odbiorów — rdzeń dynamiki nie pisze zdań, więc
            zapisu technicznego rdzenia na tym ekranie nie ma). */}
        <ul>
          {wynik.opis_wyniku.zalozenia_modelu.map((z) => (
            <li key={z}>{z}</li>
          ))}
        </ul>
      </section>
      <PrzegladarkaPrzebiegow
        wynik={wynik}
        zaznaczonyRef={zaznaczonyRef}
        onPokazNaSchemacie={onPokazNaSchemacie}
      />
      <InformacjeAudytowe
        trybEkspercki={trybEkspercki}
        testid="mvd-dynamika-audyt"
        wiersze={[
          { etykieta: T.audytRun, wartosc: wynik.run_id },
          { etykieta: T.audytWersja, wartosc: wynik.tozsamosc.wersja_solvera ?? '—' },
          { etykieta: T.audytKroki, wartosc: `${w.kroki} (${w.kroki_odrzucone})` },
          {
            etykieta: T.audytResiduum,
            wartosc: `${fmtLiczba(w.max_residuum_f, 3)} / ${fmtLiczba(w.max_residuum_g, 3)}`,
          },
          { etykieta: T.audytCzas, wartosc: fmtLiczba(w.czas_obliczen_s, 4) },
          ...Object.entries(wynik.tozsamosc)
            .filter(([k]) => k !== 'wersja_solvera')
            .map(([k, v]) => ({ etykieta: T.audytOdcisk[k] ?? k, wartosc: v })),
        ]}
      />
    </div>
  );
}
