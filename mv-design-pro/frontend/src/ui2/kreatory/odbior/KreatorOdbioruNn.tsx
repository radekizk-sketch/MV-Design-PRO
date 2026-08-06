/**
 * Kreator „Dodaj odbiór nN" (V12K-050, G-NN) — ui2, kreatory/rama.
 *
 * Katalog OBCIAZENIE opcjonalny; prąd/S liczy backend (R1), moc bierną Q wyprowadza
 * operacja `add_nn_load` z cosφ. ZERO fizyki w UI. Odbiory zasilają rozpływ mocy,
 * analizę łuku, bilans energii i identyfikację granic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchLoadTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { LoadCatalogType } from '../../../ui/catalog/types';
import {
  fetchCableRatedCurrent,
  type CableRatedCurrentResponse,
} from '../../../ui/network-build/forms/cableVoltageDropApi';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
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
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  TekstZWzorami,
  useSelekcjaPoOperacji,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import {
  czyZipDomyslny,
  DANE_DOMYSLNE,
  fmtA,
  fmtKva,
  fmtKw,
  maOdplyw,
  prefillZKatalogu,
  sumaUdzialowZip,
  walidujFormularz,
  zbudujPayload,
  zbudujZapytaniePodgladu,
  type BladPola,
  type ConnectionType,
  type KontekstOdbioru,
  type LoadKind,
  type OdbiorFormData,
  type PoleZip,
} from './odbiorModel';
import { ODBIOR_STRINGS as T } from './strings';
import { WykresTrojkatMocy } from './WykresTrojkatMocy';

const KROKI: readonly KrokKreatora[] = [
  { id: 'dane', tytul: T.krokDane },
  { id: 'zapis', tytul: T.krokZapis },
];

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function kontekstZOperacji(context: Record<string, unknown> | null): KontekstOdbioru {
  if (!context) return {};
  const v = Number(context.bus_voltage_kv ?? context.voltage_kv);
  return {
    feeder_ref: trimmed(context.feeder_ref) || undefined,
    bus_nn_ref: trimmed(context.bus_nn_ref) || undefined,
    feeder_name: trimmed(context.feeder_name ?? context.field_name) || undefined,
    bus_voltage_kv: Number.isFinite(v) && v > 0 ? v : undefined,
  };
}

export function KreatorOdbioruNn() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const kontekst = useMemo(() => kontekstZOperacji(context), [context]);
  const hasOdplyw = maOdplyw(kontekst);
  const napiecieV = (kontekst.bus_voltage_kv ?? 0.4) * 1000;

  const [dane, setDane] = useState<OdbiorFormData>(() => ({ ...DANE_DOMYSLNE }));
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('dane');

  const [typy, setTypy] = useState<LoadCatalogType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  const [podglad, setPodglad] = useState<CableRatedCurrentResponse | null>(null);
  const [bladPodgladu, setBladPodgladu] = useState<string | null>(null);
  const previewSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    fetchLoadTypes()
      .then((t) => {
        if (!cancelled) setTypy(Array.isArray(t) ? t : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setTypy([]);
        setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const zapytanie = zbudujZapytaniePodgladu(dane, napiecieV);
    if (!zapytanie) {
      setPodglad(null);
      setBladPodgladu(null);
      return;
    }
    const seq = ++previewSeq.current;
    const t = setTimeout(() => {
      fetchCableRatedCurrent(zapytanie)
        .then((res) => {
          if (seq !== previewSeq.current) return;
          setPodglad(res);
          setBladPodgladu(null);
        })
        .catch(() => {
          if (seq !== previewSeq.current) return;
          setPodglad(null);
          setBladPodgladu(T.podgladBlad);
        });
    }, 200);
    return () => clearTimeout(t);
  }, [dane, napiecieV]);

  const opcjeTypow = useMemo(
    () => typy.map((t) => ({ id: t.id, etykieta: `${t.name} · ${t.p_kw} kW${typeof t.cos_phi === 'number' ? ` · cosφ ${t.cos_phi}` : ''}` })),
    [typy],
  );

  const zmien = useCallback(<K extends keyof OdbiorFormData>(pole: K, wartosc: OdbiorFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
  }, []);

  const zmienKatalog = useCallback(
    (catalogRef: string | null) => setDane((p) => prefillZKatalogu(p, catalogRef, typy)),
    [typy],
  );

  const zmienZip = useCallback((pole: PoleZip, wartosc: number | null) => {
    setDane((p) => ({ ...p, zip: { ...p.zip, [pole]: wartosc ?? 0 } }));
  }, []);

  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;

  const onZapisz = useCallback(async () => {
    if (!hasOdplyw) {
      setBladGlobalny(T.brakOdplywuOpis);
      return;
    }
    const walid = walidujFormularz(dane);
    setBledy(walid);
    if (walid.length > 0) return;
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId, 'add_nn_load', zbudujPayload(dane, kontekst));
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.walidacjaStopka);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, { type: 'LoadNN', name: dane.nazwa.trim() || 'Odbiór nN' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, hasOdplyw, kontekst, selekcjaPoOperacji]);

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszOdplyw,
      stan: hasOdplyw ? 'kompletne' : 'brak',
      wartosc: kontekst.feeder_name || (hasOdplyw ? 'Wskazany' : 'Brak'),
    },
    {
      etykieta: T.wierszMoc,
      stan: dane.active_power_kw && dane.active_power_kw > 0 ? 'kompletne' : 'brak',
      wartosc: fmtKw(dane.active_power_kw),
    },
    { etykieta: T.wierszCos, stan: 'kompletne', wartosc: dane.cos_phi.toFixed(2) },
    {
      etykieta: T.zipWierszModel,
      stan: bledy.some((b) => b.field.startsWith('zip.')) ? 'brak' : 'kompletne',
      wartosc: czyZipDomyslny(dane.zip) ? T.zipModelStalaMoc : T.zipModelWlasny,
    },
    { etykieta: T.wierszPrad, stan: podglad ? 'kompletne' : 'ostrzezenie', wartosc: fmtA(podglad?.rated_current_a) },
  ];

  const aside = (
    <>
      <KreatorPodsumowanie
        tytul={T.podgladTytul}
        komunikat={bladPodgladu}
        komunikatTon="warn"
        testid="mvd-kreator-odbior-podsumowanie"
      >
        {podglad ? (
          <>
            <RzadWartosci etykieta={T.podgladI} wartosc={fmtA(podglad.rated_current_a)} />
            <RzadWartosci etykieta={T.podgladS} wartosc={fmtKva(podglad.apparent_power_kva)} />
            <RzadWartosci etykieta={T.podgladZrodlo} wartosc={T.podgladZrodloWartosc} />
          </>
        ) : bladPodgladu ? null : (
          /* Polecenie podania mocy i cosfi TYLKO wtedy, gdy naprawde ich brakuje.
             Przy bledzie uslugi ten tekst przeczylby banerowi nad nim i wskazywalby
             projektanta jako przyczyne cudzej awarii (V12K-260). */
          <p className="mvd-podsum-komunikat">{T.podgladBrak}</p>
        )}
      </KreatorPodsumowanie>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-odbior-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const krokIndex = KROKI.findIndex((k) => k.id === krok);

  return (
    <KreatorRama
      eyebrow={T.eyebrow}
      tytul={T.eyebrow}
      cel={T.cel}
      odznaka={T.odznaka}
      kroki={KROKI}
      krokAktywny={krok}
      onKrok={setKrok}
      pelny
      aside={aside}
      bladGlobalny={bladGlobalny}
      walidacja={bledy.length > 0 ? T.walidacjaStopka : !hasOdplyw ? T.brakOdplywuOpis : null}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !hasOdplyw || !activeCaseId, testid: 'mvd-kreator-odbior-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-odbior-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-odbior-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-odbior-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-odbior"
    >
      {!hasOdplyw ? (
        <KreatorSekcja tytul={T.brakOdplywuTytul} testid="mvd-kreator-odbior-brak">
          <KreatorInfo>{T.brakOdplywuOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'dane' ? (
        <KreatorSekcja tytul={T.krokDane} testid="mvd-kreator-odbior-dane">
          <KreatorInfo>{T.typPomoc}</KreatorInfo>
          <PoleKatalogu
            etykieta={T.typKatalog}
            wartosc={dane.catalog_ref}
            onZmiana={zmienKatalog}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.typKatalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.typBlad}
            testid="mvd-kreator-odbior-katalog"
          />
          <KreatorSiatka kolumny={2}>
            <PoleLiczbowe
              etykieta={T.moc}
              jednostka="kW"
              wartosc={dane.active_power_kw}
              onZmiana={(v) => zmien('active_power_kw', v)}
              wymagane
              blad={bladDlaPola('active_power_kw')}
              testid="mvd-kreator-odbior-moc"
            />
            <PoleLiczbowe
              etykieta={T.cosPhi}
              wartosc={dane.cos_phi}
              onZmiana={(v) => zmien('cos_phi', v ?? 0)}
              krok={0.01}
              blad={bladDlaPola('cos_phi')}
              testid="mvd-kreator-odbior-cosphi"
            />
            <PoleLiczbowe
              etykieta={T.qOverride}
              jednostka="kvar"
              wartosc={dane.reactive_power_kvar}
              onZmiana={(v) => zmien('reactive_power_kvar', v)}
              pomoc={T.qOverridePomoc}
              testid="mvd-kreator-odbior-q"
            />
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={dane.nazwa}
              onZmiana={(v) => zmien('nazwa', v)}
              placeholder={T.nazwaPlaceholder}
              testid="mvd-kreator-odbior-nazwa"
            />
            <PoleWyboru
              etykieta={T.rodzaj}
              wartosc={dane.load_kind}
              onZmiana={(v) => zmien('load_kind', v as LoadKind)}
              opcje={T.rodzajOpcje}
              testid="mvd-kreator-odbior-rodzaj"
            />
            <PoleWyboru
              etykieta={T.przylacze}
              wartosc={dane.connection_type}
              onZmiana={(v) => zmien('connection_type', v as ConnectionType)}
              opcje={T.przylaczeOpcje}
              testid="mvd-kreator-odbior-przylacze"
            />
          </KreatorSiatka>
          <KreatorSekcja tytul={T.zipTytul} nota={T.zipNota} testid="mvd-kreator-odbior-zip">
            <KreatorInfo>{T.zipPomoc}</KreatorInfo>
            <KreatorSiatka kolumny={3}>
              <PoleLiczbowe
                etykieta={T.zipAP}
                wartosc={dane.zip.a_p}
                onZmiana={(v) => zmienZip('a_p', v)}
                krok={0.05}
                blad={bladDlaPola('zip.a_p')}
                testid="mvd-kreator-odbior-zip-ap"
              />
              <PoleLiczbowe
                etykieta={T.zipBP}
                wartosc={dane.zip.b_p}
                onZmiana={(v) => zmienZip('b_p', v)}
                krok={0.05}
                blad={bladDlaPola('zip.b_p')}
                testid="mvd-kreator-odbior-zip-bp"
              />
              <PoleLiczbowe
                etykieta={T.zipCP}
                wartosc={dane.zip.c_p}
                onZmiana={(v) => zmienZip('c_p', v)}
                krok={0.05}
                blad={bladDlaPola('zip.c_p')}
                testid="mvd-kreator-odbior-zip-cp"
              />
              <PoleLiczbowe
                etykieta={T.zipAQ}
                wartosc={dane.zip.a_q}
                onZmiana={(v) => zmienZip('a_q', v)}
                krok={0.05}
                blad={bladDlaPola('zip.a_q')}
                testid="mvd-kreator-odbior-zip-aq"
              />
              <PoleLiczbowe
                etykieta={T.zipBQ}
                wartosc={dane.zip.b_q}
                onZmiana={(v) => zmienZip('b_q', v)}
                krok={0.05}
                blad={bladDlaPola('zip.b_q')}
                testid="mvd-kreator-odbior-zip-bq"
              />
              <PoleLiczbowe
                etykieta={T.zipCQ}
                wartosc={dane.zip.c_q}
                onZmiana={(v) => zmienZip('c_q', v)}
                krok={0.05}
                blad={bladDlaPola('zip.c_q')}
                testid="mvd-kreator-odbior-zip-cq"
              />
              <PoleLiczbowe
                etykieta={T.zipKPf}
                wartosc={dane.zip.k_pf}
                onZmiana={(v) => zmienZip('k_pf', v)}
                krok={0.1}
                pomoc={T.zipKPomoc}
                blad={bladDlaPola('zip.k_pf')}
                testid="mvd-kreator-odbior-zip-kpf"
              />
              <PoleLiczbowe
                etykieta={T.zipKQf}
                wartosc={dane.zip.k_qf}
                onZmiana={(v) => zmienZip('k_qf', v)}
                krok={0.1}
                blad={bladDlaPola('zip.k_qf')}
                testid="mvd-kreator-odbior-zip-kqf"
              />
            </KreatorSiatka>
            {/* Sumy widoczne NA BIEŻĄCO: warunek a+b+c = 1 ma być czytelny w trakcie
                wpisywania, a nie dopiero jako błąd po naciśnięciu „Zapisz". */}
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta={T.zipSumaP} wartosc={sumaUdzialowZip(dane.zip, 'p').toFixed(3)} />
              <RzadWartosci etykieta={T.zipSumaQ} wartosc={sumaUdzialowZip(dane.zip, 'q').toFixed(3)} />
            </KreatorSiatka>
            {bladDlaPola('zip.suma_p') ? (
              <p className="mvd-pole-blad" role="alert">{bladDlaPola('zip.suma_p')}</p>
            ) : null}
            {bladDlaPola('zip.suma_q') ? (
              <p className="mvd-pole-blad" role="alert">{bladDlaPola('zip.suma_q')}</p>
            ) : null}
          </KreatorSekcja>
          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-odbior-teoria"
          >
            <figure className="mvd-wykres-fig">
              <WykresTrojkatMocy cosPhi={dane.cos_phi} />
              <figcaption className="mvd-wykres-cap"><TekstZWzorami tekst={T.teoriaJakCzytac} /></figcaption>
            </figure>
          </PanelTeorii>
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-odbior-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszMoc} wartosc={fmtKw(dane.active_power_kw)} />
            <RzadWartosci etykieta={T.wierszCos} wartosc={dane.cos_phi.toFixed(2)} />
            <RzadWartosci
              etykieta={T.zipWierszModel}
              wartosc={czyZipDomyslny(dane.zip) ? T.zipModelStalaMoc : T.zipModelWlasny}
            />
            <RzadWartosci etykieta={T.podgladI} wartosc={fmtA(podglad?.rated_current_a)} />
            <RzadWartosci etykieta={T.podgladS} wartosc={fmtKva(podglad?.apparent_power_kva)} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
