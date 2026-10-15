/**
 * KreatorZrodloZasilania — pełnoekranowy, 7-krokowy konfigurator „Dodaj źródło
 * zasilania (GPZ / rozdzielnia SN)". Przebudowa od zera wg audytu eksperckiego
 * `docs/uiux/AUDYT_KREATOR_ZRODLA_2026-07.md` (V12K-043): układ dwukolumnowy
 * (kroki+pola | stała kolumna: podsumowanie backendu + kontrola gotowości),
 * KOMPLET opcji z kontraktu `add_grid_source_sn` (katalog / ręczny ekwiwalent,
 * strona SN/110 kV, Sk″/impedancja, składowa zerowa, uziemienie R/X, per-sekcja,
 * transformatory, aparaty, parametry normowe).
 *
 * ZERO fizyki w UI: Sk″/Ik″/κ/ip/Ith/Z1/Z0 liczy backend (fetchGridSourcePreview,
 * IEC 60909). ZERO fabrykacji: każda opcja mapuje na realne pole payloadu.
 * Kontrakt operacji domenowej bez zmian (payload w `zrodloModel`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import {
  fetchCompleteBayTemplates,
  fetchMvApparatusTypes,
  fetchSourceSystemTypes,
  fetchSwitchgearFamilies,
  fetchTapChangers,
  fetchTransformerTypes,
  getCatalogErrorMessage,
} from '../../../ui/catalog/api';
import type { CompleteMvBayTemplateSummary } from '../../../ui/catalog/BayTemplatePicker';
import type { SwitchgearFamily } from '../../../ui/catalog/SwitchgearFamilyPicker';
import { rodzinaObslugujeNapiecie } from '../stacja/konfiguratorRozdzielnicy';
import type {
  MVApparatusCatalogType,
  SourceSystemCatalogType,
  TapChangerCatalogType,
  TransformerType,
} from '../../../ui/catalog/types';
import { validateCatalogFirst } from '../../../ui/network-build/forms/catalogFirstRules';
import { catalogRefFromInput } from '../../../ui/network-build/forms/catalogPayload';
import type { TypPunktuNeutralnego } from '../../../types/uziemienie';
import {
  fetchGridSourcePreview,
  type GridSourcePreviewResponse,
} from '../../../ui/network-build/forms/gridSourcePreviewApi';
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
  PolePrzelacznik,
  PolePrzelacznikBinarny,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  TekstZWzorami,
  jedynaZgodna,
  pierwszyBrak,
  useDecyzjeProjektanta,
  useProwadzenie,
  useSelekcjaPoOperacji,
  wskazanieZBledu,
  type KrokKreatora,
  type MiejscePola,
  type StatusPobrania,
  nazwaKartyPola,
  nazwaRodziny,
} from '../rama';
import { aparatWOfercieRodziny } from '../stacja/zgodnoscPola';
import {
  MAX_POL_NA_SEKCJE,
  aparatZdatnyNaSn,
  etykietaAparatu,
  etykietaZrodlaKatalogu,
  formatujKa,
  formatujLiczbe,
  formatujMva,
  formatujZespolona,
  konfliktyFormularza,
  normalizujSekcje,
  opisUziemienia,
  pasujeRodzajAparatu,
  scalDanePoczatkowe,
  transformatorPasujeDoSn,
  walidujFormularz,
  wierszeGotowosci,
  zbudujOznaczenieGpz,
  zbudujPayloadZrodla,
  zbudujZadaniePodgladu,
  zastosujPozycjeKatalogu,
  znajdzPozycjeKatalogu,
  type GpzLineFieldApparatusKind,
  type GridSourceFormData,
} from './zrodloModel';
import { ZRODLO_STRINGS as T } from './strings';
import { WykresSztywnosci } from './WykresSztywnosci';
import { wPasmieWn } from '../../model/pasmaNapieciowe';

const KROKI: readonly KrokKreatora[] = [
  { id: 'identyfikacja', tytul: T.krokIdentyfikacja },
  { id: 'zrodlo', tytul: T.krokZrodlo },
  { id: 'transformatory', tytul: T.krokTransformatory },
  { id: 'rozdzielnia', tytul: T.krokRozdzielnia },
  { id: 'sekcje', tytul: T.krokSekcje },
  { id: 'normy', tytul: T.krokNormy },
  { id: 'zapis', tytul: T.krokZapis },
];

/** Miejsce pola modelu w kreatorze — cel wskazania BRAKU_DO_OPERACJI (krok + kontrolka). */
const MIEJSCA: Readonly<Record<string, MiejscePola>> = {
  source_name: { krok: 'identyfikacja', pole: 'mvd-kreator-zrodlo-nazwa' },
  sn_voltage_kv: { krok: 'identyfikacja', pole: 'mvd-kreator-zrodlo-napiecie' },
  catalog_ref: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-katalog-select' },
  hv_voltage_kv: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-hv-napiecie' },
  sk3_hv_mva: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-sk3hv' },
  sk3_mva: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-sk3' },
  rx_ratio: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-rx' },
  r_ohm: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-rohm' },
  x_ohm: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-xohm' },
  u_set_pu: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-uset' },
  sk3_min_mva: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-sk3min' },
  ik3_min_ka: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-ik3min' },
  rx_ratio_min: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-rxmin' },
  r0_ohm: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-r0' },
  x0_ohm: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-x0' },
  z0_z1_ratio: { krok: 'zrodlo', pole: 'mvd-kreator-zrodlo-z0z1' },
  transformer_count: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-liczba-trafo' },
  transformer_catalog_ref: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-transformator-katalog' },
  oltc_regulated_winding: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-oltc-uzwojenie' },
  oltc_step_percent: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-oltc-krok' },
  oltc_neutral_position: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-oltc-neutral' },
  oltc_min_position: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-oltc-min' },
  oltc_current_position: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-oltc-biezaca' },
  oltc_max_position: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-oltc-max' },
  oltc_control_mode: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-oltc-tryb' },
  oltc_voltage_setpoint_kv: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-oltc-setpoint' },
  oltc_deadband_kv: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-oltc-deadband' },
  oltc_ldc_r_ohm: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-oltc-ldc-r' },
  oltc_ldc_x_ohm: { krok: 'transformatory', pole: 'mvd-kreator-zrodlo-oltc-ldc-x' },
  sections_count: { krok: 'rozdzielnia', pole: 'mvd-kreator-zrodlo-liczba-sekcji' },
  grounding_type: { krok: 'rozdzielnia', pole: 'mvd-kreator-zrodlo-uziemienie' },
  grounding_r_ohm: { krok: 'rozdzielnia', pole: 'mvd-kreator-zrodlo-uziemienie-ohm' },
  grounding_x_ohm: { krok: 'rozdzielnia', pole: 'mvd-kreator-zrodlo-uziemienie-ohm' },
  line_fields_per_section: { krok: 'sekcje' },
  gpz_section_name: { krok: 'sekcje' },
  gpz_line_field_name: { krok: 'sekcje' },
  gpz_line_field_apparatus_catalog_ref: { krok: 'sekcje', pole: 'mvd-kreator-zrodlo-aparat-katalog' },
  thermal_time_s: { krok: 'normy', pole: 'mvd-kreator-zrodlo-tk' },
};

