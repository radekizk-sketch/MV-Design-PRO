/**
 * Kreator „Punkt pomiarowy pola SN" (add_ct / add_vt) — ui2, kreatory/rama.
 *
 * Jeden kreator obsługuje CT i VT — wariant z `activeForm.op`. Katalog-first (CT/VT):
 * wybór typu wypełnia dane znamionowe; projektant może je doprecyzować. Zapis = operacja
 * domenowa `add_ct` albo `add_vt`. ZERO fizyki w UI — estymację stanu liczy backend.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchCtTypes, fetchVtTypes } from '../../../ui/catalog/api';
import { buildCatalogBinding } from '../../../ui/catalog/catalogBinding';
import type { CTCatalogType, VTCatalogType } from '../../../ui/catalog/types';
import {
  buildFieldReadModelOptions,
  resolveFieldReadModelItem,
} from '../../../ui/field/fieldReadModelSelectors';
import { useFieldReadModel } from '../../../ui/field/useFieldReadModel';
import { validateCatalogFirst } from '../../../ui/network-build/forms/catalogFirstRules';
import { useActiveOperationForm, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PanelTeorii,
  PoleKatalogu,
  PoleLiczbowe,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  useSelekcjaPoOperacji,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import { pomiarStrings } from './strings';

type MeasurementCatalogType = CTCatalogType | VTCatalogType;

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function KreatorPomiaru() {
  const activeForm = useActiveOperationForm();
  const operation = activeForm?.op === 'add_vt' ? 'add_vt' : 'add_ct';
  const isCt = operation === 'add_ct';
  const T = useMemo(() => pomiarStrings(isCt), [isCt]);
  const context = activeForm?.context as Record<string, unknown> | undefined;

  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const fieldReadModel = useFieldReadModel();

  const [typy, setTypy] = useState<MeasurementCatalogType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('pole');

  const bayOptions = useMemo(
    () => buildFieldReadModelOptions(fieldReadModel.data.fields, snapshot),
    [fieldReadModel.data.fields, snapshot],
  );
  const initialBayRef = useMemo(
    () => resolveFieldReadModelItem(fieldReadModel.data.fields, context)?.bay_ref ?? '',
    [context, fieldReadModel.data.fields],
  );

  const [bayRef, setBayRef] = useState(initialBayRef);
  const [catalogRef, setCatalogRef] = useState('');
  const [primary, setPrimary] = useState<number | null>(null);
  const [secondary, setSecondary] = useState<number | null>(isCt ? 5 : 100);
  const [klasa, setKlasa] = useState('0.5');
  const [burden, setBurden] = useState<number | null>(null);

  useEffect(() => {
    setBayRef(initialBayRef || bayOptions[0]?.ref_id || '');
  }, [bayOptions, initialBayRef]);

  useEffect(() => {
    setCatalogRef(readString(context?.catalog_item_id) || readString(context?.catalog_ref));
  }, [context]);

  useEffect(() => {
    setPrimary(null);
    setSecondary(isCt ? 5 : 100);
    setKlasa('0.5');
    setBurden(null);
  }, [isCt]);

  useEffect(() => {
    let active = true;
    setBladKatalogu(null);
    void (isCt ? fetchCtTypes() : fetchVtTypes())
      .then((items) => {
        if (!active) return;
        setTypy(Array.isArray(items) ? items : []);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setTypy([]);
        setBladKatalogu(e instanceof Error ? e.message : T.katalogBlad);
      });
    return () => {
      active = false;
    };
  }, [isCt, T.katalogBlad]);

  // Katalog wypełnia dane znamionowe (katalog-first) — projektant może je doprecyzować.
  useEffect(() => {
    const selected = typy.find((t) => t.id === catalogRef);
    if (!selected) return;
    if (isCt) {
      const e = selected as CTCatalogType;
      setPrimary(e.ratio_primary_a);
      setSecondary(e.ratio_secondary_a);
      setKlasa(e.accuracy_class ?? '0.5');
      setBurden(e.burden_va ?? null);
    } else {
      const e = selected as VTCatalogType;
      setPrimary(e.ratio_primary_v);
      setSecondary(e.ratio_secondary_v);
      setKlasa(e.accuracy_class ?? '0.5');
      setBurden(null);
    }
  }, [catalogRef, typy, isCt]);

  const opcjeBay = useMemo(
    () => bayOptions.map((o) => ({ id: o.ref_id, etykieta: `${o.station_name} / ${o.name} / ${o.bay_role}` })),
    [bayOptions],
  );
  const opcjeTypow = useMemo(
    () => typy.map((t) => ({ id: t.id, etykieta: t.manufacturer ? `${t.manufacturer} · ${t.name}` : t.name })),
    [typy],
  );
  const selectedBayInfo = useMemo(
    () => bayOptions.find((o) => o.ref_id === bayRef) ?? null,
    [bayOptions, bayRef],
  );

  const brakPol = bayOptions.length === 0;
  const przekladniaOk = primary !== null && primary > 0 && secondary !== null && secondary > 0;
  const kompletne = Boolean(bayRef && catalogRef.trim() && przekladniaOk);

  const onZapisz = useCallback(async () => {
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    if (!bayRef) {
      setBladGlobalny(T.brakPolaWalid);
      return;
    }
    if (!catalogRef.trim()) {
      setBladGlobalny(T.brakKatalogu);
      return;
    }
    if (!przekladniaOk) {
      setBladGlobalny(T.blednaPrzekladnia);
      return;
    }
    if (burden !== null && burden < 0) {
      setBladGlobalny(T.blednaBurden);
      return;
    }
    const payload: Record<string, unknown> = {
      bay_ref: bayRef,
      catalog_ref: catalogRef.trim(),
      catalog_binding: buildCatalogBinding(isCt ? 'CT' : 'VT', catalogRef.trim()),
      accuracy_class: klasa.trim() || undefined,
      burden_va: burden,
    };
    if (isCt) {
      payload.ratio_primary_a = primary;
      payload.ratio_secondary_a = secondary;
    } else {
      payload.ratio_primary_v = primary;
      payload.ratio_secondary_v = secondary;
    }
    const catalogError = validateCatalogFirst(operation, payload);
    if (catalogError) {
      setBladGlobalny(catalogError);
      return;
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId, operation, payload);
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, { type: 'Measurement', name: `${isCt ? 'CT' : 'VT'} pola` });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, bayRef, burden, catalogRef, closeForm, executeDomainOperation, isCt, klasa, operation, primary, przekladniaOk, secondary, selekcjaPoOperacji, T]);

  const przekladniaTekst = przekladniaOk ? `${primary} / ${secondary} ${T.jednostka}` : '—';

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszPole, stan: bayRef ? 'kompletne' : 'brak', wartosc: selectedBayInfo?.name || (bayRef ? 'Wskazane' : 'Brak') },
    { etykieta: T.wierszKatalog, stan: catalogRef ? 'kompletne' : 'brak', wartosc: catalogRef ? 'Kompletne' : 'Do wyboru' },
    { etykieta: T.wierszPrzekladnia, stan: przekladniaOk ? 'kompletne' : 'brak', wartosc: przekladniaTekst },
    { etykieta: T.wierszKlasa, stan: 'kompletne', wartosc: klasa || '—' },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-pomiar-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const krokIndex = ['pole', 'znamionowe', 'zapis'].indexOf(krok);
  const KROKI: readonly KrokKreatora[] = [
    { id: 'pole', tytul: T.krokPole },
    { id: 'znamionowe', tytul: T.krokZnamionowe },
    { id: 'zapis', tytul: T.krokZapis },
  ];

  return (
    <KreatorRama
      eyebrow={T.eyebrow}
      tytul={T.tytul}
      cel={T.cel}
      odznaka={T.odznaka}
      kroki={KROKI}
      krokAktywny={krok}
      onKrok={setKrok}
      pelny
      aside={aside}
      bladGlobalny={bladGlobalny}
      walidacja={!kompletne ? T.walidacjaStopka : null}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !kompletne || !activeCaseId || brakPol, testid: 'mvd-kreator-pomiar-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-pomiar-anuluj' }}
      krokWstecz={krokIndex > 0 ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-pomiar-wstecz' } : undefined}
      krokDalej={krokIndex < KROKI.length - 1 ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-pomiar-dalej' } : undefined}
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-pomiar"
    >
      {brakPol ? (
        <KreatorSekcja tytul={T.brakPolTytul} testid="mvd-kreator-pomiar-brak">
          <KreatorInfo>{T.brakPolOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'pole' ? (
        <KreatorSekcja tytul={T.poleTytul} testid="mvd-kreator-pomiar-pole">
          <KreatorInfo>{T.polePomoc}</KreatorInfo>
          <PoleWyboru
            etykieta={T.poleSn}
            wartosc={bayRef}
            onZmiana={setBayRef}
            opcje={[{ id: '', etykieta: T.poleSnPlaceholder }, ...opcjeBay]}
            wymagane
            testid="mvd-kreator-pomiar-bay"
          />
          <PoleKatalogu
            etykieta={T.katalog}
            wartosc={catalogRef || null}
            onZmiana={(v) => setCatalogRef(v ?? '')}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.katalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.katalogBlad}
            pomoc={T.katalogPomoc}
            wymagane
            testid="mvd-kreator-pomiar-katalog"
          />
          {selectedBayInfo ? (
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta={T.readStacja} wartosc={selectedBayInfo.station_name} />
              <RzadWartosci etykieta={T.readSzyna} wartosc={selectedBayInfo.bus_name} />
            </KreatorSiatka>
          ) : null}
          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-pomiar-teoria"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'znamionowe' ? (
        <KreatorSekcja tytul={T.znamionoweTytul} testid="mvd-kreator-pomiar-znamionowe">
          <KreatorSiatka kolumny={2}>
            <PoleLiczbowe
              etykieta={T.przekladniaPierwotna}
              jednostka={T.jednostka}
              wartosc={primary}
              onZmiana={setPrimary}
              min={0}
              wymagane
              testid="mvd-kreator-pomiar-primary"
            />
            <PoleLiczbowe
              etykieta={T.przekladniaWtorna}
              jednostka={T.jednostka}
              wartosc={secondary}
              onZmiana={setSecondary}
              min={0}
              wymagane
              testid="mvd-kreator-pomiar-secondary"
            />
            <PoleTekstowe
              etykieta={T.klasa}
              wartosc={klasa}
              onZmiana={setKlasa}
              placeholder={T.klasaPlaceholder}
              pomoc={T.klasaPomoc}
              testid="mvd-kreator-pomiar-klasa"
            />
            <PoleLiczbowe
              etykieta={T.burden}
              jednostka={T.burdenJednostka}
              wartosc={burden}
              onZmiana={setBurden}
              min={0}
              pomoc={T.burdenPomoc}
              testid="mvd-kreator-pomiar-burden"
            />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-pomiar-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszPole} wartosc={selectedBayInfo?.name || '—'} />
            <RzadWartosci etykieta={T.wierszKatalog} wartosc={catalogRef || '—'} />
            <RzadWartosci etykieta={T.wierszPrzekladnia} wartosc={przekladniaTekst} />
            <RzadWartosci etykieta={T.wierszKlasa} wartosc={klasa || '—'} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
