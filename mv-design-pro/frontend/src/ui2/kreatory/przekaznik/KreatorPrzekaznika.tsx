/**
 * Kreator „Zabezpieczenie pola SN" (add_relay) — ui2, kreatory/rama.
 *
 * Przypisuje zabezpieczenie do pola SN: rodzina ochrony + typ katalogowy przekaźnika,
 * wiązany z wyłącznikiem wykonawczym i przekładnikami pola. Katalog-first (ZABEZPIECZENIE).
 * Zapis = operacja domenowa `add_relay`. Charakterystykę czasowo-prądową (IEC 60255) i
 * nastawy liczy backend — ZERO fizyki w UI (wykres to poglądowy kształt prawa normy).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchMvProtectionDeviceTypes } from '../../../ui/catalog/api';
import { buildCatalogBinding } from '../../../ui/catalog/catalogBinding';
import type { ProtectionDeviceType } from '../../../ui/catalog/types';
import {
  buildControlDeviceOptions,
  measurementCountsForField,
} from '../../../ui/field/fieldControlSelectors';
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
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  useSelekcjaPoOperacji,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import { WykresIdmt } from './WykresIdmt';
import { PRZEKAZNIK_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'pole', tytul: T.krokPole },
  { id: 'zapis', tytul: T.krokZapis },
];

/** Rodziny wymagające przekładnika prądowego (dobór na prąd). */
const RODZINY_WYMAGAJACE_CT = new Set(['NADPRADOWY', 'ZIEMNOZWARCIOWY', 'KIERUNKOWY_NADPRADOWY']);

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function KreatorPrzekaznika() {
  const activeForm = useActiveOperationForm();
  const context = activeForm?.context as Record<string, unknown> | undefined;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const fieldReadModel = useFieldReadModel();

  const [typy, setTypy] = useState<ProtectionDeviceType[]>([]);
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
  const [relayType, setRelayType] = useState<string>('NADPRADOWY');
  const [catalogItemId, setCatalogItemId] = useState('');
  const [breakerRef, setBreakerRef] = useState('');
  const [nazwa, setNazwa] = useState('');

  useEffect(() => {
    setBayRef(initialBayRef || bayOptions[0]?.ref_id || '');
  }, [bayOptions, initialBayRef]);

  useEffect(() => {
    setRelayType(readString(context?.relay_type) || 'NADPRADOWY');
    setCatalogItemId(readString(context?.catalog_item_id) || readString(context?.catalog_ref));
  }, [context]);

  const selectedFieldItem = useMemo(
    () => fieldReadModel.itemsByBayRef.get(bayRef) ?? null,
    [bayRef, fieldReadModel.itemsByBayRef],
  );
  const breakerControlOptions = useMemo(
    () => buildControlDeviceOptions(selectedFieldItem),
    [selectedFieldItem],
  );

  useEffect(() => {
    const explicit = readString(context?.breaker_ref);
    if (explicit) {
      setBreakerRef(explicit);
      return;
    }
    const elementRef = readString(context?.element_ref);
    if (elementRef && breakerControlOptions.some((o) => o.ref_id === elementRef)) {
      setBreakerRef(elementRef);
      return;
    }
    setBreakerRef(breakerControlOptions[0]?.ref_id ?? '');
  }, [breakerControlOptions, context]);

  useEffect(() => {
    let active = true;
    setBladKatalogu(null);
    // FAB-F: WYŁĄCZNIE katalog KANONICZNY MV (`/mv-protection-device-types`) —
    // to jedyny zbiór, który przepuszcza brama katalogowa operacji `add_relay`
    // (patrz `backend/src/api/catalog.py::list_mv_protection_device_types`).
    // Biblioteka analityczna koordynacji (`fetchProtectionDeviceTypes`,
    // `/protection/device-types`) niesie inny — szerszy — zbiór pozycji
    // producenckich do doboru krzywych TCC, którego brama katalogowa NIE
    // przyjmuje: picker oferował wybór odrzucany potem przez operację
    // (fabrykacja wyboru, dokładnie ta klasa błędu co K30-89/FAB-C). Zawężenie
    // do 12 pozycji katalogu MV jest ŚWIADOME i tymczasowe do czasu konwergencji
    // trzech katalogów zabezpieczeń (osobna karta architektoniczna).
    void fetchMvProtectionDeviceTypes()
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
  }, []);

  const opcjeBay = useMemo(
    () => bayOptions.map((o) => ({
      id: o.ref_id,
      etykieta: `${o.station_name} / ${o.name} / ${o.bay_role}`,
    })),
    [bayOptions],
  );
  const opcjeBreaker = useMemo(
    () => breakerControlOptions.map((o) => ({ id: o.ref_id, etykieta: `${o.name} (${o.kind})` })),
    [breakerControlOptions],
  );
  const opcjeTypow = useMemo(
    () => typy.map((t) => {
      // Katalog MV podaje `name_pl`; ta sama unia typu obsługuje też `name`
      // biblioteki analitycznej — wzorzec identyczny jak w `KreatorStacjiSnNn`.
      const nazwa = t.name_pl ?? t.name ?? t.id;
      return { id: t.id, etykieta: t.vendor ? `${t.vendor} · ${nazwa}` : nazwa };
    }),
    [typy],
  );

  const selectedBayInfo = useMemo(
    () => bayOptions.find((o) => o.ref_id === bayRef) ?? null,
    [bayOptions, bayRef],
  );
  const pomiar = useMemo(() => measurementCountsForField(selectedFieldItem), [selectedFieldItem]);
  const wymagaCt = RODZINY_WYMAGAJACE_CT.has(relayType);
  const brakCt = wymagaCt && pomiar.ct === 0 && Boolean(selectedFieldItem);

  const brakPol = bayOptions.length === 0;
  const kompletne = Boolean(bayRef && catalogItemId.trim());

  const onZapisz = useCallback(async () => {
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    if (!bayRef) {
      setBladGlobalny(T.brakPolaWalid);
      return;
    }
    if (!catalogItemId.trim()) {
      setBladGlobalny(T.brakKatalogu);
      return;
    }
    const payload = {
      bay_ref: bayRef,
      breaker_ref: breakerRef || undefined,
      relay_type: relayType,
      catalog_ref: catalogItemId.trim(),
      catalog_binding: buildCatalogBinding('ZABEZPIECZENIE', catalogItemId.trim()),
      name: nazwa.trim() || undefined,
    };
    const catalogError = validateCatalogFirst('add_relay', payload);
    if (catalogError) {
      setBladGlobalny(catalogError);
      return;
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId, 'add_relay', payload);
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, {
        type: 'ProtectionAssignment',
        name: nazwa.trim() || 'Zabezpieczenie pola SN',
      });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, bayRef, breakerRef, catalogItemId, closeForm, executeDomainOperation, nazwa, relayType, selekcjaPoOperacji]);

  const rodzinaEtykieta = useMemo(
    () => T.rodzinaOpcje.find((o) => o.id === relayType)?.etykieta ?? relayType,
    [relayType],
  );

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszPole, stan: bayRef ? 'kompletne' : 'brak', wartosc: selectedBayInfo?.name || (bayRef ? 'Wskazane' : 'Brak') },
    { etykieta: T.wierszRodzina, stan: 'kompletne', wartosc: rodzinaEtykieta },
    { etykieta: T.wierszKatalog, stan: catalogItemId ? 'kompletne' : 'brak', wartosc: catalogItemId ? 'Kompletne' : 'Do wyboru' },
    { etykieta: T.wierszCt, stan: brakCt ? 'ostrzezenie' : 'kompletne', wartosc: brakCt ? 'Brak CT' : `CT: ${pomiar.ct} / VT: ${pomiar.vt}` },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-przekaznik-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const krokIndex = KROKI.findIndex((k) => k.id === krok);

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
      walidacja={!kompletne ? T.walidacjaStopka : brakCt ? T.brakCt : null}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !kompletne || !activeCaseId || brakPol, testid: 'mvd-kreator-przekaznik-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-przekaznik-anuluj' }}
      krokWstecz={krokIndex > 0 ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-przekaznik-wstecz' } : undefined}
      krokDalej={krokIndex < KROKI.length - 1 ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-przekaznik-dalej' } : undefined}
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-przekaznik"
    >
      {brakPol ? (
        <KreatorSekcja tytul={T.brakPolTytul} testid="mvd-kreator-przekaznik-brak">
          <KreatorInfo>{T.brakPolOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'pole' ? (
        <KreatorSekcja tytul={T.poleTytul} testid="mvd-kreator-przekaznik-pole">
          <KreatorInfo>{T.polePomoc}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.poleSn}
              wartosc={bayRef}
              onZmiana={setBayRef}
              opcje={[{ id: '', etykieta: T.poleSnPlaceholder }, ...opcjeBay]}
              wymagane
              testid="mvd-kreator-przekaznik-bay"
            />
            <PoleWyboru
              etykieta={T.aparat}
              wartosc={breakerRef}
              onZmiana={setBreakerRef}
              opcje={[{ id: '', etykieta: T.aparatPlaceholder }, ...opcjeBreaker]}
              pomoc={T.aparatPomoc}
              testid="mvd-kreator-przekaznik-breaker"
            />
            <PoleWyboru
              etykieta={T.rodzina}
              wartosc={relayType}
              onZmiana={setRelayType}
              opcje={T.rodzinaOpcje}
              wymagane
              testid="mvd-kreator-przekaznik-rodzina"
            />
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={nazwa}
              onZmiana={setNazwa}
              placeholder={T.nazwaPlaceholder}
              testid="mvd-kreator-przekaznik-nazwa"
            />
          </KreatorSiatka>

          <PoleKatalogu
            etykieta={T.katalog}
            wartosc={catalogItemId || null}
            onZmiana={(v) => setCatalogItemId(v ?? '')}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.katalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.katalogBlad}
            pomoc={T.katalogPomoc}
            wymagane
            testid="mvd-kreator-przekaznik-katalog"
          />

          {selectedBayInfo ? (
            <KreatorSiatka kolumny={3}>
              <RzadWartosci etykieta={T.readStacja} wartosc={selectedBayInfo.station_name} />
              <RzadWartosci etykieta={T.readSzyna} wartosc={selectedBayInfo.bus_name} />
              <RzadWartosci etykieta={T.readPomiar} wartosc={`CT: ${pomiar.ct} / VT: ${pomiar.vt}`} ton={brakCt ? 'warn' : undefined} />
            </KreatorSiatka>
          ) : null}

          {brakCt ? <KreatorInfo testid="mvd-kreator-przekaznik-brak-ct">{T.brakCt}</KreatorInfo> : null}

          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-przekaznik-teoria"
          >
            <WykresIdmt />
          </PanelTeorii>
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-przekaznik-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszPole} wartosc={selectedBayInfo?.name || '—'} />
            <RzadWartosci etykieta={T.wierszRodzina} wartosc={rodzinaEtykieta} />
            <RzadWartosci etykieta={T.wierszKatalog} wartosc={catalogItemId || '—'} />
            <RzadWartosci etykieta={T.wierszCt} wartosc={`CT: ${pomiar.ct} / VT: ${pomiar.vt}`} ton={brakCt ? 'warn' : undefined} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