/** Pola, które kreator dobiera automatycznie z jednoznacznego źródła. */
type PoleAuto = 'catalog_ref' | 'transformer_catalog_ref' | 'hv_voltage_kv' | 'gpz_line_field_apparatus_catalog_ref';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function daneZKontekstu(context: Record<string, unknown> | null): Partial<GridSourceFormData> {
  if (!context) return {};
  const initial: Partial<GridSourceFormData> = {};
  const sourceName = readString(context.source_name);
  const voltageKv = readNumber(context.sn_voltage_kv) ?? readNumber(context.voltage_kv);
  const catalogRef = catalogRefFromInput(context.catalog_ref) ?? catalogRefFromInput(context.catalog_binding);
  const sectionsCount = readNumber(context.sections_count);
  const transformerCount = readNumber(context.transformer_count);
  const lineFieldsPerSection = readNumber(context.line_fields_per_section);
  if (sourceName) initial.source_name = sourceName;
  if (voltageKv !== null) initial.sn_voltage_kv = voltageKv;
  if (catalogRef) initial.catalog_ref = catalogRef;
  if (sectionsCount !== null) initial.sections_count = sectionsCount;
  if (transformerCount !== null) initial.transformer_count = transformerCount;
  if (lineFieldsPerSection !== null) initial.line_fields_per_section = lineFieldsPerSection;
  return initial;
}

