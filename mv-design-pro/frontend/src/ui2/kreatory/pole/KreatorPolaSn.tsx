/**
 * Kreator „Dodaj pole SN" (V12K-057, G-POLE) — ui2, kreatory/rama.
 *
 * Katalog-first (APARAT_SN); rola pola wyznacza wymagane zabezpieczenia (interpretacja
 * po stronie analizy/zabezpieczeń, nie w UI). Zapis = operacja domenowa `add_sn_bay`.
 * ZERO fizyki w UI.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import type { CompleteMvBayTemplateSummary } from '../../../ui/catalog/BayTemplatePicker';
import type { SwitchgearFamily } from '../../../ui/catalog/SwitchgearFamilyPicker';
import {
  fetchCompleteBayTemplates,
  fetchMvApparatusTypes,
  fetchSwitchgearFamilies,
  getCatalogErrorMessage,
} from '../../../ui/catalog/api';
import type { MVApparatusCatalogType } from '../../../ui/catalog/types';
import { resolveBusSnRef, resolveStationRef, stationLabel } from '../../../ui/network-build/forms/enmResolvers';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
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
import {
  APARAT_OPCJE,
  DANE_DOMYSLNE,
  ROLE_OPCJE,
  WYBOR_POMIARU_OPCJE,
  aparatLabel,
  bayKindZRoli,
  maSzablonProducenta,
  maSzyne,
  rolaLabel,
  walidujFormularz,
  wyborPomiaruLabel,
  zbudujPayload,
  type BladPola,
  type KontekstPola,
  type PolaSnFormData,
  type RodzajAparatu,
  type RolaPola,
  type WyborPomiaru,
} from './polaSnModel';
import {
  BEZ_DOPOSAZENIA,
  KartaWyposazeniaPola,
} from '../stacja/KartaWyposazeniaPola';
import { naglowekRodziny, torRodziny, wyposazenieSzablonu } from '../stacja/konfiguratorRozdzielnicy';
import { STACJA_STRINGS as ST } from '../stacja/strings';
import { POLE_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'pole', tytul: T.krokPole },
  { id: 'zapis', tytul: T.krokZapis },
];

// Kod backendu (value) → opcja PoleWyboru {id, etykieta polska}. Kontrakt danych
// (kody roli/aparatu) mieszka w modelu; UI pokazuje wyłącznie polskie etykiety.
const OPCJE_ROL = ROLE_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));
const OPCJE_APARAT = APARAT_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));
const OPCJE_POMIARU = WYBOR_POMIARU_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function KreatorPolaSn() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
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
  const [rodziny, setRodziny] = useState<SwitchgearFamily[]>([]);
  const [szablony, setSzablony] = useState<CompleteMvBayTemplateSummary[]>([]);
  // S9-5 (klasa: bramka enable bez sygnału gotowości) — jawny znacznik
  // ładowania katalogu, niezależny od `typy.length` (katalog pusty PO
  // wczytaniu wygląda inaczej niż katalog W TRAKCIE wczytywania).
  const [katalogLadowanie, setKatalogLadowanie] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    setKatalogLadowanie(true);
    Promise.all([fetchMvApparatusTypes(), fetchSwitchgearFamilies()])
      .then(([apar, fam]) => {
        if (cancelled) return;
        setTypy(Array.isArray(apar) ? apar : []);
        setRodziny(Array.isArray(fam) ? fam : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setTypy([]);
        setRodziny([]);
        setBladKatalogu(getCatalogErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setKatalogLadowanie(false);
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

  // Szablony pola producenta dla wybranej rodziny (producent) + roli (BayKind).
  // Reużycie Reference Engine (fetchCompleteBayTemplates) — jak kreator GPZ (K5).
  useEffect(() => {
    let cancelled = false;
    if (!dane.manufacturer_ref) {
      setSzablony([]);
      return undefined;
    }
    fetchCompleteBayTemplates(dane.manufacturer_ref, bayKindZRoli(dane.bay_role))
      .then((t) => {
        if (!cancelled) setSzablony(Array.isArray(t) ? t : []);
      })
      .catch(() => {
        if (!cancelled) setSzablony([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dane.manufacturer_ref, dane.bay_role]);

  const opcjeRodzin = useMemo(
    () =>
      rodziny.map((r) => ({
        id: r.switchgear_family_ref,
        etykieta: `${r.family_name} · ${r.manufacturer_ref}`,
      })),
    [rodziny],
  );

  const opcjeSzablonow = useMemo(
    () =>
      szablony
        .filter((t) => t.switchgear_family_ref === dane.switchgear_family_ref)
        .map((t) => ({ id: t.template_ref, etykieta: t.notes_pl ?? `Szablon · ${t.manufacturer_ref}` })),
    [szablony, dane.switchgear_family_ref],
  );

  /** Wybrana rodzina i wskazana karta katalogowa pola — źródło nagłówka i składu. */
  const wybranaRodzina = useMemo(
    () => rodziny.find((r) => r.switchgear_family_ref === dane.switchgear_family_ref) ?? null,
    [dane.switchgear_family_ref, rodziny],
  );
  const wybranySzablon = useMemo(
    () => szablony.find((t) => t.template_ref === dane.bay_template_ref) ?? null,
    [dane.bay_template_ref, szablony],
  );

  const zmien = useCallback(<K extends keyof PolaSnFormData>(pole: K, wartosc: PolaSnFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
  }, []);

  const wybierzRodzine = useCallback(
    (familyRef: string) => {
      const family = rodziny.find((r) => r.switchgear_family_ref === familyRef) ?? null;
      setDane((p) => ({
        ...p,
        switchgear_family_ref: family?.switchgear_family_ref ?? null,
        manufacturer_ref: family?.manufacturer_ref ?? null,
        bay_template_ref: null, // zmiana rodziny/producenta → inne szablony
      }));
    },
    [rodziny],
  );

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
      selekcjaPoOperacji(response, { type: 'BaySN', name: dane.field_name.trim() || 'Pole SN' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, hasSzyne, kontekst, selekcjaPoOperacji]);

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszSzyna,
      stan: hasSzyne ? 'kompletne' : 'brak',
      wartosc: kontekst.station_label || (hasSzyne ? 'Wskazana' : 'Brak'),
    },
    { etykieta: T.wierszRola, stan: 'kompletne', wartosc: rolaLabel(dane.bay_role) },
    {
      etykieta: T.wierszSzablon,
      stan: maSzablonProducenta(dane) ? 'kompletne' : 'ostrzezenie',
      wartosc: maSzablonProducenta(dane) ? 'Powiązany' : 'Zalecany',
    },
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
  // S9-5 (klasa: bramka enable bez sygnału gotowości) — jedno źródło prawdy
  // dla `disabled` i `data-status` (patrz `KreatorMagistralaSn.tsx`, ta sama
  // karta i ten sam mechanizm powtórzony w tym pliku).
  const stanGotowosci: 'ladowanie' | 'zablokowany' | 'gotowy' =
    !hasSzyne || !activeCaseId
      ? 'zablokowany'
      : katalogLadowanie
        ? 'ladowanie'
        : 'gotowy';
  const zapisZablokowany = stanGotowosci !== 'gotowy';

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
      walidacja={
        stanGotowosci === 'ladowanie'
          ? T.katalogLadowanieStopka
          : bledy.length > 0
            ? T.walidacjaStopka
            : !hasSzyne
              ? T.brakSzynyOpis
              : null
      }
      status={stanGotowosci}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: zapisZablokowany, testid: 'mvd-kreator-pole-zapisz' }}
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
        <>
          <KreatorSekcja tytul={T.szablonTytul} testid="mvd-kreator-pole-szablon">
            <KreatorInfo>{T.rolaPomoc}</KreatorInfo>
            <KreatorSiatka kolumny={2}>
              <PoleWyboru
                etykieta={T.rola}
                wartosc={dane.bay_role}
                onZmiana={(v) => zmien('bay_role', v as RolaPola)}
                opcje={OPCJE_ROL}
                testid="mvd-kreator-pole-rola"
              />
              <PoleTekstowe
                etykieta={T.nazwa}
                wartosc={dane.field_name}
                onZmiana={(v) => zmien('field_name', v)}
                placeholder={T.nazwaPlaceholder}
                testid="mvd-kreator-pole-nazwa"
              />
            </KreatorSiatka>
            {dane.bay_role === 'MEASUREMENT' ? (
              <>
                <KreatorInfo>{T.rodzajPomiaruPomoc}</KreatorInfo>
                <PoleWyboru
                  etykieta={T.rodzajPomiaru}
                  wartosc={dane.wybor_pomiaru}
                  onZmiana={(v) => zmien('wybor_pomiaru', v as WyborPomiaru)}
                  opcje={OPCJE_POMIARU}
                  testid="mvd-kreator-pole-rodzaj-pomiaru"
                />
              </>
            ) : null}
            <KreatorInfo>{T.szablonPomoc}</KreatorInfo>
            <KreatorSiatka kolumny={2}>
              <PoleWyboru
                etykieta={T.rodzina}
                wartosc={dane.switchgear_family_ref ?? ''}
                onZmiana={(v) => wybierzRodzine(v)}
                opcje={[{ id: '', etykieta: T.rodzinaPlaceholder }, ...opcjeRodzin]}
                testid="mvd-kreator-pole-rodzina"
              />
              <PoleWyboru
                etykieta={T.szablon}
                wartosc={dane.bay_template_ref ?? ''}
                onZmiana={(v) => zmien('bay_template_ref', v || null)}
                opcje={[{ id: '', etykieta: T.szablonPlaceholder }, ...opcjeSzablonow]}
                testid="mvd-kreator-pole-szablon-wybor"
              />
            </KreatorSiatka>
            {dane.switchgear_family_ref && opcjeSzablonow.length === 0 ? (
              <KreatorInfo>{T.szablonBrak}</KreatorInfo>
            ) : null}

            {/* KONFIGURATOR-POL-RMU (etap S3) — TEN SAM model katalogowego pola,
                co w kreatorze stacji: nagłówek rodziny (klasy znamionowe,
                technologia, tor konfiguracji) i PEŁNY skład pola z karty
                producenta. Pole SN jest kompletną jednostką funkcjonalną także
                wtedy, gdy dokłada się je pojedynczo do istniejącej rozdzielnicy. */}
            {wybranaRodzina ? (
              <KreatorSekcja tytul={ST.naglowekRodzinyTytul} testid="mvd-kreator-pole-naglowek-rodziny">
                <dl className="mvd-kreator-naglowek-rodziny">
                  {naglowekRodziny(wybranaRodzina, wybranaRodzina.manufacturer_ref).map((wiersz) => (
                    <Fragment key={wiersz.etykieta}>
                      <dt>{wiersz.etykieta}</dt>
                      <dd data-brak={wiersz.wartosc === null ? 'tak' : 'nie'}>
                        {wiersz.wartosc ?? ST.naglowekBrakDanej}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
                {/* Rodzina dostarczana blokami fabrycznymi: pojedyncze pole nie
                    opisuje tego wyrobu. Nie blokujemy operacji (o przyjęciu
                    rozstrzyga walidator backendu), ale mówimy to wprost. */}
                {torRodziny(wybranaRodzina) === 'BLOK_RMU' ? (
                  <KreatorInfo testid="mvd-kreator-pole-rodzina-blokowa">
                    {T.rodzinaBlokowaOpis}
                  </KreatorInfo>
                ) : null}
              </KreatorSekcja>
            ) : null}

            {dane.bay_template_ref ? (
              <KartaWyposazeniaPola
                pozycje={wyposazenieSzablonu(wybranySzablon)}
                szablonWskazany
                // `add_sn_bay` NIE MA w kontrakcie pola `equipment`, więc żadne
                // doposażenie nie jest tu sterowalne — statusy są readoutem karty
                // katalogowej, a nie przełącznikami bez skutku w modelu.
                kluczeOperacji={BEZ_DOPOSAZENIA}
                testid="mvd-kreator-pole-wyposazenie"
              />
            ) : null}
            <PanelTeorii
              tytul={T.teoriaTytul}
              opis={T.teoriaOpis}
              wymog={T.teoriaWymog}
              podstawa={T.teoriaPodstawa}
              testid="mvd-kreator-pole-teoria"
            />
          </KreatorSekcja>

          <KreatorSekcja tytul={T.aparatSekcja} testid="mvd-kreator-pole-aparat-sekcja">
            <KreatorInfo>{T.typPomoc}</KreatorInfo>
            <PoleWyboru
              etykieta={T.aparat}
              wartosc={dane.apparatus_kind}
              onZmiana={(v) => zmien('apparatus_kind', v as RodzajAparatu)}
              opcje={OPCJE_APARAT}
              testid="mvd-kreator-pole-aparat"
            />
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
            {paramReadout}
          </KreatorSekcja>
        </>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-pole-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszSzyna} wartosc={kontekst.station_label || '—'} />
            <RzadWartosci etykieta={T.wierszRola} wartosc={rolaLabel(dane.bay_role)} />
            {dane.bay_role === 'MEASUREMENT' ? (
              <RzadWartosci
                etykieta={T.wierszRodzajPomiaru}
                wartosc={wyborPomiaruLabel(dane.wybor_pomiaru)}
              />
            ) : null}
            <RzadWartosci etykieta={T.aparat} wartosc={aparatLabel(dane.apparatus_kind)} />
            <RzadWartosci etykieta={T.nazwa} wartosc={dane.field_name.trim() || '—'} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
