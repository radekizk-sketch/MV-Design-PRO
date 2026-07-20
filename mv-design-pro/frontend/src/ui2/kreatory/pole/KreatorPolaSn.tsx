/**
 * Kreator „Dodaj pole SN" (V12K-057, G-POLE) — ui2, kreatory/rama.
 *
 * Katalog-first (APARAT_SN); rola pola wyznacza wymagane zabezpieczenia (interpretacja
 * po stronie analizy/zabezpieczeń, nie w UI). Zapis = operacja domenowa `add_sn_bay`.
 * ZERO fizyki w UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchMvApparatusTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { MVApparatusCatalogType } from '../../../ui/catalog/types';
import { resolveBusSnRef, resolveStationRef, stationLabel } from '../../../ui/network-build/forms/enmResolvers';
import { navigateToSld } from '../../../ui/navigation/routes';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PoleKatalogu,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import {
  APARAT_OPCJE,
  DANE_DOMYSLNE,
  ROLE_OPCJE,
  aparatLabel,
  maSzyne,
  rolaLabel,
  walidujFormularz,
  zbudujPayload,
  type BladPola,
  type KontekstPola,
  type PolaSnFormData,
  type RodzajAparatu,
  type RolaPola,
} from './polaSnModel';
import { POLE_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'pole', tytul: T.krokPole },
  { id: 'zapis', tytul: T.krokZapis },
];

// Kod backendu (value) → opcja PoleWyboru {id, etykieta polska}. Kontrakt danych
// (kody roli/aparatu) mieszka w modelu; UI pokazuje wyłącznie polskie etykiety.
const OPCJE_ROL = ROLE_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));
const OPCJE_APARAT = APARAT_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function KreatorPolaSn() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const kontekst = useMemo<KontekstPola>(() => {
    const ctx = context ?? undefined;
    const stationRef = resolveStationRef(ctx, snapshot) ?? undefined;
    const busRef = resolveBusSnRef(ctx, snapshot) ?? undefined;
    return {
      bus_ref: busRef,
      station_ref: stationRef,
      station_label: stationRef ? stationLabel(snapshot, stationRef) : undefined,
      existing_field_ref: trimmed(context?.existing_field_ref) || undefined,
      gpz_section_id: trimmed(context?.gpz_section_id) || undefined,
    };
  }, [context, snapshot]);
  const hasSzyne = maSzyne(kontekst);

  const [dane, setDane] = useState<PolaSnFormData>(() => ({ ...DANE_DOMYSLNE }));
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('pole');

  const [typy, setTypy] = useState<MVApparatusCatalogType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    fetchMvApparatusTypes()
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

  const params = useMemo(
    () => (dane.catalog_ref ? typy.find((t) => t.id === dane.catalog_ref) ?? null : null),
    [dane.catalog_ref, typy],
  );

  const opcjeTypow = useMemo(
    () => typy.map((t) => ({ id: t.id, etykieta: `${t.name} · ${t.u_n_kv} kV · ${t.i_n_a} A` })),
    [typy],
  );

  const zmien = useCallback(<K extends keyof PolaSnFormData>(pole: K, wartosc: PolaSnFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
  }, []);

  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;

  const onZapisz = useCallback(async () => {
    if (!hasSzyne) {
      setBladGlobalny(T.brakSzynyOpis);
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
      const response = await executeDomainOperation(activeCaseId, 'add_sn_bay', zbudujPayload(dane, kontekst));
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.walidacjaStopka);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      navigateToSld();
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, hasSzyne, kontekst]);

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszSzyna,
      stan: hasSzyne ? 'kompletne' : 'brak',
      wartosc: kontekst.station_label || (hasSzyne ? 'Wskazana' : 'Brak'),
    },
    { etykieta: T.wierszRola, stan: 'kompletne', wartosc: rolaLabel(dane.bay_role) },
    {
      etykieta: T.wierszAparat,
      stan: dane.catalog_ref ? 'kompletne' : 'brak',
      wartosc: dane.catalog_ref ? 'Kompletne' : 'Do konfiguracji',
    },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-pole-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const paramReadout = params ? (
    <KreatorSiatka kolumny={3}>
      <RzadWartosci etykieta={T.paramNapiecie} wartosc={`${params.u_n_kv} kV`} />
      <RzadWartosci etykieta={T.paramPrad} wartosc={`${params.i_n_a} A`} />
      <RzadWartosci
        etykieta={T.paramZwarcie}
        wartosc={typeof params.breaking_capacity_ka === 'number' ? `${params.breaking_capacity_ka} kA` : '—'}
      />
    </KreatorSiatka>
  ) : null;

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
      walidacja={bledy.length > 0 ? T.walidacjaStopka : !hasSzyne ? T.brakSzynyOpis : null}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !hasSzyne || !activeCaseId, testid: 'mvd-kreator-pole-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-pole-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-pole-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-pole-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-pole"
    >
      {!hasSzyne ? (
        <KreatorSekcja tytul={T.brakSzynyTytul} testid="mvd-kreator-pole-brak">
          <KreatorInfo>{T.brakSzynyOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'pole' ? (
        <KreatorSekcja tytul={T.krokPole} testid="mvd-kreator-pole-konfiguracja">
          <KreatorInfo>{T.rolaPomoc}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.rola}
              wartosc={dane.bay_role}
              onZmiana={(v) => zmien('bay_role', v as RolaPola)}
              opcje={OPCJE_ROL}
              testid="mvd-kreator-pole-rola"
            />
            <PoleWyboru
              etykieta={T.aparat}
              wartosc={dane.apparatus_kind}
              onZmiana={(v) => zmien('apparatus_kind', v as RodzajAparatu)}
              opcje={OPCJE_APARAT}
              testid="mvd-kreator-pole-aparat"
            />
          </KreatorSiatka>
          <KreatorInfo>{T.typPomoc}</KreatorInfo>
          <PoleKatalogu
            etykieta={T.typKatalog}
            wartosc={dane.catalog_ref}
            onZmiana={(v) => zmien('catalog_ref', v)}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.typKatalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.typBlad}
            testid="mvd-kreator-pole-katalog"
          />
          {bladDlaPola('catalog_ref') ? <p className="mvd-pole-blad">{bladDlaPola('catalog_ref')}</p> : null}
          <PoleTekstowe
            etykieta={T.nazwa}
            wartosc={dane.field_name}
            onZmiana={(v) => zmien('field_name', v)}
            placeholder={T.nazwaPlaceholder}
            testid="mvd-kreator-pole-nazwa"
          />
          {paramReadout}
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-pole-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszSzyna} wartosc={kontekst.station_label || '—'} />
            <RzadWartosci etykieta={T.wierszRola} wartosc={rolaLabel(dane.bay_role)} />
            <RzadWartosci etykieta={T.aparat} wartosc={aparatLabel(dane.apparatus_kind)} />
            <RzadWartosci etykieta={T.nazwa} wartosc={dane.field_name.trim() || '—'} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