export function KreatorZrodloZasilania() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const collapseSurfaceStackTo = useNetworkBuildStore((s) => s.collapseSurfaceStackTo);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const [dane, setDane] = useState<GridSourceFormData>(() =>
    scalDanePoczatkowe(daneZKontekstu(context as Record<string, unknown> | null)),
  );
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('identyfikacja');
  const prowadzenie = useProwadzenie(setKrok);
  const { edytowane, decyzjaProjektanta } = useDecyzjeProjektanta<PoleAuto>();

  const [katalog, setKatalog] = useState<SourceSystemCatalogType[]>([]);
  const [statusKatalogu, setStatusKatalogu] = useState<StatusPobrania>('idle');
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  const [aparaty, setAparaty] = useState<MVApparatusCatalogType[]>([]);
  const [bladAparatow, setBladAparatow] = useState<string | null>(null);

  const [rodziny, setRodziny] = useState<SwitchgearFamily[]>([]);
  const [bladRodzin, setBladRodzin] = useState<string | null>(null);
  const [szablonyPol, setSzablonyPol] = useState<CompleteMvBayTemplateSummary[]>([]);

  const [transformatory, setTransformatory] = useState<TransformerType[]>([]);
  const [bladTransformatorow, setBladTransformatorow] = useState<string | null>(null);

  const [tapChangery, setTapChangery] = useState<TapChangerCatalogType[]>([]);
  const [bladTapChangerow, setBladTapChangerow] = useState<string | null>(null);

  const [podglad, setPodglad] = useState<GridSourcePreviewResponse | null>(null);
  const [statusPodgladu, setStatusPodgladu] = useState<StatusPobrania>('idle');
  const [bladPodgladu, setBladPodgladu] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatusKatalogu('loading');
    setBladKatalogu(null);
    fetchSourceSystemTypes()
      .then((items) => {
        if (cancelled) return;
        setKatalog(Array.isArray(items) ? items : []);
        setStatusKatalogu('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setKatalog([]);
        setStatusKatalogu('error');
        setBladKatalogu(getCatalogErrorMessage(error));
      });
    return () => { cancelled = true; };
  }, []);

  // AUTO_PRZYJETE: system zasilający z katalogu tylko wtedy, gdy na napięcie SN pasuje JEDNA
  // pozycja (dawniej cicho pierwsza z listy). Kilka pozycji = wybór projektanta. Dane pozycji
  // (Sk″, R/X, MIN) idą do pól jak zwykłe wartości — `zastosujPozycjeKatalogu`, to samo co
  // ręczny wybór.
  const jedynySystem = useMemo(
    () => jedynaZgodna(katalog, (s) => dane.sn_voltage_kv === null || s.voltage_rating_kv === dane.sn_voltage_kv),
    [dane.sn_voltage_kv, katalog],
  );
  useEffect(() => {
    if (dane.manual_mode || dane.catalog_ref || !jedynySystem || decyzjaProjektanta('catalog_ref')) return;
    setDane((p) => (p.catalog_ref ? p : zastosujPozycjeKatalogu(p, jedynySystem.id, jedynySystem)));
  }, [dane.catalog_ref, dane.manual_mode, decyzjaProjektanta, jedynySystem]);

  useEffect(() => {
    let cancelled = false;
    setBladAparatow(null);
    fetchMvApparatusTypes()
      .then((items) => {
        if (cancelled) return;
        setAparaty(Array.isArray(items) ? items : []);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setAparaty([]);
        setBladAparatow(getCatalogErrorMessage(error));
      });
    return () => { cancelled = true; };
  }, []);

  // Rodziny rozdzielnic producentów (Reference Engine).
  useEffect(() => {
    let cancelled = false;
    setBladRodzin(null);
    fetchSwitchgearFamilies()
      .then((items) => {
        if (cancelled) return;
        setRodziny(Array.isArray(items) ? items : []);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRodziny([]);
        setBladRodzin(getCatalogErrorMessage(error));
      });
    return () => { cancelled = true; };
  }, []);

  // Szablony pól odpływowych dla wybranej rodziny/producenta.
  useEffect(() => {
    if (!dane.manufacturer_ref) {
      setSzablonyPol([]);
      return undefined;
    }
    let cancelled = false;
    fetchCompleteBayTemplates(dane.manufacturer_ref, 'liniowe_odplywowe')
      .then((items) => {
        if (cancelled) return;
        setSzablonyPol(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (cancelled) return;
        setSzablonyPol([]);
      });
    return () => { cancelled = true; };
  }, [dane.manufacturer_ref]);

  // Katalog transformatorów 110/SN.
  useEffect(() => {
    let cancelled = false;
    setBladTransformatorow(null);
    fetchTransformerTypes()
      .then((items) => {
        if (cancelled) return;
        setTransformatory(Array.isArray(items) ? items : []);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTransformatory([]);
        setBladTransformatorow(getCatalogErrorMessage(error));
      });
    return () => { cancelled = true; };
  }, []);

  // Katalog przełączników zaczepów (OLTC/DETC) — V12K-045.
  useEffect(() => {
    let cancelled = false;
    setBladTapChangerow(null);
    fetchTapChangers()
      .then((items) => {
        if (cancelled) return;
        setTapChangery(Array.isArray(items) ? items : []);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTapChangery([]);
        setBladTapChangerow(getCatalogErrorMessage(error));
      });
    return () => { cancelled = true; };
  }, []);

  // Aparaty pól liniowych: rodzaj z wyboru + U_n aparatu ≥ U_n sieci (ten sam predykat co
  // konflikt przy polu — `aparatZdatnyNaSn`) + oferta WYBRANEJ RODZINY rozdzielnicy GPZ
  // (rodzaje karty rodziny, producent rodziny albo komponent wymienny — ten sam predykat
  // co kreator stacji i kreator pola SN). Bez rodziny — pełny katalog zdatny.
  const wybranaRodzinaGpz = useMemo(
    () => rodziny.find((r) => r.switchgear_family_ref === dane.switchgear_family_ref) ?? null,
    [dane.switchgear_family_ref, rodziny],
  );
  const filtrowaneAparaty = useMemo(
    () => aparaty.filter((item) =>
      pasujeRodzajAparatu(item, dane.gpz_line_field_apparatus_kind)
      && aparatZdatnyNaSn(item, dane.sn_voltage_kv)
      && (wybranaRodzinaGpz === null || aparatWOfercieRodziny(item, wybranaRodzinaGpz))),
    [aparaty, dane.gpz_line_field_apparatus_kind, dane.sn_voltage_kv, wybranaRodzinaGpz],
  );

  const napiecieSn = dane.sn_voltage_kv ?? 0;
  // Transformatory 110/SN: strona górna w paśmie WN, napięcie dolne = napięcie SN sieci
  // (`transformatorPasujeDoSn`, ten sam predykat co konflikt przy polu; dawniej okno ±6 kV
  // przepuszczało 110/20 kV do sieci 15 kV).
  const filtrowaneTransformatory = useMemo(
    () => transformatory.filter((t) =>
      transformatorPasujeDoSn(t.voltage_lv_kv, dane.sn_voltage_kv) && wPasmieWn(t.voltage_hv_kv)),
    [transformatory, dane.sn_voltage_kv],
  );
  const opcjeTransformatorow = useMemo(
    () => filtrowaneTransformatory.map((t) => ({
      id: t.id,
      etykieta: `${t.name} · ${t.rated_power_mva} MVA · ${t.voltage_hv_kv}/${t.voltage_lv_kv} kV · ${t.vector_group}`,
    })),
    [filtrowaneTransformatory],
  );
  const ustawTransformator = useCallback((catalogRef: string | null) => {
    const t = transformatory.find((item) => item.id === catalogRef) ?? null;
    setDane((p) => ({
      ...p,
      transformer_catalog_ref: catalogRef,
      transformer_sn_mva: t?.rated_power_mva ?? null,
      transformer_uk_percent: t?.uk_percent ?? null,
      transformer_vector_group: t?.vector_group ?? null,
    }));
  }, [transformatory]);
  const wybierzTransformator = useCallback((catalogRef: string | null) => {
    ustawTransformator(catalogRef);
    edytowane('transformer_catalog_ref');
  }, [edytowane, ustawTransformator]);

  const opcjeTapChangerow = useMemo(
    () => tapChangery.map((tc) => ({ id: tc.id, etykieta: tc.label_pl })),
    [tapChangery],
  );
  // Wybór przełącznika z katalogu zasiewa nastawy (reużycie TapChangerItem).
  const wybierzTapChanger = useCallback((catalogRef: string | null) => {
    const tc = tapChangery.find((item) => item.id === catalogRef) ?? null;
    setDane((p) => {
      if (!tc) return { ...p, oltc_tap_changer_catalog_ref: catalogRef };
      const half = Math.floor((tc.tap_count - 1) / 2);
      return {
        ...p,
        oltc_tap_changer_catalog_ref: catalogRef,
        oltc_regulation_type: tc.type === 'oltc' ? 'OLTC' : 'DETC',
        oltc_regulated_winding: tc.regulated_side === 'hv' ? 'HV' : 'LV',
        oltc_neutral_position: tc.neutral_position,
        oltc_current_position: tc.neutral_position,
        oltc_min_position: tc.neutral_position - half,
        oltc_max_position: tc.neutral_position + half,
        oltc_step_percent: tc.step_percent,
        // Tryb sterowania to decyzja projektanta (katalog mówi tylko, czy AVR jest możliwy).
        oltc_control_mode: tc.type === 'oltc' && tc.supports_avr ? p.oltc_control_mode : 'MANUAL',
      };
    });
  }, [tapChangery]);
  // Dobór rodziny do napięcia szyny idzie regułą KATALOGU (wspólny predykat
  // `rodzinaObslugujeNapiecie` — lustro walidatora backendu), a nie dawnym
  // oknem „±6 kV". Tamten próg był zmyślony w UI: przepuszczał rodzinę 12 kV do
  // sieci 17,5 kV i odcinał rodzinę 24 kV od sieci 30 kV bez żadnej podstawy
  // katalogowej ani normowej.
  const opcjeRodzin = useMemo(
    () => rodziny
      .filter((r) => rodzinaObslugujeNapiecie(r, napiecieSn))
      .map((r) => ({ id: r.switchgear_family_ref, etykieta: nazwaRodziny(r) })),
    [rodziny, napiecieSn],
  );
  const opcjeSzablonow = useMemo(
    () => szablonyPol.map((t) => ({ id: t.template_ref, etykieta: nazwaKartyPola(t, T.kartaPolaZapas) })),
    [szablonyPol],
  );

  const wybierzRodzine = useCallback((familyRef: string | null) => {
    const family = rodziny.find((r) => r.switchgear_family_ref === familyRef) ?? null;
    setDane((p) => ({
      ...p,
      switchgear_family_ref: family?.switchgear_family_ref ?? null,
      manufacturer_ref: family?.manufacturer_ref ?? null,
      // zmiana rodziny czyści szablony sekcji (inny producent → inne szablony)
      sekcje: p.sekcje.map((s) => ({ ...s, bayTemplateRef: null })),
    }));
  }, [rodziny]);

  // AUTO_PRZYJETE: jedyny aparat zdatny (rodzaj + napięcie) i jedyny transformator 110/SN na
  // napięcie SN — dawniej cicho pierwsze z listy. Kilka zdatnych = wybór projektanta.
  const jedynyAparat = useMemo(
    () => (dane.sn_voltage_kv !== null ? jedynaZgodna(filtrowaneAparaty) : null),
    [dane.sn_voltage_kv, filtrowaneAparaty],
  );
  useEffect(() => {
    if (!jedynyAparat || dane.gpz_line_field_apparatus_catalog_ref) return;
    if (decyzjaProjektanta('gpz_line_field_apparatus_catalog_ref')) return;
    setDane((p) => (p.gpz_line_field_apparatus_catalog_ref ? p : {
      ...p,
      gpz_line_field_apparatus_catalog_ref: jedynyAparat.id,
    }));
  }, [dane.gpz_line_field_apparatus_catalog_ref, decyzjaProjektanta, jedynyAparat]);

  const jedynyTransformator = useMemo(
    () => (dane.sn_voltage_kv !== null ? jedynaZgodna(filtrowaneTransformatory) : null),
    [dane.sn_voltage_kv, filtrowaneTransformatory],
  );
  useEffect(() => {
    if (!jedynyTransformator || dane.transformer_catalog_ref || decyzjaProjektanta('transformer_catalog_ref')) return;
    ustawTransformator(jedynyTransformator.id);
  }, [dane.transformer_catalog_ref, decyzjaProjektanta, jedynyTransformator, ustawTransformator]);

  // AUTO_PRZYJETE: napięcie strony 110 kV z tabliczki wybranego transformatora (dawniej stałe
  // 110 kV) — projektant może je zmienić w trybie ręcznym.
  const napiecieGorneTrafo = transformatory.find((t) => t.id === dane.transformer_catalog_ref)?.voltage_hv_kv ?? null;
  useEffect(() => {
    if (napiecieGorneTrafo === null || decyzjaProjektanta('hv_voltage_kv')) return;
    setDane((p) => (p.hv_voltage_kv === napiecieGorneTrafo ? p : { ...p, hv_voltage_kv: napiecieGorneTrafo }));
  }, [decyzjaProjektanta, napiecieGorneTrafo]);

  const zadaniePodgladu = useMemo(() => zbudujZadaniePodgladu(dane), [dane]);
  useEffect(() => {
    if (zadaniePodgladu === null) {
      setPodglad(null);
      setStatusPodgladu('idle');
      setBladPodgladu(null);
      return undefined;
    }
    const controller = new AbortController();
    setPodglad(null);
    setStatusPodgladu('loading');
    setBladPodgladu(null);
    void fetchGridSourcePreview(zadaniePodgladu, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setPodglad(result);
        setStatusPodgladu('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPodglad(null);
        setStatusPodgladu('error');
        setBladPodgladu(error instanceof Error ? error.message : T.podsumBladDomyslny);
      });
    return () => controller.abort();
  }, [zadaniePodgladu]);

  const zmien = useCallback(<K extends keyof GridSourceFormData>(pole: K, wartosc: GridSourceFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
    if (pole === 'hv_voltage_kv' || pole === 'gpz_line_field_apparatus_catalog_ref') edytowane(pole as PoleAuto);
  }, [edytowane]);

  const ustawLiczbeSekcji = useCallback((n: number) => {
    setDane((p) => ({
      ...p,
      sections_count: n,
      sekcje: normalizujSekcje(p.sekcje, n, p.line_fields_per_section),
    }));
  }, []);

  const zmienSekcje = useCallback((index: number, patch: Partial<GridSourceFormData['sekcje'][number]>) => {
    setDane((p) => ({
      ...p,
      sekcje: p.sekcje.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }, []);

  // CV-4.3 K7c: przełączenie pozycji ZASTĘPUJE dane wszystkich pól katalogowych danymi NOWEJ
  // pozycji (`zastosujPozycjeKatalogu` — jedno miejsce z auto-wyborem jedynej pozycji).
  const wybierzKatalog = useCallback((catalogRef: string | null) => {
    const selected = znajdzPozycjeKatalogu(katalog, catalogRef);
    setDane((p) => zastosujPozycjeKatalogu(p, catalogRef, selected));
    edytowane('catalog_ref');
  }, [edytowane, katalog]);

  // Parametry pozycji katalogowych do sprawdzenia zgodności z napięciem SN (konflikty przy polu).
  const zgodnosc = useMemo(() => ({
    transformatorLvKv: transformatory.find((t) => t.id === dane.transformer_catalog_ref)?.voltage_lv_kv ?? null,
    aparatUnKv: aparaty.find((a) => a.id === dane.gpz_line_field_apparatus_catalog_ref)?.u_n_kv ?? null,
  }), [aparaty, dane.gpz_line_field_apparatus_catalog_ref, dane.transformer_catalog_ref, transformatory]);
  // KONFLIKT_TECHNICZNY — widoczny od razu przy polu; braki dopiero przy próbie zapisu.
  const konflikty = useMemo(() => konfliktyFormularza(dane, zgodnosc), [dane, zgodnosc]);

  const zapisz = useCallback(async () => {
    const brak = pierwszyBrak([
      ...walidujFormularz(dane, zgodnosc).map((b) => wskazanieZBledu(b, MIEJSCA)),
      !activeCaseId && { komunikat: T.brakZakresu },
    ]);
    if (brak || !activeCaseId) {
      if (brak) prowadzenie.wskaz(brak);
      return;
    }
    prowadzenie.zgas();
    const payload = zbudujPayloadZrodla(dane);
    const validationError = validateCatalogFirst('add_grid_source_sn', payload);
    if (validationError) {
      setBladGlobalny(validationError);
      return;
    }
    setBladGlobalny(null);
    const result = await executeDomainOperation(activeCaseId, 'add_grid_source_sn', payload);
    if (
      typeof result === 'object' && result !== null && 'error' in result
      && typeof (result as { error?: unknown }).error === 'string'
      && (result as { error: string }).error.trim()
    ) {
      setBladGlobalny((result as { error: string }).error);
      return;
    }
    collapseSurfaceStackTo(null);
    closeForm();
    selekcjaPoOperacji(result, {
      type: 'Station',
      name: dane.source_name.trim() || 'Źródło zasilania (GPZ)',
    });
  }, [dane, activeCaseId, executeDomainOperation, collapseSurfaceStackTo, closeForm, prowadzenie, selekcjaPoOperacji, zgodnosc]);

  const bladDlaPola = (pole: string): string | undefined => konflikty.find((b) => b.field === pole)?.message;

  const oznaczenie = useMemo(() => zbudujOznaczenieGpz(dane.source_name), [dane.source_name]);
  const wybranaPozycja = useMemo(() => znajdzPozycjeKatalogu(katalog, dane.catalog_ref), [katalog, dane.catalog_ref]);
  const gotowosc = useMemo(() => wierszeGotowosci(dane, konflikty), [dane, konflikty]);
  const opcjeKatalogu = katalog.map((item) => ({ id: item.id, etykieta: etykietaZrodlaKatalogu(item) }));
  const opcjeAparatow = filtrowaneAparaty.map((item) => ({ id: item.id, etykieta: etykietaAparatu(item) }));

  const indeksKroku = Math.max(0, KROKI.findIndex((k) => k.id === krok));
  const hv = dane.manual_mode && dane.short_circuit_input_side === 'HV_110';
  const impedancja = dane.manual_mode && dane.short_circuit_mode === 'IMPEDANCE';

  const etykietaIk1 = statusPodgladu === 'loading'
    ? 'obliczanie…'
    : statusPodgladu === 'ready' && podglad?.ik1_ka === null
      ? 'brak składowej zerowej'
      : formatujKa(podglad?.ik1_ka);

  // CV-4.3 K7: scenariusz MIN — blok `scenariusz_min` obecny WYŁĄCZNIE gdy formularz
  // podał Sk″min/Ik″min (backend liczy go DRUGIM wywołaniem tego samego solvera
  // podglądu); brak = nie renderujemy nic (zero fabrykacji, R2 karty K7-FE).
  const scenariuszMin = podglad?.scenariusz_min ?? null;
  const etykietaIk1Min = statusPodgladu === 'loading'
    ? 'obliczanie…'
    : scenariuszMin?.ik1_ka === null
      ? 'brak składowej zerowej'
      : formatujKa(scenariuszMin?.ik1_ka);

  const aside = (
    <>
      <KreatorPodsumowanie
        tytul={T.podsumTytul}
        status={statusPodgladu}
        komunikat={
          statusPodgladu === 'error'
            ? (bladPodgladu ?? T.podsumBladDomyslny)
            : zadaniePodgladu === null
              ? T.podsumCzeka
              : null
        }
        komunikatTon={statusPodgladu === 'error' ? 'warn' : undefined}
        testid="mvd-kreator-zrodlo-podsumowanie"
      >
        <RzadWartosci etykieta={T.podsumSk} wartosc={formatujMva(podglad?.sk_mva)} />
        <RzadWartosci etykieta={T.podsumIk3} wartosc={formatujKa(podglad?.ik3_ka)} />
        <RzadWartosci etykieta={T.podsumIk1} wartosc={etykietaIk1} ton={statusPodgladu === 'ready' && podglad?.ik1_ka !== null ? 'ok' : 'warn'} />
        <RzadWartosci etykieta={T.podsumKappa} wartosc={formatujLiczbe(podglad?.kappa, 3)} />
        <RzadWartosci etykieta={T.podsumIp} wartosc={formatujKa(podglad?.ip_ka)} />
        <RzadWartosci etykieta={T.podsumIth} wartosc={formatujKa(podglad?.ith_ka)} />
        <RzadWartosci etykieta={T.podsumZ1} wartosc={formatujZespolona(podglad?.z1_ohm)} />
        <RzadWartosci etykieta={T.podsumZ0} wartosc={formatujZespolona(podglad?.z0_ohm)} />
        <RzadWartosci etykieta={T.podsumZrodlo} wartosc={podglad ? T.podsumZrodloWartosc : T.podsumBrak} />
        {scenariuszMin ? (
          <>
            <RzadWartosci etykieta={T.podsumSkMin} wartosc={formatujMva(scenariuszMin.sk_mva)} testid="mvd-kreator-zrodlo-podsum-sk-min" />
            <RzadWartosci etykieta={T.podsumIk3Min} wartosc={formatujKa(scenariuszMin.ik3_ka)} testid="mvd-kreator-zrodlo-podsum-ik3-min" />
            <RzadWartosci etykieta={T.podsumIk1Min} wartosc={etykietaIk1Min} ton={scenariuszMin.ik1_ka !== null ? 'ok' : 'warn'} />
            <RzadWartosci etykieta={T.podsumKappaMin} wartosc={formatujLiczbe(scenariuszMin.kappa, 3)} />
            <RzadWartosci etykieta={T.podsumIpMin} wartosc={formatujKa(scenariuszMin.ip_ka)} />
            <RzadWartosci etykieta={T.podsumIthMin} wartosc={formatujKa(scenariuszMin.ith_ka)} />
            <RzadWartosci etykieta={T.podsumZ1Min} wartosc={formatujZespolona(scenariuszMin.z1_ohm)} />
            <RzadWartosci etykieta={T.podsumZ0Min} wartosc={formatujZespolona(scenariuszMin.z0_ohm)} />
          </>
        ) : null}
      </KreatorPodsumowanie>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={gotowosc} testid="mvd-kreator-zrodlo-kontrola" />
    </>
  );

  return (
    <KreatorRama
      testid="mvd-kreator-zrodlo"
      pelny
      aside={aside}
      eyebrow={T.eyebrow}
      tytul={dane.source_name || 'GPZ'}
      cel={T.celTworzenie}
      odznaka={T.odznakaNowy}
      kroki={KROKI}
      krokAktywny={krok}
      onKrok={setKrok}
      licznikKrokow={T.licznik(indeksKroku + 1, KROKI.length)}
      krokWstecz={{
        etykieta: T.wstecz,
        onClick: () => setKrok(KROKI[Math.max(0, indeksKroku - 1)].id),
        zablokowana: indeksKroku === 0,
        testid: 'mvd-kreator-zrodlo-wstecz',
      }}
      krokDalej={{
        etykieta: T.dalej,
        onClick: () => setKrok(KROKI[Math.min(KROKI.length - 1, indeksKroku + 1)].id),
        zablokowana: indeksKroku === KROKI.length - 1,
        testid: 'mvd-kreator-zrodlo-dalej',
      }}
      bladGlobalny={bladGlobalny}
      {...prowadzenie.propsRamy}
      akcjaGlowna={{
        etykieta: T.zapisz,
        onClick: () => void zapisz(),
        // Wyszarzenie tylko na czas wczytywania katalogu systemów zasilających (zamknięta lista
        // ramy); brak danych i brak przypadku wskazuje się przy kliknięciu.
        blokada: statusKatalogu === 'loading' ? 'ladowanie' : null,
        testid: 'mvd-kreator-zrodlo-zapisz',
      }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: closeForm, testid: 'mvd-kreator-zrodlo-anuluj' }}
    >
      {krok === 'identyfikacja' ? (
        <KreatorSekcja tytul={T.idTytul} testid="mvd-kreator-zrodlo-id">
          <KreatorSiatka kolumny={2}>
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={dane.source_name}
              onZmiana={(v) => zmien('source_name', v)}
              placeholder={T.nazwaPlaceholder}
              wymagane
              blad={bladDlaPola('source_name')}
              testid="mvd-kreator-zrodlo-nazwa"
            />
            <PoleTekstowe etykieta={T.oznaczenie} wartosc={oznaczenie} tylkoOdczyt />
          </KreatorSiatka>
          <PoleWyboru
            etykieta={T.napiecieSn}
            wartosc={String(dane.sn_voltage_kv ?? '')}
            onZmiana={(v) => zmien('sn_voltage_kv', v === '' ? null : Number(v))}
            opcje={[{ id: '', etykieta: T.napiecieSnPlaceholder }, ...T.napieciaSn]}
            pomoc={T.napiecieSnPomoc}
            wymagane
            blad={bladDlaPola('sn_voltage_kv')}
            testid="mvd-kreator-zrodlo-napiecie"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'zrodlo' ? (
        <>
          <KreatorSekcja tytul={T.trybZrodlaTytul} testid="mvd-kreator-zrodlo-tryb">
            <PolePrzelacznik
              ariaLabel={T.trybZrodlaTytul}
              testid="mvd-kreator-zrodlo-tryb-przel"
              wartosc={dane.manual_mode ? 'reczny' : 'katalog'}
              opcje={[
                { id: 'katalog', etykieta: T.trybKatalog },
                { id: 'reczny', etykieta: T.trybReczny },
              ]}
              onZmiana={(id) => zmien('manual_mode', id === 'reczny')}
            />
            {dane.manual_mode ? <KreatorInfo>{T.trybRecznyInfo}</KreatorInfo> : null}
          </KreatorSekcja>

          {!dane.manual_mode ? (
            <KreatorSekcja tytul={T.katalogTytul} testid="mvd-kreator-zrodlo-katalog">
              <PoleKatalogu
                etykieta={T.katalogPole}
                wartosc={dane.catalog_ref}
                onZmiana={wybierzKatalog}
                opcje={opcjeKatalogu}
                status={statusKatalogu}
                placeholder={T.katalogPlaceholder}
                placeholderLadowanie={T.katalogLadowanie}
                komunikatBledu={bladKatalogu ?? T.katalogBlad}
                pomoc={T.katalogPomoc}
                wymagane
                blad={bladDlaPola('catalog_ref')}
                testid="mvd-kreator-zrodlo-katalog-select"
              />
              <RzadWartosci etykieta={T.zrodloParametrow} wartosc={wybranaPozycja?.name ?? '—'} />
              <RzadWartosci
                etykieta={T.powiazanieKatalogowe}
                wartosc={wybranaPozycja ? etykietaZrodlaKatalogu(wybranaPozycja) : T.powiazanieBrak}
                ton={dane.catalog_ref ? 'ok' : 'warn'}
              />
            </KreatorSekcja>
          ) : (
            <KreatorSekcja tytul={T.zwarcieTytul} testid="mvd-kreator-zrodlo-reczny">
              <PolePrzelacznik
                etykieta={T.stronaTytul}
                testid="mvd-kreator-zrodlo-strona"
                wartosc={dane.short_circuit_input_side}
                opcje={[{ id: 'SN', etykieta: T.stronaSn }, { id: 'HV_110', etykieta: T.stronaHv }]}
                onZmiana={(id) => zmien('short_circuit_input_side', id as GridSourceFormData['short_circuit_input_side'])}
              />
              {!hv ? (
                <PolePrzelacznik
                  etykieta={T.trybParamTytul}
                  testid="mvd-kreator-zrodlo-trybparam"
                  wartosc={dane.short_circuit_mode}
                  opcje={[{ id: 'SHORT_CIRCUIT_POWER', etykieta: T.trybMoc }, { id: 'IMPEDANCE', etykieta: T.trybImpedancja }]}
                  onZmiana={(id) => zmien('short_circuit_mode', id as GridSourceFormData['short_circuit_mode'])}
                />
              ) : null}
              <KreatorSiatka kolumny={3}>
                {hv ? (
                  <>
                    <PoleLiczbowe etykieta={T.napiecieHv} jednostka="kV" wartosc={dane.hv_voltage_kv} onZmiana={(v) => zmien('hv_voltage_kv', v)} wymagane blad={bladDlaPola('hv_voltage_kv')} testid="mvd-kreator-zrodlo-hv-napiecie" />
                    <PoleLiczbowe etykieta={T.sk3Hv} jednostka="MVA" wartosc={dane.sk3_hv_mva} onZmiana={(v) => zmien('sk3_hv_mva', v)} pomoc={T.sk3Pomoc} wymagane blad={bladDlaPola('sk3_hv_mva')} testid="mvd-kreator-zrodlo-sk3hv" />
                    <PoleLiczbowe etykieta={T.rx} wartosc={dane.rx_ratio} onZmiana={(v) => zmien('rx_ratio', v)} krok={0.01} pomoc={T.rxPomoc} wymagane blad={bladDlaPola('rx_ratio')} testid="mvd-kreator-zrodlo-rx" />
                  </>
                ) : impedancja ? (
                  <>
                    <PoleLiczbowe etykieta={T.rOhm} jednostka="Ω" wartosc={dane.r_ohm} onZmiana={(v) => zmien('r_ohm', v)} krok={0.01} wymagane blad={bladDlaPola('r_ohm')} testid="mvd-kreator-zrodlo-rohm" />
                    <PoleLiczbowe etykieta={T.xOhm} jednostka="Ω" wartosc={dane.x_ohm} onZmiana={(v) => zmien('x_ohm', v)} krok={0.01} wymagane blad={bladDlaPola('x_ohm')} testid="mvd-kreator-zrodlo-xohm" />
                  </>
                ) : (
                  <>
                    <PoleLiczbowe etykieta={T.sk3} jednostka="MVA" wartosc={dane.sk3_mva} onZmiana={(v) => zmien('sk3_mva', v)} pomoc={T.sk3Pomoc} wymagane blad={bladDlaPola('sk3_mva')} testid="mvd-kreator-zrodlo-sk3" />
                    <PoleLiczbowe etykieta={T.rx} wartosc={dane.rx_ratio} onZmiana={(v) => zmien('rx_ratio', v)} krok={0.01} pomoc={T.rxPomoc} wymagane blad={bladDlaPola('rx_ratio')} testid="mvd-kreator-zrodlo-rx" />
                  </>
                )}
              </KreatorSiatka>

              {/* CV-4.3 K7c: napięcie zadane szyny bilansującej — WSPÓLNE dla obu stron
                  (SN/110 kV) i obu postaci (moc zwarciowa/impedancja); backend czyta je
                  bezwarunkowo w `_resolve_manual_source_equivalent` (przed rozgałęzieniem
                  na tryb), więc pole renderuje się niezależnie od `hv`/`impedancja`. Puste
                  = znamionowe (1,0 p.u.) — zero fabrykacji. */}
              <PoleLiczbowe
                etykieta={T.uSetPu}
                jednostka="pu"
                wartosc={dane.u_set_pu}
                onZmiana={(v) => zmien('u_set_pu', v)}
                krok={0.01}
                min={0.8}
                max={1.2}
                pomoc={T.uSetPuPomoc}
                blad={bladDlaPola('u_set_pu')}
                testid="mvd-kreator-zrodlo-uset"
              />

              {/* CV-4.3 K7: scenariusz MIN — TYLKO w trybie mocy zwarciowej (impedancja
                  jawna nie ma wariantu MIN, IEC 60909-0 §6.2.1: c_min tylko przy S''_kQ).
                  Pola opcjonalne (zero fabrykacji) — puste = MIN liczony z danych MAX. */}
              {!impedancja ? (
                <div data-testid="mvd-kreator-zrodlo-min">
                  <KreatorInfo testid="mvd-kreator-zrodlo-min-info">
                    <strong>{T.zwarcieMinTytul}.</strong> {T.zwarcieMinOpis}
                  </KreatorInfo>
                  <KreatorSiatka kolumny={3}>
                    <PoleLiczbowe
                      etykieta={T.sk3Min}
                      jednostka="MVA"
                      wartosc={dane.sk3_min_mva}
                      onZmiana={(v) => zmien('sk3_min_mva', v)}
                      pomoc={T.sk3MinPomoc}
                      blad={bladDlaPola('sk3_min_mva')}
                      testid="mvd-kreator-zrodlo-sk3min"
                    />
                    <PoleLiczbowe
                      etykieta={T.ik3Min}
                      jednostka="kA"
                      wartosc={dane.ik3_min_ka}
                      onZmiana={(v) => zmien('ik3_min_ka', v)}
                      pomoc={T.ik3MinPomoc}
                      blad={bladDlaPola('ik3_min_ka')}
                      testid="mvd-kreator-zrodlo-ik3min"
                    />
                    <PoleLiczbowe
                      etykieta={T.rxMin}
                      wartosc={dane.rx_ratio_min}
                      onZmiana={(v) => zmien('rx_ratio_min', v)}
                      krok={0.01}
                      pomoc={T.rxMinPomoc}
                      blad={bladDlaPola('rx_ratio_min')}
                      testid="mvd-kreator-zrodlo-rxmin"
                    />
                  </KreatorSiatka>
                </div>
              ) : null}
            </KreatorSekcja>
          )}

          <KreatorSekcja tytul={T.zeroTytul} testid="mvd-kreator-zrodlo-zero">
            <PolePrzelacznikBinarny
              etykieta={T.zeroToggle}
              wlaczone={dane.zero_sequence_enabled}
              onZmiana={(v) => zmien('zero_sequence_enabled', v)}
              testid="mvd-kreator-zrodlo-zero-toggle"
            />
            <KreatorSiatka kolumny={3}>
              <PoleLiczbowe etykieta={T.r0} jednostka="Ω" wartosc={dane.r0_ohm} onZmiana={(v) => zmien('r0_ohm', v)} wylaczone={!dane.zero_sequence_enabled} blad={bladDlaPola('r0_ohm')} testid="mvd-kreator-zrodlo-r0" />
              <PoleLiczbowe etykieta={T.x0} jednostka="Ω" wartosc={dane.x0_ohm} onZmiana={(v) => zmien('x0_ohm', v)} wylaczone={!dane.zero_sequence_enabled} blad={bladDlaPola('x0_ohm')} testid="mvd-kreator-zrodlo-x0" />
              <PoleLiczbowe etykieta={T.z0z1} wartosc={dane.z0_z1_ratio} onZmiana={(v) => zmien('z0_z1_ratio', v)} krok={0.1} wylaczone={!dane.zero_sequence_enabled} blad={bladDlaPola('z0_z1_ratio')} testid="mvd-kreator-zrodlo-z0z1" />
            </KreatorSiatka>
          </KreatorSekcja>
          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-zrodlo-teoria"
          >
            <figure className="mvd-wykres-fig">
              <WykresSztywnosci />
              <figcaption className="mvd-wykres-cap"><TekstZWzorami tekst={T.teoriaJakCzytac} /></figcaption>
            </figure>
          </PanelTeorii>
        </>
      ) : null}

      {krok === 'transformatory' ? (
        <>
        <KreatorSekcja tytul={T.krokTransformatory} testid="mvd-kreator-zrodlo-transformatory">
          <KreatorInfo>{T.transformatoryOpis}</KreatorInfo>
          <PoleWyboru
            etykieta={T.liczbaTrafo}
            wartosc={String(dane.transformer_count)}
            onZmiana={(v) => zmien('transformer_count', Number(v))}
            opcje={T.liczby1do4}
            blad={bladDlaPola('transformer_count')}
            testid="mvd-kreator-zrodlo-liczba-trafo"
          />
          <PoleKatalogu
            etykieta={T.transformatorKatalog}
            wartosc={dane.transformer_catalog_ref}
            onZmiana={wybierzTransformator}
            opcje={opcjeTransformatorow}
            status={bladTransformatorow ? 'error' : 'ready'}
            placeholder={T.transformatorPlaceholder}
            komunikatBledu={bladTransformatorow ?? T.transformatorBlad}
            wymagane
            blad={bladDlaPola('transformer_catalog_ref')}
            testid="mvd-kreator-zrodlo-transformator-katalog"
          />
          {dane.transformer_catalog_ref ? (
            <KreatorSiatka kolumny={3}>
              <RzadWartosci etykieta={T.transformatorSn} wartosc={dane.transformer_sn_mva != null ? `${dane.transformer_sn_mva} MVA` : '—'} />
              <RzadWartosci etykieta={T.transformatorUk} wartosc={dane.transformer_uk_percent != null ? `${dane.transformer_uk_percent} %` : '—'} />
              <RzadWartosci etykieta={T.transformatorGrupa} wartosc={dane.transformer_vector_group ?? '—'} />
            </KreatorSiatka>
          ) : null}
        </KreatorSekcja>

        <KreatorSekcja tytul={T.oltcTytul} testid="mvd-kreator-zrodlo-oltc">
          <KreatorInfo>{T.oltcOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.oltcTyp}
              wartosc={dane.oltc_regulation_type}
              onZmiana={(v) => zmien('oltc_regulation_type', v as GridSourceFormData['oltc_regulation_type'])}
              opcje={T.oltcTypy}
              testid="mvd-kreator-zrodlo-oltc-typ"
            />
            {dane.oltc_regulation_type !== 'NONE' ? (
              <PoleKatalogu
                etykieta={T.oltcKatalog}
                wartosc={dane.oltc_tap_changer_catalog_ref}
                onZmiana={wybierzTapChanger}
                opcje={opcjeTapChangerow}
                status={bladTapChangerow ? 'error' : 'ready'}
                placeholder={T.oltcKatalogPlaceholder}
                komunikatBledu={bladTapChangerow ?? T.oltcKatalogBlad}
                testid="mvd-kreator-zrodlo-oltc-katalog"
              />
            ) : null}
          </KreatorSiatka>

          {dane.oltc_regulation_type !== 'NONE' ? (
            <>
              <KreatorSiatka kolumny={3}>
                <PoleWyboru
                  etykieta={T.oltcUzwojenie}
                  wartosc={dane.oltc_regulated_winding ?? ''}
                  onZmiana={(v) => zmien('oltc_regulated_winding', (v || null) as GridSourceFormData['oltc_regulated_winding'])}
                  opcje={[{ id: '', etykieta: T.wybierz }, ...T.oltcUzwojenia]}
                  wymagane
                  testid="mvd-kreator-zrodlo-oltc-uzwojenie"
                />
                <PoleLiczbowe etykieta={T.oltcKrok} jednostka="%" wartosc={dane.oltc_step_percent} onZmiana={(v) => zmien('oltc_step_percent', v)} krok={0.05} wymagane blad={bladDlaPola('oltc_step_percent')} testid="mvd-kreator-zrodlo-oltc-krok" />
                <PoleLiczbowe etykieta={T.oltcNeutral} wartosc={dane.oltc_neutral_position} onZmiana={(v) => zmien('oltc_neutral_position', v)} blad={bladDlaPola('oltc_neutral_position')} testid="mvd-kreator-zrodlo-oltc-neutral" />
                <PoleLiczbowe etykieta={T.oltcMin} wartosc={dane.oltc_min_position} onZmiana={(v) => zmien('oltc_min_position', v)} blad={bladDlaPola('oltc_min_position')} testid="mvd-kreator-zrodlo-oltc-min" />
                <PoleLiczbowe etykieta={T.oltcBiezaca} wartosc={dane.oltc_current_position} onZmiana={(v) => zmien('oltc_current_position', v)} blad={bladDlaPola('oltc_current_position')} testid="mvd-kreator-zrodlo-oltc-biezaca" />
                <PoleLiczbowe etykieta={T.oltcMax} wartosc={dane.oltc_max_position} onZmiana={(v) => zmien('oltc_max_position', v)} blad={bladDlaPola('oltc_max_position')} testid="mvd-kreator-zrodlo-oltc-max" />
              </KreatorSiatka>

              {dane.oltc_regulation_type === 'OLTC' ? (
                <>
                  <PoleWyboru
                    etykieta={T.oltcTryb}
                    wartosc={dane.oltc_control_mode ?? ''}
                    onZmiana={(v) => zmien('oltc_control_mode', (v || null) as GridSourceFormData['oltc_control_mode'])}
                    opcje={[{ id: '', etykieta: T.wybierz }, ...T.oltcTryby]}
                    wymagane
                    pomoc={T.oltcTrybAutoInfo}
                    testid="mvd-kreator-zrodlo-oltc-tryb"
                  />
                  <KreatorSiatka kolumny={3}>
                    <PoleLiczbowe etykieta={T.oltcSetpoint} jednostka="kV" wartosc={dane.oltc_voltage_setpoint_kv} onZmiana={(v) => zmien('oltc_voltage_setpoint_kv', v)} krok={0.1} wymagane blad={bladDlaPola('oltc_voltage_setpoint_kv')} testid="mvd-kreator-zrodlo-oltc-setpoint" />
                    <PoleLiczbowe etykieta={T.oltcDeadband} jednostka="kV" wartosc={dane.oltc_deadband_kv} onZmiana={(v) => zmien('oltc_deadband_kv', v)} krok={0.05} blad={bladDlaPola('oltc_deadband_kv')} testid="mvd-kreator-zrodlo-oltc-deadband" />
                    <PoleLiczbowe etykieta={T.oltcOpoznienie} jednostka="s" wartosc={dane.oltc_delay_seconds} onZmiana={(v) => zmien('oltc_delay_seconds', v)} krok={1} testid="mvd-kreator-zrodlo-oltc-opoznienie" />
                  </KreatorSiatka>
                  <PolePrzelacznikBinarny
                    etykieta={T.oltcLdc}
                    wlaczone={dane.oltc_ldc_enabled}
                    onZmiana={(v) => zmien('oltc_ldc_enabled', v)}
                    testid="mvd-kreator-zrodlo-oltc-ldc"
                  />
                  {dane.oltc_ldc_enabled ? (
                    <KreatorSiatka kolumny={2}>
                      <PoleLiczbowe etykieta={T.oltcLdcR} jednostka="Ω" wartosc={dane.oltc_ldc_r_ohm} onZmiana={(v) => zmien('oltc_ldc_r_ohm', v)} krok={0.1} blad={bladDlaPola('oltc_ldc_r_ohm')} testid="mvd-kreator-zrodlo-oltc-ldc-r" />
                      <PoleLiczbowe etykieta={T.oltcLdcX} jednostka="Ω" wartosc={dane.oltc_ldc_x_ohm} onZmiana={(v) => zmien('oltc_ldc_x_ohm', v)} krok={0.1} blad={bladDlaPola('oltc_ldc_x_ohm')} testid="mvd-kreator-zrodlo-oltc-ldc-x" />
                    </KreatorSiatka>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </KreatorSekcja>
        </>
      ) : null}

      {krok === 'rozdzielnia' ? (
        <KreatorSekcja tytul={T.krokRozdzielnia} testid="mvd-kreator-zrodlo-rozdzielnia">
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.liczbaSekcji}
              wartosc={String(dane.sections_count)}
              onZmiana={(v) => ustawLiczbeSekcji(Number(v))}
              opcje={T.liczby1do4}
              blad={bladDlaPola('sections_count')}
              testid="mvd-kreator-zrodlo-liczba-sekcji"
            />
            <PoleWyboru
              etykieta={T.uziemienie}
              wartosc={dane.grounding_type ?? ''}
              onZmiana={(v) => zmien('grounding_type', (v || null) as TypPunktuNeutralnego | null)}
              opcje={[{ id: '', etykieta: T.wybierz }, ...T.typyUziemienia]}
              pomoc={opisUziemienia(dane.grounding_type)}
              wymagane
              testid="mvd-kreator-zrodlo-uziemienie"
            />
          </KreatorSiatka>
          {(dane.grounding_type === 'resistor_grounded' || dane.grounding_type === 'petersen_coil') ? (
            <PoleLiczbowe
              etykieta={dane.grounding_type === 'petersen_coil' ? T.uziemienieX : T.uziemienieR}
              jednostka="Ω"
              wartosc={dane.grounding_type === 'petersen_coil' ? dane.grounding_x_ohm : dane.grounding_r_ohm}
              onZmiana={(v) => zmien(dane.grounding_type === 'petersen_coil' ? 'grounding_x_ohm' : 'grounding_r_ohm', v)}
              blad={bladDlaPola(dane.grounding_type === 'petersen_coil' ? 'grounding_x_ohm' : 'grounding_r_ohm')}
              wymagane
              testid="mvd-kreator-zrodlo-uziemienie-ohm"
            />
          ) : null}
          <KreatorInfo>{T.sprzegloNota}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'sekcje' ? (
        <>
          <KreatorSekcja tytul={T.rodzinaTytul} testid="mvd-kreator-zrodlo-rodzina">
            <KreatorInfo>{T.rodzinaOpis}</KreatorInfo>
            <PoleWyboru
              etykieta={T.rodzinaPole}
              wartosc={dane.switchgear_family_ref ?? ''}
              onZmiana={(v) => wybierzRodzine(v || null)}
              opcje={[{ id: '', etykieta: T.rodzinaPlaceholder }, ...opcjeRodzin]}
              blad={bladRodzin ?? undefined}
              testid="mvd-kreator-zrodlo-rodzina-select"
            />
          </KreatorSekcja>

          <KreatorSekcja tytul={T.krokSekcje} testid="mvd-kreator-zrodlo-sekcje">
            <KreatorInfo>{T.sekcjeOpis}</KreatorInfo>
            {normalizujSekcje(dane.sekcje, dane.sections_count, dane.line_fields_per_section).map((sekcja, index) => (
              <div key={index}>
                <KreatorSiatka kolumny={2}>
                  <PoleTekstowe
                    etykieta={`${T.sekcjaNazwaPol} ${index + 1}`}
                    wartosc={sekcja.nazwa}
                    onZmiana={(v) => zmienSekcje(index, { nazwa: v })}
                    testid={`mvd-kreator-zrodlo-sekcja-nazwa-${index}`}
                  />
                  <PoleLiczbowe
                    etykieta={T.sekcjaLiczbaPol}
                    wartosc={sekcja.liczbaPol}
                    onZmiana={(v) => zmienSekcje(index, { liczbaPol: Math.max(1, Math.min(MAX_POL_NA_SEKCJE, v ?? 1)) })}
                    min={1}
                    krok={1}
                    testid={`mvd-kreator-zrodlo-sekcja-pola-${index}`}
                  />
                </KreatorSiatka>
                {dane.switchgear_family_ref ? (
                  <PoleWyboru
                    etykieta={T.sekcjaSzablon}
                    wartosc={sekcja.bayTemplateRef ?? ''}
                    onZmiana={(v) => zmienSekcje(index, { bayTemplateRef: v || null })}
                    opcje={[{ id: '', etykieta: T.sekcjaSzablonPlaceholder }, ...opcjeSzablonow]}
                    pomoc={T.sekcjaSzablonPomoc}
                    testid={`mvd-kreator-zrodlo-sekcja-szablon-${index}`}
                  />
                ) : null}
              </div>
            ))}
            <KreatorSiatka kolumny={2}>
              <PoleWyboru
                etykieta={T.aparatRodzaj}
                wartosc={dane.gpz_line_field_apparatus_kind}
                onZmiana={(v) => {
                  zmien('gpz_line_field_apparatus_kind', v as GpzLineFieldApparatusKind);
                  setDane((p) => ({ ...p, gpz_line_field_apparatus_catalog_ref: null }));
                }}
                opcje={T.rodzajeAparatu}
                testid="mvd-kreator-zrodlo-aparat-rodzaj"
              />
              <PoleKatalogu
                etykieta={T.aparatSekcja}
                wartosc={dane.gpz_line_field_apparatus_catalog_ref}
                onZmiana={(v) => zmien('gpz_line_field_apparatus_catalog_ref', v)}
                opcje={opcjeAparatow}
                status={bladAparatow ? 'error' : 'ready'}
                placeholder={T.aparatPlaceholder}
                komunikatBledu={bladAparatow ?? T.aparatBlad}
                wymagane
                blad={bladDlaPola('gpz_line_field_apparatus_catalog_ref')}
                testid="mvd-kreator-zrodlo-aparat-katalog"
              />
            </KreatorSiatka>
          </KreatorSekcja>

          <KreatorSekcja tytul={T.zabezpieczenieTytul} testid="mvd-kreator-zrodlo-zabezpieczenie">
            <KreatorInfo>{T.zabezpieczenieOpis}</KreatorInfo>
          </KreatorSekcja>
        </>
      ) : null}

      {krok === 'normy' ? (
        <KreatorSekcja tytul={T.normyTytul} testid="mvd-kreator-zrodlo-normy">
          <PoleLiczbowe
            etykieta={T.czasCieplny}
            jednostka="s"
            wartosc={dane.thermal_time_s}
            onZmiana={(v) => zmien('thermal_time_s', v)}
            krok={0.1}
            min={0.1}
            pomoc={T.czasCieplnyPomoc}
            blad={bladDlaPola('thermal_time_s')}
            testid="mvd-kreator-zrodlo-tk"
          />
          <RzadWartosci etykieta={T.norma} wartosc="IEC 60909:2016" />
          <RzadWartosci etykieta={T.czestotliwosc} wartosc="50 Hz" />
          <RzadWartosci etykieta={`${T.cMax} / ${T.cMin}`} wartosc="1,10 / 1,00" />
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.przegladTytul} testid="mvd-kreator-zrodlo-przeglad">
          <KreatorInfo>{T.przegladOpis}</KreatorInfo>
          <RzadWartosci etykieta={T.nazwa} wartosc={dane.source_name || '—'} />
          <RzadWartosci etykieta={T.napiecieSn} wartosc={dane.sn_voltage_kv !== null ? `${formatujLiczbe(dane.sn_voltage_kv, 0)} kV` : '—'} />
          <RzadWartosci etykieta={T.trybZrodlaTytul} wartosc={dane.manual_mode ? T.trybReczny : T.trybKatalog} />
          <RzadWartosci etykieta={T.liczbaSekcji} wartosc={String(dane.sections_count)} />
          <RzadWartosci etykieta={T.liczbaTrafo} wartosc={String(dane.transformer_count)} />
          <RzadWartosci etykieta={T.uziemienie} wartosc={T.typyUziemienia.find((o) => o.id === dane.grounding_type)?.etykieta ?? '—'} />
          <KreatorNastepnyKrok opis={T.nastepnyOpis} testid="mvd-kreator-zrodlo-nastepny" />
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}

export default KreatorZrodloZasilania;
