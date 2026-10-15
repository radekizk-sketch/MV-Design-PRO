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
  fetchManufacturers,
  fetchMvApparatusTypes,
  fetchSwitchgearFamilies,
  getCatalogErrorMessage,
} from '../../../ui/catalog/api';
import type { Manufacturer } from '../../../ui/catalog/manufacturer';
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
  fmtKvPl,
  jedynaZgodna,
  napiecieSzyny,
  pierwszyBrak,
  useDecyzjeProjektanta,
  useProwadzenie,
  useSelekcjaPoOperacji,
  wskazanieZBledu,
  type KrokKreatora,
  type MiejscePola,
  type WierszGotowosci,
  nazwaKartyPola,
  nazwaRodziny,
} from '../rama';
import { aparatyDlaPola } from '../stacja/stacjaModel';
import { aparatWOfercieRodziny } from '../stacja/zgodnoscPola';
import {
  APARAT_OPCJE,
  DANE_DOMYSLNE,
  ROLE_OPCJE,
  WYBOR_POMIARU_OPCJE,
  aparatLabel,
  bayKindZRoli,
  czyRolaPola,
  maSzablonProducenta,
  maSzyne,
  rodzajAparatuZKatalogu,
  rolaLabel,
  OPCJE_ROLI_UZIEMNIKA,
  walidujFormularz,
  wyborPomiaruLabel,
  zbudujPayload,
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

/** Pole formularza → krok i kontrolka (wskazanie BRAKU_DO_OPERACJI przy zapisie). */
const MIEJSCA: Readonly<Record<string, MiejscePola>> = {
  bay_role: { krok: 'pole', pole: 'mvd-kreator-pole-rola' },
  catalog_ref: { krok: 'pole', pole: 'mvd-kreator-pole-katalog' },
  apparatus_kind: { krok: 'pole', pole: 'mvd-kreator-pole-aparat' },
};

type PoleAuto = 'bay_role' | 'catalog_ref' | 'apparatus_kind' | 'wybor_pomiaru';

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

  const rolaZKontekstu = czyRolaPola(context?.bay_role) ? context?.bay_role : null;
  const [dane, setDane] = useState<PolaSnFormData>(() => ({ ...DANE_DOMYSLNE, bay_role: rolaZKontekstu }));
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('pole');
  const prowadzenie = useProwadzenie(setKrok);
  const { edytowane, decyzjaProjektanta } = useDecyzjeProjektanta<PoleAuto>();
  const napiecieKv = useMemo(() => napiecieSzyny(snapshot, kontekst.bus_ref), [kontekst.bus_ref, snapshot]);

  const [typy, setTypy] = useState<MVApparatusCatalogType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  const [rodziny, setRodziny] = useState<SwitchgearFamily[]>([]);
  const [producenci, setProducenci] = useState<Manufacturer[]>([]);
  const [szablony, setSzablony] = useState<CompleteMvBayTemplateSummary[]>([]);
  // S9-5 (klasa: bramka enable bez sygnału gotowości) — jawny znacznik
  // ładowania katalogu, niezależny od `typy.length` (katalog pusty PO
  // wczytaniu wygląda inaczej niż katalog W TRAKCIE wczytywania).
  const [katalogLadowanie, setKatalogLadowanie] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    setKatalogLadowanie(true);
    Promise.all([fetchMvApparatusTypes(), fetchSwitchgearFamilies(), fetchManufacturers()])
      .then(([apar, fam, prod]) => {
        if (cancelled) return;
        setTypy(Array.isArray(apar) ? apar : []);
        setRodziny(Array.isArray(fam) ? fam : []);
        setProducenci(Array.isArray(prod) ? prod : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setTypy([]);
        setRodziny([]);
        setProducenci([]);
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

  /** Wybrana rodzina — źródło nagłówka, oferty aparatów i kart pola. */
  const wybranaRodzina = useMemo(
    () => rodziny.find((r) => r.switchgear_family_ref === dane.switchgear_family_ref) ?? null,
    [dane.switchgear_family_ref, rodziny],
  );

  // Aparaty zdatne na napięcie szyny (U_n aparatu ≥ U_n szyny) z OFERTY WYBRANEJ RODZINY
  // (rodzaje karty rodziny, producent rodziny albo komponent wymienny) — te same predykaty
  // co dobór aparatu pola w kreatorze stacji; bez rodziny — pełny katalog zdatny napięciowo.
  const zdatne = useMemo(
    () =>
      aparatyDlaPola(
        wybranaRodzina ? typy.filter((a) => aparatWOfercieRodziny(a, wybranaRodzina)) : typy,
        napiecieKv ?? 0,
      ),
    [napiecieKv, typy, wybranaRodzina],
  );
  const opcjeTypow = useMemo(
    () => zdatne.map((t) => ({ id: t.id, etykieta: `${t.name} · ${t.u_n_kv} kV · ${t.i_n_a} A` })),
    [zdatne],
  );

  // AUTO_PRZYJETE: rola z kontekstu wywołania, jedyny aparat zdatny na napięcie szyny, rodzaj
  // aparatu z pozycji katalogowej, wybór pomiaru wg reguły domyślnej kontraktu.
  const jedynyAparat = useMemo(() => (napiecieKv !== null ? jedynaZgodna(zdatne) : null), [napiecieKv, zdatne]);
  useEffect(() => {
    if (!jedynyAparat || napiecieKv === null || dane.catalog_ref || decyzjaProjektanta('catalog_ref')) return;
    setDane((p) => ({ ...p, catalog_ref: jedynyAparat.id }));
  }, [dane.catalog_ref, decyzjaProjektanta, jedynyAparat, napiecieKv]);
  const rodzajZKatalogu = rodzajAparatuZKatalogu(params?.device_kind);
  useEffect(() => {
    if (!rodzajZKatalogu || decyzjaProjektanta('apparatus_kind')) return;
    setDane((p) => (p.apparatus_kind === rodzajZKatalogu ? p : { ...p, apparatus_kind: rodzajZKatalogu }));
  }, [decyzjaProjektanta, rodzajZKatalogu]);

  // Szablony pola producenta dla wybranej rodziny (producent) + roli (BayKind).
  // Reużycie Reference Engine (fetchCompleteBayTemplates) — jak kreator GPZ (K5).
  useEffect(() => {
    let cancelled = false;
    if (!dane.manufacturer_ref || !dane.bay_role) {
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
        etykieta: nazwaRodziny(r),
      })),
    [rodziny],
  );

  const opcjeSzablonow = useMemo(
    () =>
      szablony
        .filter((t) => t.switchgear_family_ref === dane.switchgear_family_ref)
        .map((t) => ({ id: t.template_ref, etykieta: nazwaKartyPola(t, T.kartaPolaZapas) })),
    [szablony, dane.switchgear_family_ref],
  );

  /** Wskazana karta katalogowa pola — źródło składu. */
  const wybranySzablon = useMemo(
    () => szablony.find((t) => t.template_ref === dane.bay_template_ref) ?? null,
    [dane.bay_template_ref, szablony],
  );

  const zmien = useCallback(<K extends keyof PolaSnFormData>(pole: K, wartosc: PolaSnFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
    if (pole === 'bay_role' || pole === 'catalog_ref' || pole === 'apparatus_kind' || pole === 'wybor_pomiaru') {
      edytowane(pole as PoleAuto);
    }
  }, [edytowane]);

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

  // KONFLIKT_TECHNICZNY — napięcie znamionowe aparatu < napięcie szyny: od razu przy polu.
  const konfliktNapiecia =
    params && napiecieKv !== null && params.u_n_kv + 1e-6 < napiecieKv
      ? T.konfliktNapiecia(fmtKvPl(napiecieKv))
      : undefined;

  const onZapisz = useCallback(async () => {
    const brak = pierwszyBrak([
      !hasSzyne && { komunikat: T.brakSzynyOpis },
      konfliktNapiecia ? { komunikat: konfliktNapiecia, ...MIEJSCA.catalog_ref } : null,
      ...walidujFormularz(dane).map((b) => wskazanieZBledu(b, MIEJSCA)),
      !activeCaseId && { komunikat: T.brakZakresu },
    ]);
    if (brak) {
      prowadzenie.wskaz(brak);
      return;
    }
    prowadzenie.zgas();
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId as string, 'add_sn_bay', zbudujPayload(dane, kontekst));
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladZapisu);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, { type: 'BaySN', name: dane.field_name.trim() || 'Pole SN' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladZapisu);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, hasSzyne, konfliktNapiecia, kontekst, prowadzenie, selekcjaPoOperacji]);

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszSzyna,
      stan: hasSzyne ? 'ustalone' : 'do_wyboru',
      wartosc: kontekst.station_label || (hasSzyne ? 'Wskazana' : T.szynaDoWskazania),
    },
    {
      etykieta: T.wierszRola,
      stan: !dane.bay_role ? 'do_wyboru' : 'ustalone',
      wartosc: rolaLabel(dane.bay_role),
    },
    {
      etykieta: T.wierszSzablon,
      stan: maSzablonProducenta(dane) ? 'ustalone' : 'do_wyboru',
      wartosc: maSzablonProducenta(dane) ? 'Powiązany' : T.szablonOpcjonalny,
    },
    {
      etykieta: T.wierszAparat,
      stan: konfliktNapiecia ? 'konflikt' : !dane.catalog_ref ? 'do_wyboru' : 'ustalone',
      wartosc: params?.name ?? '',
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
      {...prowadzenie.propsRamy}
      akcjaGlowna={{
        etykieta: T.zapisz,
        onClick: onZapisz,
        blokada: katalogLadowanie ? 'ladowanie' : null,
        testid: 'mvd-kreator-pole-zapisz',
      }}
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
                wartosc={dane.bay_role ?? ''}
                onZmiana={(v) => zmien('bay_role', (v || null) as RolaPola | null)}
                opcje={[{ id: '', etykieta: T.rolaPlaceholder }, ...OPCJE_ROL]}
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
            <PoleWyboru
              etykieta={T.rolaUziemnika}
              wartosc={dane.earthing_role}
              onZmiana={(v) => zmien('earthing_role', v as PolaSnFormData['earthing_role'])}
              opcje={OPCJE_ROLI_UZIEMNIKA}
              pomoc={T.rolaUziemnikaPomoc}
              testid="mvd-kreator-pole-rola-uziemnika"
            />
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
                  {naglowekRodziny(
                    wybranaRodzina,
                    producenci.find((m) => m.manufacturer_ref === wybranaRodzina.manufacturer_ref)?.name
                      ?? null,
                  ).map((wiersz) => (
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
              wartosc={dane.apparatus_kind ?? ''}
              onZmiana={(v) => zmien('apparatus_kind', (v || null) as RodzajAparatu | null)}
              opcje={[{ id: '', etykieta: T.aparatPlaceholder }, ...OPCJE_APARAT]}
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
              blad={konfliktNapiecia}
              testid="mvd-kreator-pole-katalog"
            />
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
