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
  jedynaZgodna,
  pierwszyBrak,
  useDecyzjeProjektanta,
  useProwadzenie,
  useSelekcjaPoOperacji,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import { pomiarStrings } from './strings';

type MeasurementCatalogType = CTCatalogType | VTCatalogType;

const POLA_ZNAMIONOWE = ['primary', 'secondary', 'klasa', 'burden'] as const;
type PoleZnamionowe = (typeof POLA_ZNAMIONOWE)[number];
type PoleAuto = PoleZnamionowe | 'bay' | 'catalog';

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

  // Karta BIEG-ZABEZPIECZEN-Z-MODELU: kotwica przekładnika przy wyłączniku LINIOWYM (bez pola
  // rozdzielnicy) — kontekst `{kotwica: 'wylacznik', breaker_ref}` z ekranu „Zabezpieczenia
  // i automatyka"; operacja `add_ct` przyjmuje wtedy `breaker_ref` zamiast `bay_ref`.
  const wylacznikLiniowyRef =
    readString(context?.kotwica) === 'wylacznik' ? readString(context?.breaker_ref) : '';
  const wylacznikLiniowy = useMemo(
    () => snapshot?.branches?.find((b) => b.ref_id === wylacznikLiniowyRef) ?? null,
    [snapshot, wylacznikLiniowyRef],
  );
  const kotwicaWylacznik = Boolean(wylacznikLiniowyRef);

  const [bayRef, setBayRef] = useState(initialBayRef);
  const [catalogRef, setCatalogRef] = useState('');
  // Dane znamionowe WYŁĄCZNIE z karty katalogowej (AUTO_PRZYJETE) albo od projektanta —
  // dawniej wtórna 5 A / 100 V i klasa „0.5” bez pozycji katalogowej.
  const [primary, setPrimary] = useState<number | null>(null);
  const [secondary, setSecondary] = useState<number | null>(null);
  const [klasa, setKlasa] = useState('');
  const [burden, setBurden] = useState<number | null>(null);
  const prowadzenie = useProwadzenie(setKrok);
  const { edytowane, decyzjaProjektanta } = useDecyzjeProjektanta<PoleAuto>();

  // Pole: wskazane w kontekście albo JEDYNE pole SN modelu (dawniej pierwsze z listy).
  const jedynePole = useMemo(() => jedynaZgodna(bayOptions), [bayOptions]);
  useEffect(() => {
    if (decyzjaProjektanta('bay')) return;
    const auto = initialBayRef || jedynePole?.ref_id || '';
    setBayRef(auto);
  }, [decyzjaProjektanta, initialBayRef, jedynePole]);

  useEffect(() => {
    const zKontekstu = readString(context?.catalog_item_id) || readString(context?.catalog_ref);
    setCatalogRef(zKontekstu);
  }, [context]);

  useEffect(() => {
    setPrimary(null);
    setSecondary(null);
    setKlasa('');
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

  // Karta katalogowa wypełnia dane znamionowe (AUTO_PRZYJETE ze źródłem) — projektant może je
  // doprecyzować; edytowanej wartości automat już nie nadpisuje. Karta bez klasy = klasa pusta
  // (dawniej „0.5”).
  useEffect(() => {
    const selected = typy.find((t) => t.id === catalogRef);
    if (!selected) return;
    const wartosci: Record<PoleZnamionowe, number | string | null> = isCt
      ? {
          primary: (selected as CTCatalogType).ratio_primary_a,
          secondary: (selected as CTCatalogType).ratio_secondary_a,
          klasa: selected.accuracy_class ?? null,
          burden: (selected as CTCatalogType).burden_va ?? null,
        }
      : {
          primary: (selected as VTCatalogType).ratio_primary_v,
          secondary: (selected as VTCatalogType).ratio_secondary_v,
          klasa: selected.accuracy_class ?? null,
          burden: null,
        };
    const ustaw: Record<PoleZnamionowe, (v: number | string | null) => void> = {
      primary: (v) => setPrimary(typeof v === 'number' ? v : null),
      secondary: (v) => setSecondary(typeof v === 'number' ? v : null),
      klasa: (v) => setKlasa(typeof v === 'string' ? v : ''),
      burden: (v) => setBurden(typeof v === 'number' ? v : null),
    };
    for (const pole of POLA_ZNAMIONOWE) {
      if (decyzjaProjektanta(pole)) continue;
      ustaw[pole](wartosci[pole]);
    }
  }, [catalogRef, decyzjaProjektanta, isCt, typy]);

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

  const brakPol = !kotwicaWylacznik && bayOptions.length === 0;
  const przekladniaOk = primary !== null && primary > 0 && secondary !== null && secondary > 0;
  const kotwicaOk = kotwicaWylacznik ? Boolean(wylacznikLiniowy) : Boolean(bayRef);
  // KONFLIKT_TECHNICZNY — widoczny od razu przy polu: przekładnia niedodatnia, moc ujemna.
  const konfliktPierwotnej = primary !== null && !(primary > 0) ? T.blednaPrzekladnia : undefined;
  const konfliktWtornej = secondary !== null && !(secondary > 0) ? T.blednaPrzekladnia : undefined;
  const konfliktBurden = burden !== null && burden < 0 ? T.blednaBurden : undefined;

  const onZapisz = useCallback(async () => {
    const brak = pierwszyBrak([
      konfliktPierwotnej && { komunikat: konfliktPierwotnej, krok: 'znamionowe', pole: 'mvd-kreator-pomiar-primary' },
      konfliktWtornej && { komunikat: konfliktWtornej, krok: 'znamionowe', pole: 'mvd-kreator-pomiar-secondary' },
      konfliktBurden && { komunikat: konfliktBurden, krok: 'znamionowe', pole: 'mvd-kreator-pomiar-burden' },
      !kotwicaOk && (kotwicaWylacznik
        ? { komunikat: T.brakWylacznikaWalid, krok: 'pole' }
        : { komunikat: T.brakPolaWalid, krok: 'pole', pole: 'mvd-kreator-pomiar-bay' }),
      !catalogRef.trim() && { komunikat: T.brakKatalogu, krok: 'pole', pole: 'mvd-kreator-pomiar-katalog' },
      primary === null && { komunikat: T.brakPierwotnej, krok: 'znamionowe', pole: 'mvd-kreator-pomiar-primary' },
      secondary === null && { komunikat: T.brakWtornej, krok: 'znamionowe', pole: 'mvd-kreator-pomiar-secondary' },
      !activeCaseId && { komunikat: T.brakZakresu },
    ]);
    if (brak || !activeCaseId || !przekladniaOk) {
      if (brak) prowadzenie.wskaz(brak);
      return;
    }
    prowadzenie.zgas();
    const payload: Record<string, unknown> = {
      ...(kotwicaWylacznik ? { breaker_ref: wylacznikLiniowyRef } : { bay_ref: bayRef }),
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
  }, [activeCaseId, bayRef, burden, catalogRef, closeForm, executeDomainOperation, isCt, klasa, konfliktBurden, konfliktPierwotnej, konfliktWtornej, kotwicaOk, kotwicaWylacznik, operation, primary, prowadzenie, przekladniaOk, secondary, selekcjaPoOperacji, T, wylacznikLiniowyRef]);

  const przekladniaTekst = przekladniaOk ? `${primary} / ${secondary} ${T.jednostka}` : '—';
  const zmienZnamionowe = (pole: PoleZnamionowe) => edytowane(pole);

  const wierszeGotowosci: WierszGotowosci[] = [
    kotwicaWylacznik
      ? { etykieta: T.wierszWylacznik, stan: wylacznikLiniowy ? 'ustalone' : 'do_wyboru', wartosc: wylacznikLiniowy?.name || '' }
      : {
          etykieta: T.wierszPole,
          stan: !bayRef ? 'do_wyboru' : 'ustalone',
          wartosc: selectedBayInfo?.name || (bayRef ? 'Wskazane' : T.poleDoWyboru),
        },
    {
      etykieta: T.wierszKatalog,
      stan: !catalogRef ? 'do_wyboru' : 'ustalone',
      wartosc: typy.find((t) => t.id === catalogRef)?.name ?? '',
    },
    {
      etykieta: T.wierszPrzekladnia,
      stan: konfliktPierwotnej || konfliktWtornej ? 'konflikt' : przekladniaOk ? 'ustalone' : 'do_wyboru',
      wartosc: przekladniaOk ? przekladniaTekst : '',
    },
    { etykieta: T.wierszKlasa, stan: klasa ? 'ustalone' : 'do_wyboru', wartosc: klasa },
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
      {...prowadzenie.propsRamy}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, testid: 'mvd-kreator-pomiar-zapisz' }}
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
          <KreatorInfo>{kotwicaWylacznik ? T.wylacznikPomoc : T.polePomoc}</KreatorInfo>
          {kotwicaWylacznik ? (
            <RzadWartosci
              etykieta={T.wierszWylacznik}
              wartosc={wylacznikLiniowy?.name || T.wylacznikBrak}
            />
          ) : (
            <PoleWyboru
              etykieta={T.poleSn}
              wartosc={bayRef}
              onZmiana={(v) => {
                setBayRef(v);
                edytowane('bay');
              }}
              opcje={[{ id: '', etykieta: T.poleSnPlaceholder }, ...opcjeBay]}
              wymagane
              testid="mvd-kreator-pomiar-bay"
            />
          )}
          <PoleKatalogu
            etykieta={T.katalog}
            wartosc={catalogRef || null}
            onZmiana={(v) => {
              setCatalogRef(v ?? '');
              edytowane('catalog');
            }}
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
              onZmiana={(v) => {
                setPrimary(v);
                zmienZnamionowe('primary');
              }}
              min={0}
              wymagane
              blad={konfliktPierwotnej}
              testid="mvd-kreator-pomiar-primary"
            />
            <PoleLiczbowe
              etykieta={T.przekladniaWtorna}
              jednostka={T.jednostka}
              wartosc={secondary}
              onZmiana={(v) => {
                setSecondary(v);
                zmienZnamionowe('secondary');
              }}
              min={0}
              wymagane
              blad={konfliktWtornej}
              testid="mvd-kreator-pomiar-secondary"
            />
            <PoleTekstowe
              etykieta={T.klasa}
              wartosc={klasa}
              onZmiana={(v) => {
                setKlasa(v);
                zmienZnamionowe('klasa');
              }}
              placeholder={T.klasaPlaceholder}
              pomoc={T.klasaPomoc}
              testid="mvd-kreator-pomiar-klasa"
            />
            <PoleLiczbowe
              etykieta={T.burden}
              jednostka={T.burdenJednostka}
              wartosc={burden}
              onZmiana={(v) => {
                setBurden(v);
                zmienZnamionowe('burden');
              }}
              min={0}
              blad={konfliktBurden}
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
            {kotwicaWylacznik ? (
              <RzadWartosci etykieta={T.wierszWylacznik} wartosc={wylacznikLiniowy?.name || '—'} />
            ) : (
              <RzadWartosci etykieta={T.wierszPole} wartosc={selectedBayInfo?.name || '—'} />
            )}
            <RzadWartosci
              etykieta={T.wierszKatalog}
              wartosc={typy.find((t) => t.id === catalogRef)?.name ?? '—'}
            />
            <RzadWartosci etykieta={T.wierszPrzekladnia} wartosc={przekladniaTekst} />
            <RzadWartosci etykieta={T.wierszKlasa} wartosc={klasa || '—'} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
