/**
 * Kreator „Odcinek nN" (add_nn_cable_segment) — ui2, framework kreatory/rama.
 *
 * Wyprowadza kabel nN z zaznaczonej szyny (kontekst: drzewo nN STUDIO albo
 * schemat) do NOWEJ szyny odbiorczej — backend tworzy szynę końcową sam
 * (`to_bus_ref` pominięty), zgodnie z zakresem pól planu F §3 (picker
 * KABEL_NN + długość + ułożenie + n_parallel; wskazanie ISTNIEJĄCEJ szyny
 * docelowej NIE jest polem tej karty). Builder pozostaje otwarty po zapisie
 * (wzorzec `KreatorMagistralaSn`) — nowa szyna staje się startem kolejnego
 * odcinka, żeby rozbudowa obwodu nN nie wymagała ponownego otwierania okna.
 *
 * Podgląd ΔU: `POST /api/solver/cable-voltage-drop-preview` (S20) — fizyka
 * spadku napięcia jest niezależna od pasma napięcia (ta sama formuła co dla
 * SN), więc REUSE bez zastrzeżeń. Podgląd Iz′ (obciążalność skorygowana
 * warunkami ułożenia) NIE jest tu dostępny: jedyny wystawiony endpoint
 * podglądu (`/api/solver/cable-ampacity-derating-preview`) woła
 * `wspolczynniki_z_opisu` (parser SN, zestawy f_grunt/f_wiazka/f_grupa) —
 * INNA fizyka niż `cable_ampacity_derating.wspolczynniki_nn` (tablice
 * PN-HD 60364-5-52), której backend używa przy zapisie tej operacji. Użycie
 * endpointu SN dla opisu nN byłoby dokładnie tym błędem klasy (druga ścieżka
 * tej samej fizyki), przed którym ostrzega reguła KLASA NIE INSTANCJA — więc
 * podgląd Iz′ jest tu ŚWIADOMIE pominięty (informacja w panelu), nie
 * podrobiony. Luka nazwana w meldunku karty P0.9.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchLvCableTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { LVCableType } from '../../../ui/catalog/types';
import {
  fetchCableVoltageDrop,
  type CableVoltageDropResponse,
} from '../../../ui/network-build/forms/cableVoltageDropApi';
import { resolveBusNnRef } from '../../../ui/network-build/forms/enmResolvers';
import { validateCatalogFirst } from '../../../ui/network-build/forms/catalogFirstRules';
import { useActiveOperationForm, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type {
  AddNNCableSegmentPayload,
  NNCableLayingConditionsDescription,
} from '../../../types/domainOps';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorPodsumowanie,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PanelTeorii,
  PoleKatalogu,
  PoleLiczbowe,
  PolePrzelacznik,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  useSelekcjaPoOperacjiBezNawigacji,
  type WierszGotowosci,
} from '../rama';
import { ODCINEK_NN_STRINGS as T } from './strings';

type TrybUlozenia = 'katalogowe' | 'wlasne';

interface Zbudowany {
  nazwa: string;
  dlugoscM: number;
  przekroj: number | null;
}

function fmt(n: number | null | undefined, jedn: string, miejsca = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(miejsca).replace('.', ',')} ${jedn}`;
}

export function KreatorOdcinkaNn() {
  const activeForm = useActiveOperationForm();
  const context = activeForm?.context as Record<string, unknown> | undefined;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcja = useSelekcjaPoOperacjiBezNawigacji();

  const [fromBusRef, setFromBusRef] = useState<string | null>(() => resolveBusNnRef(context, snapshot));
  useEffect(() => {
    setFromBusRef(resolveBusNnRef(context, snapshot));
  }, [context, snapshot]);

  const fromBus = useMemo(
    () => snapshot?.buses.find((b) => b.ref_id === fromBusRef || b.id === fromBusRef) ?? null,
    [snapshot, fromBusRef],
  );

  const [kable, setKable] = useState<LVCableType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  useEffect(() => {
    let anulowane = false;
    fetchLvCableTypes()
      .then((dane) => {
        if (!anulowane) setKable(Array.isArray(dane) ? dane : []);
      })
      .catch((e: unknown) => {
        if (!anulowane) setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      anulowane = true;
    };
  }, []);

  const [catalogRef, setCatalogRef] = useState<string | null>(null);
  const [nazwa, setNazwa] = useState('');
  const [dlugoscM, setDlugoscM] = useState<number | null>(null);
  const [nParallel, setNParallel] = useState<number | null>(1);
  const [trybUlozenia, setTrybUlozenia] = useState<TrybUlozenia>('katalogowe');
  const [srodowisko, setSrodowisko] = useState<'powietrze' | 'grunt'>('powietrze');
  const [izolacja, setIzolacja] = useState<'PVC' | 'XLPE'>('PVC');
  const [temperaturaC, setTemperaturaC] = useState<number | null>(25);
  const [liczbaObwodow, setLiczbaObwodow] = useState<number | null>(1);
  const [rezystywnoscGruntu, setRezystywnoscGruntu] = useState<number | null>(null);
  const [ibPodgladu, setIbPodgladu] = useState<number | null>(null);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [zbudowane, setZbudowane] = useState<Zbudowany[]>([]);

  const wybranyKabel = useMemo(() => kable.find((k) => k.id === catalogRef) ?? null, [kable, catalogRef]);

  const [podglad, setPodglad] = useState<CableVoltageDropResponse | null>(null);
  const [bladPodgladu, setBladPodgladu] = useState<string | null>(null);
  useEffect(() => {
    if (!wybranyKabel || !ibPodgladu || ibPodgladu <= 0 || !dlugoscM || dlugoscM <= 0 || !fromBus) {
      setPodglad(null);
      setBladPodgladu(null);
      return;
    }
    let anulowane = false;
    const t = setTimeout(() => {
      fetchCableVoltageDrop({
        current_a: ibPodgladu,
        length_km: dlugoscM / 1000,
        r_ohm_per_km: wybranyKabel.r_ohm_per_km,
        x_ohm_per_km: wybranyKabel.x_ohm_per_km,
        cos_phi: 0.9,
        line_voltage_v: fromBus.voltage_kv * 1000,
      })
        .then((res) => {
          if (!anulowane) {
            setPodglad(res);
            setBladPodgladu(null);
          }
        })
        .catch(() => {
          if (!anulowane) {
            setPodglad(null);
            setBladPodgladu(T.podgladBlad);
          }
        });
    }, 250);
    return () => {
      anulowane = true;
      clearTimeout(t);
    };
  }, [wybranyKabel, ibPodgladu, dlugoscM, fromBus]);

  const layingConditions: NNCableLayingConditionsDescription | null =
    trybUlozenia === 'wlasne' && temperaturaC !== null && liczbaObwodow !== null
      ? {
          environment: srodowisko,
          insulation: izolacja,
          ambient_temperature_c: temperaturaC,
          circuit_count: liczbaObwodow,
          ...(srodowisko === 'grunt' ? { soil_thermal_resistivity_km_w: rezystywnoscGruntu ?? undefined } : {}),
        }
      : null;

  const kompletne = Boolean(fromBusRef && catalogRef && dlugoscM && dlugoscM > 0);
  const brakStartu = !fromBusRef;

  const resetujFormularz = useCallback((noweFromBusRef: string) => {
    setFromBusRef(noweFromBusRef);
    setNazwa('');
    setDlugoscM(null);
    setIbPodgladu(null);
  }, []);

  const onZapisz = useCallback(
    async (kontynuuj: boolean) => {
      if (!fromBusRef) {
        setBladGlobalny(T.brakStartuOpis);
        return;
      }
      if (!activeCaseId) {
        setBladGlobalny(T.brakZakresu);
        return;
      }
      const payload: AddNNCableSegmentPayload = {
        from_bus_ref: fromBusRef,
        length_m: dlugoscM ?? 0,
        n_parallel: nParallel ?? 1,
        catalog_ref: catalogRef,
        name: nazwa.trim() || undefined,
        cable_laying_conditions: layingConditions ?? undefined,
      };
      const catalogError = validateCatalogFirst('add_nn_cable_segment', payload as unknown as Record<string, unknown>);
      if (catalogError) {
        setBladGlobalny(catalogError);
        return;
      }
      setBladGlobalny(null);
      try {
        const response = await executeDomainOperation(
          activeCaseId,
          'add_nn_cable_segment',
          payload as unknown as Record<string, unknown>,
        );
        if (!response) {
          setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
          return;
        }
        if (response.error) {
          setBladGlobalny(response.error);
          return;
        }
        const nowaSzynaRef = response.changes.created_element_ids.find((id) => id !== response.selection_hint?.element_id)
          ?? response.selection_hint?.element_id
          ?? null;
        setZbudowane((prev) => [
          ...prev,
          { nazwa: nazwa.trim() || 'Kabel nN', dlugoscM: dlugoscM ?? 0, przekroj: wybranyKabel?.cross_section_mm2 ?? null },
        ]);
        if (kontynuuj && nowaSzynaRef) {
          resetujFormularz(nowaSzynaRef);
          selekcja(response, { type: 'LineBranch', name: nazwa.trim() || 'Kabel nN' });
          return;
        }
        closeForm();
        selekcja(response, { type: 'LineBranch', name: nazwa.trim() || 'Kabel nN' });
      } catch (e) {
        setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
      }
    },
    [activeCaseId, catalogRef, closeForm, dlugoscM, executeDomainOperation, fromBusRef, layingConditions, nazwa, nParallel, resetujFormularz, selekcja, wybranyKabel],
  );

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszSzyna, stan: fromBusRef ? 'kompletne' : 'brak', wartosc: fromBus?.name ?? fromBusRef ?? '—' },
    { etykieta: T.wierszKabel, stan: catalogRef ? 'kompletne' : 'brak', wartosc: wybranyKabel?.name ?? 'Do wyboru' },
    { etykieta: T.wierszDlugosc, stan: dlugoscM && dlugoscM > 0 ? 'kompletne' : 'brak', wartosc: dlugoscM ? `${dlugoscM} m` : 'Do wprowadzenia' },
  ];

  const aside = (
    <>
      <KreatorPodsumowanie tytul={T.builderTytul} testid="mvd-kreator-odcinek-nn-builder">
        {zbudowane.length === 0 ? (
          <p className="mvd-podsum-komunikat">{T.builderPusto}</p>
        ) : (
          zbudowane.map((z, i) => (
            <RzadWartosci
              key={`${i}-${z.nazwa}`}
              etykieta={`${i + 1}. ${z.nazwa}`}
              wartosc={`${fmt(z.przekroj, 'mm²', 0)} · ${z.dlugoscM} m`}
            />
          ))
        )}
      </KreatorPodsumowanie>
      <KreatorPodsumowanie
        tytul={T.sekcjaPodgladTytul}
        komunikat={bladPodgladu ?? (!podglad ? T.podgladBrak : null)}
        komunikatTon="warn"
        testid="mvd-kreator-odcinek-nn-podglad"
      >
        {podglad ? (
          <>
            <RzadWartosci etykieta={T.podgladDeltaU} wartosc={fmt(podglad.delta_u_v, 'V')} />
            <RzadWartosci etykieta={T.podgladDeltaUpct} wartosc={fmt(podglad.delta_u_pct, '%')} />
          </>
        ) : null}
      </KreatorPodsumowanie>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-odcinek-nn-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  return (
    <KreatorRama
      eyebrow={T.eyebrow}
      tytul={T.tytul}
      cel={T.cel}
      odznaka={T.odznaka}
      pelny
      aside={aside}
      bladGlobalny={bladGlobalny}
      walidacja={!kompletne ? T.walidacjaStopka : null}
      akcjaGlowna={{
        etykieta: T.builderDodaj,
        onClick: () => onZapisz(true),
        zablokowana: !kompletne || !activeCaseId,
        testid: 'mvd-kreator-odcinek-nn-zapisz',
      }}
      akcjaAnuluj={
        zbudowane.length > 0
          ? { etykieta: T.builderZakoncz, onClick: () => onZapisz(false), testid: 'mvd-kreator-odcinek-nn-zakoncz' }
          : { etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-odcinek-nn-anuluj' }
      }
      testid="mvd-kreator-odcinek-nn"
    >
      {brakStartu ? (
        <KreatorSekcja tytul={T.brakStartuTytul} testid="mvd-kreator-odcinek-nn-brak-startu">
          <KreatorInfo>{T.brakStartuOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      <KreatorSekcja tytul={T.sekcjaTypTytul} nota={fromBus?.name ?? undefined} testid="mvd-kreator-odcinek-nn-typ">
        <KreatorInfo>{T.typPomoc}</KreatorInfo>
        <PoleKatalogu
          etykieta={T.kabel}
          wartosc={catalogRef}
          onZmiana={setCatalogRef}
          opcje={kable.map((k) => ({
            id: k.id,
            etykieta: `${k.name} · ${k.cross_section_mm2} mm² · ${k.i_max_a} A`,
          }))}
          status={bladKatalogu ? 'error' : kable.length > 0 ? 'ready' : 'loading'}
          placeholder={T.kabelPlaceholder}
          komunikatBledu={bladKatalogu ?? T.kabelBlad}
          testid="mvd-kreator-odcinek-nn-kabel"
        />
        <PoleTekstowe
          etykieta={T.nazwa}
          wartosc={nazwa}
          onZmiana={setNazwa}
          placeholder={T.nazwaPlaceholder}
          testid="mvd-kreator-odcinek-nn-nazwa"
        />
        {wybranyKabel ? (
          <>
            <KreatorInfo>{T.paramSekcjaNormowa}</KreatorInfo>
            <KreatorSiatka kolumny={3}>
              <RzadWartosci etykieta={T.paramPrzekroj} wartosc={fmt(wybranyKabel.cross_section_mm2, 'mm²', 0)} />
              <RzadWartosci etykieta={T.paramR} wartosc={fmt(wybranyKabel.r_ohm_per_km, 'Ω/km', 4)} />
              <RzadWartosci etykieta={T.paramX} wartosc={fmt(wybranyKabel.x_ohm_per_km, 'Ω/km', 4)} />
              <RzadWartosci etykieta={T.paramIzNominalne} wartosc={fmt(wybranyKabel.i_max_a, 'A', 0)} />
              <RzadWartosci etykieta={T.paramMaterial} wartosc={wybranyKabel.conductor_material ?? '—'} />
              <RzadWartosci etykieta={T.paramLiczbaZyl} wartosc={String(wybranyKabel.number_of_cores ?? '—')} />
            </KreatorSiatka>
          </>
        ) : null}
      </KreatorSekcja>

      <KreatorSekcja tytul={T.sekcjaParametryTytul} testid="mvd-kreator-odcinek-nn-parametry">
        <KreatorSiatka kolumny={2}>
          <PoleLiczbowe
            etykieta={T.dlugosc}
            jednostka="m"
            wartosc={dlugoscM}
            onZmiana={setDlugoscM}
            wymagane
            testid="mvd-kreator-odcinek-nn-dlugosc"
          />
          <PoleLiczbowe
            etykieta={T.nParallel}
            wartosc={nParallel}
            onZmiana={setNParallel}
            min={1}
            krok={1}
            pomoc={T.nParallelPomoc}
            testid="mvd-kreator-odcinek-nn-nparallel"
          />
        </KreatorSiatka>
        <PoleLiczbowe
          etykieta={T.ibPodgladu}
          jednostka="A"
          wartosc={ibPodgladu}
          onZmiana={setIbPodgladu}
          pomoc={T.ibPodgladuPomoc}
          testid="mvd-kreator-odcinek-nn-ib"
        />
      </KreatorSekcja>

      <KreatorSekcja tytul={T.sekcjaUlozenieTytul} testid="mvd-kreator-odcinek-nn-ulozenie">
        <KreatorInfo>{T.ulozeniePomoc}</KreatorInfo>
        <PolePrzelacznik
          opcje={[
            { id: 'katalogowe', etykieta: T.ulozenieKatalogowe },
            { id: 'wlasne', etykieta: T.ulozenieWlasne },
          ]}
          wartosc={trybUlozenia}
          onZmiana={(v) => setTrybUlozenia(v as TrybUlozenia)}
          testid="mvd-kreator-odcinek-nn-tryb-ulozenia"
        />
        {trybUlozenia === 'wlasne' ? (
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.srodowisko}
              wartosc={srodowisko}
              onZmiana={(v) => setSrodowisko(v as 'powietrze' | 'grunt')}
              opcje={[
                { id: 'powietrze', etykieta: T.srodowiskoPowietrze },
                { id: 'grunt', etykieta: T.srodowiskoGrunt },
              ]}
              testid="mvd-kreator-odcinek-nn-srodowisko"
            />
            <PoleWyboru
              etykieta={T.izolacja}
              wartosc={izolacja}
              onZmiana={(v) => setIzolacja(v as 'PVC' | 'XLPE')}
              opcje={[
                { id: 'PVC', etykieta: 'PVC' },
                { id: 'XLPE', etykieta: 'XLPE' },
              ]}
              testid="mvd-kreator-odcinek-nn-izolacja"
            />
            <PoleLiczbowe
              etykieta={T.temperatura}
              jednostka="°C"
              wartosc={temperaturaC}
              onZmiana={setTemperaturaC}
              testid="mvd-kreator-odcinek-nn-temperatura"
            />
            <PoleLiczbowe
              etykieta={T.liczbaObwodow}
              wartosc={liczbaObwodow}
              onZmiana={setLiczbaObwodow}
              min={1}
              krok={1}
              testid="mvd-kreator-odcinek-nn-liczba-obwodow"
            />
            {srodowisko === 'grunt' ? (
              <PoleLiczbowe
                etykieta={T.rezystywnoscGruntu}
                jednostka="K·m/W"
                wartosc={rezystywnoscGruntu}
                onZmiana={setRezystywnoscGruntu}
                wymagane
                testid="mvd-kreator-odcinek-nn-rezystywnosc"
              />
            ) : null}
          </KreatorSiatka>
        ) : null}
        <KreatorInfo>{T.izPrimaBrak}</KreatorInfo>
        <PanelTeorii
          tytul={T.teoriaTytul}
          opis={T.teoriaOpis}
          wymog={T.teoriaWymog}
          podstawa={T.teoriaPodstawa}
          testid="mvd-kreator-odcinek-nn-teoria"
        />
      </KreatorSekcja>

      {/* Otwiera kreator „Aparat nN" z nowej szyny po zapisie — łańcuchowanie kroku, bez fabrykacji. */}
      {zbudowane.length > 0 ? (
        <button
          type="button"
          className="mvd-kreator-link-btn"
          data-testid="mvd-kreator-odcinek-nn-dodaj-aparat"
          onClick={() => {
            const busRef = fromBusRef;
            closeForm();
            if (busRef) {
              openOperationForm('add_nn_switch_device', { from_bus_ref: busRef });
            }
          }}
        >
          {T.builderNastepny}
        </button>
      ) : null}
    </KreatorRama>
  );
}
