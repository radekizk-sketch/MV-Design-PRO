/**
 * KARTA W5-C — edytor wyposażenia pola SN (karta pola, ekran E-11).
 *
 * Jedyny dostawca operacji `set_bay_equipment` w interfejsie. Trzy tryby = trzy tryby
 * operacji: „z katalogu" (aparaty z pozycją katalogową — stan MODEL), „z szablonu pola"
 * (aparaty z szablonu — PROPOZYCJA, dane przyjęte z jakością szacowaną, albo MODEL, gdy
 * szablon jest polem katalogowym rodziny z BOM-em), „usuń wyposażenie" (BRAK_DANYCH).
 * Stan danych i dane przyjęte pokazuje z modelu odczytu pola (`equipment_data_state`,
 * `equipment_assumed_data`), a po zapisie — z odpowiedzi operacji (`wyposazenie_pola`).
 * Każda kontrolka mapuje na pole ładunku operacji; reguły doboru ocenia backend, odmowa
 * wraca tu zdaniem z kodem. ZERO fizyki i zero domysłu w UI.
 *
 * Katalog aparatów i szablonów pobierany dopiero po otwarciu edycji („Zmień wyposażenie") —
 * sama karta pola nie odpytuje katalogu, gdy pole nie ma z nim powiązania.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  Bay,
  DanaPrzyjetaWyposazenia,
  EnergyNetworkModel,
  StanDanychWyposazenia,
  WyposazeniePolaOdpowiedz,
} from '../../types/enm';
import { ETYKIETA_PL_ROLI_UZIEMNIKA, ROLE_UZIEMNIKA, type RolaUziemnika } from '../../types/uziemienie';
import {
  fetchCompleteBayTemplates,
  fetchCtTypes,
  fetchSzablonyPolaKanoniczne,
  fetchMvApparatusTypes,
  fetchSurgeArresterTypes,
  fetchVtTypes,
  getCatalogErrorMessage,
  NAZWA_WERYFIKACJI_PL,
  type SzablonPolaKanoniczny,
} from '../catalog/api';
import type { CompleteMvBayTemplateSummary } from '../catalog/BayTemplatePicker';
import { nazwaMediumPl, notaPozycjiUkrytych, pozycjeDoWyboru } from '../catalog/dopuszczenieNowychPol';
import type { CatalogType, MVApparatusType } from '../catalog/types';
import { czyLacznik } from '../shared/stanLacznika';
import {
  BEZ_ZMIANY_KLASY,
  BEZ_ZMIANY_ZRODLA_U0,
  czyWierszKompletny,
  KLASY_POLA_LINIOWEGO,
  NAZWA_KLASY_POLA_PL,
  NAZWA_RODZAJU_APARATU_PL,
  PRZESTRZEN_KATALOGU_APARATU,
  RODZAJE_APARATU_POLA_SN,
  RODZAJE_KATALOGOWE_APARATU,
  RODZAJ_Z_PRZEKLADNIA,
  RODZAJ_Z_WYKONANIEM,
  RODZAJE_Z_GALEZIA,
  RODZAJE_Z_ROLA_UZIEMIENIA,
  STAN_DANYCH_WYPOSAZENIA_PL,
  UMIEJSCOWIENIA,
  UMIEJSCOWIENIE_PL,
  WIERSZ_PUSTY,
  wierszeZAparatow,
  zbudujPayloadWyposazenia,
  zmienRodzaj,
  type PrzestrzenKatalogu,
  type RodzajAparatuPolaSn,
  type TrybWyposazenia,
  type WierszAparatu,
  type ZmianaKlasyPola,
  type ZmianaZrodlaU0,
} from './wyposazeniePola';
import type { ZrodloU0Pola } from './useFieldReadModel';
import { OPIS_WYKONANIA_APARATU_PL, WYKONANIA_APARATU, type DomainOpResponseV1, type KlasaPolaLiniowego, type WykonanieAparatu } from '../../types/enm';

interface PozycjeKatalogu {
  readonly APARAT_SN: readonly MVApparatusType[];
  readonly CT: readonly CatalogType[];
  readonly VT: readonly CatalogType[];
  readonly OGRANICZNIK_SN: readonly CatalogType[];
}

const KATALOG_PUSTY: PozycjeKatalogu = { APARAT_SN: [], CT: [], VT: [], OGRANICZNIK_SN: [] };

const TRYBY: ReadonlyArray<{ id: TrybWyposazenia; etykieta: string }> = [
  { id: 'katalog', etykieta: 'Z katalogu aparatów' },
  { id: 'szablon', etykieta: 'Z szablonu pola' },
  { id: 'wyczysc', etykieta: 'Usuń wyposażenie' },
];

export interface EdytorWyposazeniaPolaProps {
  readonly bay: Bay;
  readonly snapshot: EnergyNetworkModel | null;
  readonly stanDanych: StanDanychWyposazenia | null;
  readonly danePrzyjete: readonly DanaPrzyjetaWyposazenia[];
  readonly activeCaseId: string | null;
  readonly executeDomainOperation: (
    caseId: string,
    opName: string,
    payload: Record<string, unknown>,
  ) => Promise<DomainOpResponseV1 | null>;
  readonly bladStore?: () => string | null;
  /** Źródło napięcia zerowego 3U₀ pola z modelu odczytu (`field-view` → `zrodlo_u0`): kandydaci
   *  i rozstrzygnięcie powiązania liczone w backendzie. `null` — szablon pola nie niesie funkcji
   *  warunkowej 67N (kontrolka powiązania niewidoczna). */
  readonly zrodloU0?: ZrodloU0Pola | null;
}

/**
 * Pozycje katalogu dla wiersza. Filtr gazu fluorowanego jest BACKENDU
 * (`dopuszczony_do_nowych_pol` pozycji, ta sama reguła co strażnik operacji): aparat, który po
 * zapisie będzie projektowany (każdy wiersz bez jawnego stanu „istniejący" — nowy albo
 * wymieniony), widzi wyłącznie pozycje dopuszczone. Wiersz inwentaryzacji aparatu zastanego
 * (`stan_obiektu === 'ISTNIEJACY'`) widzi wszystkie, z medium w etykiecie. Pozycja już wybrana
 * zostaje na liście (rekord niezmieniony nie znika z widoku).
 */
function pozycjeDlaWiersza(
  katalog: PozycjeKatalogu,
  kind: RodzajAparatuPolaSn,
  wiersz: Pick<WierszAparatu, 'stan_obiektu' | 'catalog_ref'> = { stan_obiektu: '', catalog_ref: '' },
): readonly CatalogType[] {
  const przestrzen: PrzestrzenKatalogu | null = PRZESTRZEN_KATALOGU_APARATU[kind];
  if (przestrzen === null) return [];
  if (przestrzen !== 'APARAT_SN') return katalog[przestrzen];
  const dozwolone = RODZAJE_KATALOGOWE_APARATU[kind] ?? [];
  return pozycjeDoWyboru(
    katalog.APARAT_SN.filter((p) => dozwolone.includes(p.device_kind)),
    wiersz.stan_obiektu === 'ISTNIEJACY' ? 'ISTNIEJACY' : 'PROJEKTOWANY',
    wiersz.catalog_ref,
  );
}

/** Etykieta pozycji aparatu: nazwa + medium (medium widoczne zawsze, gdy karta je podaje). */
function etykietaPozycji(p: CatalogType): string {
  const medium = nazwaMediumPl((p as MVApparatusType).medium);
  return medium ? `${p.name} · ${medium}` : p.name;
}

function wierszeStartowe(bay: Bay): WierszAparatu[] {
  const z = wierszeZAparatow(bay.primary_devices);
  return z.length > 0 ? z : [{ ...WIERSZ_PUSTY }];
}

/**
 * Dane przyjęte wyposażenia — ZASADA NR 4 pkt 4: źródło wartości roboczej podane dyskretnie,
 * JEDNĄ adnotacją na wspólny powód i jakość (pomiar 2026-10-29: zdanie „rodzaj aparatu bez
 * katalogu SN — przyjęty z szablonu pola…" powtarzało się przy każdym z dziesięciu aparatów).
 * Grupy w kolejności pierwszego wystąpienia, aparaty w kolejności pola — każdy rekord
 * `dane_przyjete` backendu jest nadal wymieniony z nazwy, nic nie znika.
 */
export function grupyDanychPrzyjetych(
  dane: readonly DanaPrzyjetaWyposazenia[],
): readonly { readonly powod_pl: string; readonly jakosc: string; readonly nazwy: readonly string[] }[] {
  const grupy = new Map<string, { powod_pl: string; jakosc: string; nazwy: string[] }>();
  for (const d of dane) {
    const klucz = `${d.jakosc}\u0000${d.powod_pl}`;
    const grupa = grupy.get(klucz) ?? { powod_pl: d.powod_pl, jakosc: d.jakosc, nazwy: [] };
    grupa.nazwy.push(d.nazwa_pl);
    grupy.set(klucz, grupa);
  }
  return [...grupy.values()];
}

function ListaDanychPrzyjetych({ dane, testid }: { dane: readonly DanaPrzyjetaWyposazenia[]; testid: string }) {
  if (dane.length === 0) return null;
  return (
    <ul data-testid={testid} className="mt-1 list-none pl-0 text-[11px] text-scada-muted">
      {grupyDanychPrzyjetych(dane).map((g) => (
        <li key={`${g.jakosc}:${g.powod_pl}`} data-testid={`${testid}-grupa`}>
          <span className="text-scada-text">{g.nazwy.join(', ')}</span>
          {' — '}
          {g.powod_pl} (jakość: {g.jakosc === 'ESTIMATED' ? 'szacowana' : g.jakosc})
        </li>
      ))}
    </ul>
  );
}

export function EdytorWyposazeniaPola({
  bay,
  snapshot,
  stanDanych,
  danePrzyjete,
  activeCaseId,
  executeDomainOperation,
  bladStore,
  zrodloU0 = null,
}: EdytorWyposazeniaPolaProps): JSX.Element {
  const [tryb, setTryb] = useState<TrybWyposazenia>('katalog');
  const [wiersze, setWiersze] = useState<WierszAparatu[]>(() => wierszeStartowe(bay));
  const [szablonRef, setSzablonRef] = useState('');
  const [katalog, setKatalog] = useState<PozycjeKatalogu>(KATALOG_PUSTY);
  const [szablony, setSzablony] = useState<readonly CompleteMvBayTemplateSummary[]>([]);
  const [kanoniczne, setKanoniczne] = useState<readonly SzablonPolaKanoniczny[]>([]);
  const [klasa, setKlasa] = useState<ZmianaKlasyPola>(BEZ_ZMIANY_KLASY);
  const [zmianaZrodlaU0, setZmianaZrodlaU0] = useState<ZmianaZrodlaU0>(BEZ_ZMIANY_ZRODLA_U0);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [wynik, setWynik] = useState<WyposazeniePolaOdpowiedz | null>(null);
  const [zapis, setZapis] = useState(false);
  const [otwarty, setOtwarty] = useState(false);

  // Klasa pola po zapisie (zmiana z formularza albo klasa rekordu) — wejście oceny szablonów.
  const klasaPo = klasa.zmien ? klasa.wartosc : (bay.klasa_pola ?? null);
  // Powiązanie źródła 3U₀ po zapisie (zmiana z formularza albo powiązanie rekordu).
  const zrodloU0Po = zmianaZrodlaU0.zmien ? zmianaZrodlaU0.wartosc : (bay.zrodlo_u0_ref ?? null);

  // Szablony kanoniczne z oceną dopuszczalności W TYM POLU (rola, pole GPZ, rodzina rozdzielnicy,
  // klasa) — filtr i powody odmowy liczy backend tą samą regułą co strażnik operacji.
  useEffect(() => {
    if (!otwarty) return undefined;
    let anulowane = false;
    fetchSzablonyPolaKanoniczne({
      bayRole: bay.bay_role,
      poleGpz: Boolean(bay.gpz_section_id),
      switchgearFamilyRef: bay.switchgear_family_ref ?? null,
      klasaPola: klasaPo,
    })
      .then((lista) => {
        if (!anulowane) setKanoniczne(lista);
      })
      .catch((e: unknown) => {
        if (!anulowane) setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      anulowane = true;
    };
  }, [otwarty, bay.bay_role, bay.gpz_section_id, bay.switchgear_family_ref, klasaPo]);

  useEffect(() => {
    if (!otwarty) return undefined;
    let anulowane = false;
    Promise.all([
      fetchMvApparatusTypes(),
      fetchCtTypes(),
      fetchVtTypes(),
      fetchSurgeArresterTypes(),
      fetchCompleteBayTemplates(),
    ])
      .then(([aparaty, ct, vt, ograniczniki, pola]) => {
        if (anulowane) return;
        setKatalog({ APARAT_SN: aparaty, CT: ct, VT: vt, OGRANICZNIK_SN: ograniczniki });
        setSzablony(pola);
      })
      .catch((e: unknown) => {
        if (!anulowane) setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      anulowane = true;
    };
  }, [otwarty]);

  // Łącznik aparatu pola to gałąź łącznikowa TEGO pola (`Bay.equipment_refs`).
  const lacznikiPola = useMemo(() => {
    const galezie = new Map((snapshot?.branches ?? []).map((b) => [b.ref_id, b]));
    return (bay.equipment_refs ?? [])
      .map((ref) => galezie.get(ref))
      .filter(czyLacznik)
      .sort((a, b) => (a.ref_id < b.ref_id ? -1 : 1));
  }, [bay.equipment_refs, snapshot]);

  // Szablony pola tej samej funkcji (rola pola w modelu) — inne backend odrzuca. Szablony
  // producenckie (pola rodzin) i kanoniczne dopuszczone w tym polu; szablon kanoniczny
  // niedopuszczony nie jest opcją wyboru — jego powód odmowy widać pod listą.
  const szablonyPola = useMemo(() => {
    const producenckie = szablony.filter((s) => s.bay_role === bay.bay_role);
    const znane = new Set(producenckie.map((s) => s.template_ref));
    return [
      ...producenckie.map((s) => ({ ref: s.template_ref, etykieta: s.template_name_pl ?? s.template_ref })),
      ...kanoniczne
        .filter((s) => s.dopuszczony && !znane.has(s.template_ref))
        .map((s) => ({ ref: s.template_ref, etykieta: s.template_name_pl })),
    ];
  }, [bay.bay_role, kanoniczne, szablony]);
  const niedopuszczone = useMemo(() => kanoniczne.filter((s) => !s.dopuszczony), [kanoniczne]);
  // Klasa pola liniowego dotyczy pola GPZ funkcji, dla której backend ma szablon pola liniowego
  // (oś `wykonanie_pola`, ENEA Z.10/Z.11.1/Z.11) — rola z listy szablonów, nie z tablicy frontu.
  const polePozwalaNaKlase =
    Boolean(bay.gpz_section_id) && (kanoniczne.some((s) => s.wykonanie_pola !== null) || bay.klasa_pola != null);
  const wybranyKanoniczny = useMemo(
    () => kanoniczne.find((s) => s.template_ref === szablonRef) ?? null,
    [kanoniczne, szablonRef],
  );

  const zmienWiersz = useCallback((indeks: number, zmiana: (w: WierszAparatu) => WierszAparatu) => {
    setWiersze((p) => p.map((w, i) => (i === indeks ? zmiana(w) : w)));
  }, []);

  const gotowy =
    activeCaseId !== null && !zapis && (tryb !== 'katalog' || (wiersze.length > 0 && wiersze.every(czyWierszKompletny)));

  const onZapisz = useCallback(async () => {
    if (!activeCaseId) return;
    setZapis(true);
    setBlad(null);
    setWynik(null);
    try {
      const odpowiedz = await executeDomainOperation(
        activeCaseId,
        'set_bay_equipment',
        zbudujPayloadWyposazenia(bay.ref_id, tryb, wiersze, szablonRef, klasa, zmianaZrodlaU0),
      );
      if (!odpowiedz) {
        setBlad(bladStore?.() ?? 'Nie udało się zapisać wyposażenia pola.');
        return;
      }
      if (odpowiedz.error) {
        setBlad(odpowiedz.error);
        return;
      }
      setWynik(odpowiedz.wyposazenie_pola ?? null);
      setOtwarty(false);
    } finally {
      setZapis(false);
    }
  }, [activeCaseId, bay.ref_id, bladStore, executeDomainOperation, klasa, szablonRef, tryb, wiersze, zmianaZrodlaU0]);

  const pole = 'rounded border border-scada-border bg-white px-1.5 py-1 text-xs';

  return (
    <section data-testid="wyposazenie-pola" className="border-t border-scada-border p-3 text-xs">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
        Wyposażenie pola (aparaty pierwotne)
      </h3>
      <p data-testid="wyposazenie-pola-stan" data-stan={stanDanych ?? ''} className="mt-1 text-scada-text">
        {stanDanych ? STAN_DANYCH_WYPOSAZENIA_PL[stanDanych] : 'Stan danych wyposażenia nieznany — brak modelu odczytu pola.'}
      </p>
      {/* Jedna lista danych przyjętych naraz: po zapisie — lista z odpowiedzi operacji (stan po
          zapisie), przed zapisem — z odczytu pola. Obie naraz powtarzały te same adnotacje
          (pomiar ze zrzutu okna pola 2026-10-29). */}
      {wynik ? null : <ListaDanychPrzyjetych dane={danePrzyjete} testid="wyposazenie-pola-dane-przyjete" />}
      {wynik ? (
        <div data-testid="wyposazenie-pola-wynik" data-stan={wynik.stan_danych} className="mt-1">
          <p>Zapisano. {STAN_DANYCH_WYPOSAZENIA_PL[wynik.stan_danych]}.</p>
          <ListaDanychPrzyjetych dane={wynik.dane_przyjete} testid="wyposazenie-pola-wynik-dane-przyjete" />
        </div>
      ) : null}

      {!otwarty ? (
        <button
          type="button"
          data-testid="wyposazenie-pola-edytuj"
          className="mt-2 rounded border border-scada-accent px-2 py-1 text-scada-accent"
          onClick={() => {
            // Każde otwarcie startuje od BIEŻĄCEGO rekordu pola (po zapisie migawka niesie
            // nowe aparaty) — nigdy od wierszy poprzedniej, zamkniętej edycji.
            setWiersze(wierszeStartowe(bay));
            setTryb('katalog');
            setSzablonRef('');
            setKlasa(BEZ_ZMIANY_KLASY);
            setZmianaZrodlaU0(BEZ_ZMIANY_ZRODLA_U0);
            setBlad(null);
            setOtwarty(true);
          }}
        >
          Zmień wyposażenie
        </button>
      ) : (
        <>
          <label className="mt-2 flex items-center gap-2">
            <span>Sposób ustawienia</span>
            <select
              data-testid="wyposazenie-pola-tryb"
              className={pole}
              value={tryb}
              onChange={(e) => setTryb(e.target.value as TrybWyposazenia)}
            >
              {TRYBY.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.etykieta}
                </option>
              ))}
            </select>
          </label>
          {bladKatalogu ? (
            <p data-testid="wyposazenie-pola-blad-katalogu" className="mt-1 text-sygnal-uwaga-tusz">
              {bladKatalogu}
            </p>
          ) : null}

          {tryb === 'katalog' ? (
            <div className="mt-2 space-y-2">
              {wiersze.map((w, i) => {
                const pozycje = w.kind ? pozycjeDlaWiersza(katalog, w.kind, w) : [];
                const maKatalog = w.kind !== '' && PRZESTRZEN_KATALOGU_APARATU[w.kind] !== null;
                return (
                  <div key={i} data-testid={`wyposazenie-pola-aparat-${i}`} className="flex flex-wrap items-center gap-1.5">
                    <select
                      aria-label={`Rodzaj aparatu ${i + 1}`}
                      data-testid={`wyposazenie-pola-aparat-${i}-rodzaj`}
                      className={pole}
                      value={w.kind}
                      onChange={(e) => zmienWiersz(i, (x) => zmienRodzaj(x, e.target.value as RodzajAparatuPolaSn | ''))}
                    >
                      <option value="">— rodzaj aparatu —</option>
                      {RODZAJE_APARATU_POLA_SN.map((k) => (
                        <option key={k} value={k}>
                          {NAZWA_RODZAJU_APARATU_PL[k]}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Umiejscowienie aparatu ${i + 1}`}
                      data-testid={`wyposazenie-pola-aparat-${i}-umiejscowienie`}
                      className={pole}
                      value={w.placement}
                      onChange={(e) => zmienWiersz(i, (x) => ({ ...x, placement: e.target.value as WierszAparatu['placement'] }))}
                    >
                      <option value="">— umiejscowienie w torze —</option>
                      {UMIEJSCOWIENIA.map((u) => (
                        <option key={u} value={u}>
                          {UMIEJSCOWIENIE_PL[u]}
                        </option>
                      ))}
                    </select>
                    {maKatalog ? (
                      <select
                        aria-label={`Pozycja katalogowa aparatu ${i + 1}`}
                        data-testid={`wyposazenie-pola-aparat-${i}-katalog`}
                        className={pole}
                        value={w.catalog_ref}
                        onChange={(e) => zmienWiersz(i, (x) => ({ ...x, catalog_ref: e.target.value }))}
                      >
                        <option value="">— pozycja katalogowa —</option>
                        {pozycje.map((p) => (
                          <option key={p.id} value={p.id}>
                            {etykietaPozycji(p)}
                          </option>
                        ))}
                      </select>
                    ) : w.kind ? (
                      <span data-testid={`wyposazenie-pola-aparat-${i}-bez-katalogu`} className="text-scada-muted">
                        bez katalogu SN — wartość robocza
                      </span>
                    ) : null}
                    {w.kind && RODZAJE_Z_GALEZIA.includes(w.kind) ? (
                      <select
                        aria-label={`Łącznik modelu aparatu ${i + 1}`}
                        data-testid={`wyposazenie-pola-aparat-${i}-lacznik`}
                        className={pole}
                        value={w.linked_ref}
                        onChange={(e) => zmienWiersz(i, (x) => ({ ...x, linked_ref: e.target.value }))}
                      >
                        <option value="">— łącznik modelu (brak) —</option>
                        {lacznikiPola.map((l) => (
                          <option key={l.ref_id} value={l.ref_id}>
                            {l.name || l.ref_id}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {w.kind && RODZAJE_Z_ROLA_UZIEMIENIA.includes(w.kind) ? (
                      <select
                        aria-label={`Rola uziemienia aparatu ${i + 1}`}
                        data-testid={`wyposazenie-pola-aparat-${i}-uziemienie`}
                        className={pole}
                        value={w.earthing_role}
                        onChange={(e) => zmienWiersz(i, (x) => ({ ...x, earthing_role: e.target.value as RolaUziemnika | '' }))}
                      >
                        <option value="">— rola uziemienia (niezadeklarowana) —</option>
                        {ROLE_UZIEMNIKA.map((r) => (
                          <option key={r} value={r}>
                            {ETYKIETA_PL_ROLI_UZIEMNIKA[r]}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {bay.stan_obiektu === 'ISTNIEJACY' ? (
                      <select
                        aria-label={`Stan aparatu ${i + 1}`}
                        data-testid={`wyposazenie-pola-aparat-${i}-stan`}
                        className={pole}
                        value={w.stan_obiektu}
                        onChange={(e) =>
                          zmienWiersz(i, (x) => ({ ...x, stan_obiektu: e.target.value as WierszAparatu['stan_obiektu'] }))
                        }
                      >
                        <option value="">aparat bez zmian albo nowy (wymiana — projektowany)</option>
                        <option value="ISTNIEJACY">aparat istniejący (inwentaryzacja aparatu zastanego)</option>
                      </select>
                    ) : null}
                    <input
                      aria-label={`Oznaczenie aparatu ${i + 1}`}
                      data-testid={`wyposazenie-pola-aparat-${i}-oznaczenie`}
                      className={`${pole} w-16`}
                      placeholder="np. Q1"
                      value={w.designation}
                      onChange={(e) => zmienWiersz(i, (x) => ({ ...x, designation: e.target.value }))}
                    />
                    <input
                      aria-label={`Odgałęzienie toru aparatu ${i + 1}`}
                      data-testid={`wyposazenie-pola-aparat-${i}-odgalezienie`}
                      className={`${pole} w-24`}
                      placeholder="tor główny"
                      title="Odgałęzienie toru (np. pn — odgałęzienie przekładnika napięciowego); puste = tor główny pola"
                      value={w.odgalezienie}
                      onChange={(e) => zmienWiersz(i, (x) => ({ ...x, odgalezienie: e.target.value }))}
                    />
                    {w.kind === RODZAJ_Z_PRZEKLADNIA ? (
                      <input
                        aria-label={`Przekładnia aparatu ${i + 1}`}
                        data-testid={`wyposazenie-pola-aparat-${i}-przekladnia`}
                        className={`${pole} w-20`}
                        placeholder="np. 1/100"
                        title="Przekładnia przekładnika Ferrantiego zapisana jak na rysunku standardu (ENEA Z.10/Z.11/Z.11.1: 1/100)"
                        value={w.przekladnia}
                        onChange={(e) => zmienWiersz(i, (x) => ({ ...x, przekladnia: e.target.value }))}
                      />
                    ) : null}
                    {w.kind === RODZAJ_Z_WYKONANIEM ? (
                      <select
                        aria-label={`Wykonanie aparatu ${i + 1}`}
                        data-testid={`wyposazenie-pola-aparat-${i}-wykonanie`}
                        className={pole}
                        title="Wykonanie wyłącznika: stałe albo wysuwne (człon wysuwny na wózku, ENEA Zeszyt 1 §13) — schemat rysuje człon wysuwny znacznikiem ○ obok × wyłącznika"
                        value={w.wykonanie}
                        onChange={(e) => zmienWiersz(i, (x) => ({ ...x, wykonanie: e.target.value as WykonanieAparatu | '' }))}
                      >
                        <option value="">wykonanie nieokreślone</option>
                        {WYKONANIA_APARATU.map((wyk) => (
                          <option key={wyk} value={wyk}>
                            wykonanie {OPIS_WYKONANIA_APARATU_PL[wyk]}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <button
                      type="button"
                      data-testid={`wyposazenie-pola-aparat-${i}-usun`}
                      className="text-scada-muted underline"
                      onClick={() => setWiersze((p) => p.filter((_, j) => j !== i))}
                    >
                      Usuń
                    </button>
                  </div>
                );
              })}
              {wiersze.some((w) => w.kind !== '' && PRZESTRZEN_KATALOGU_APARATU[w.kind] === 'APARAT_SN' && w.stan_obiektu !== 'ISTNIEJACY') &&
              notaPozycjiUkrytych(katalog.APARAT_SN, 'PROJEKTOWANY') !== null ? (
                <p data-testid="wyposazenie-pola-nota-ukrytych" className="text-scada-muted">
                  {notaPozycjiUkrytych(katalog.APARAT_SN, 'PROJEKTOWANY')}
                </p>
              ) : null}
              <button
                type="button"
                data-testid="wyposazenie-pola-dodaj"
                className="text-scada-accent underline"
                onClick={() => setWiersze((p) => [...p, { ...WIERSZ_PUSTY }])}
              >
                Dodaj aparat
              </button>
            </div>
          ) : null}

          {tryb === 'szablon' ? (
            <label className="mt-2 flex flex-wrap items-center gap-2">
              <span>Szablon pola</span>
              <select
                data-testid="wyposazenie-pola-szablon"
                className={pole}
                value={szablonRef}
                onChange={(e) => setSzablonRef(e.target.value)}
              >
                <option value="">
                  {bay.bay_template_ref
                    ? `— szablon zapisany w polu (${bay.bay_template_ref}) —`
                    : '— pole nie ma szablonu: wskaż szablon —'}
                </option>
                {szablonyPola.map((s) => (
                  <option key={s.ref} value={s.ref}>
                    {s.etykieta}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {tryb === 'szablon' && wybranyKanoniczny ? (
            <p data-testid="wyposazenie-pola-szablon-opis" className="mt-1 text-[11px] text-scada-muted">
              {wybranyKanoniczny.podstawa ? `Podstawa: ${wybranyKanoniczny.podstawa}. ` : ''}
              {wybranyKanoniczny.wykonanie_lacznikow_pl ? `Wykonanie łączników: ${wybranyKanoniczny.wykonanie_lacznikow_pl}. ` : ''}
              {wybranyKanoniczny.funkcje_eaz.length > 0
                ? 'Funkcje zabezpieczeniowe pola:'
                : 'Szablon bez funkcji zabezpieczeniowych.'}
            </p>
          ) : null}
          {tryb === 'szablon' && wybranyKanoniczny && wybranyKanoniczny.funkcje_eaz_pl.length > 0 ? (
            <ul data-testid="wyposazenie-pola-szablon-funkcje-eaz" className="mt-1 list-disc pl-4 text-[11px] text-scada-muted">
              {wybranyKanoniczny.funkcje_eaz_pl.map((opis, i) => (
                <li key={wybranyKanoniczny.funkcje_eaz[i]} data-kod={wybranyKanoniczny.funkcje_eaz[i]}>
                  {opis}
                </li>
              ))}
            </ul>
          ) : null}
          {tryb === 'szablon' && wybranyKanoniczny?.profil_eaz && wybranyKanoniczny.profil_eaz.length > 0 ? (
            <div className="mt-1 text-[11px]">
              <span className="text-scada-text">Profil funkcjonalny zabezpieczeń wzorca (wszystkie klasy pola):</span>
              <ul data-testid="wyposazenie-pola-szablon-profil-eaz" className="list-disc pl-4 text-scada-muted">
                {wybranyKanoniczny.profil_eaz.map((p) => (
                  <li
                    key={p.kod}
                    data-kod={p.kod}
                    data-wymagalnosc={p.wymagalnosc}
                    title={p.wymogi.map((w) => `${NAZWA_KLASY_POLA_PL[w.klasa as KlasaPolaLiniowego] ?? w.klasa}: ${w.wymog_pl} (${w.podstawa}; ${NAZWA_WERYFIKACJI_PL[w.weryfikacja]})`).join('\n')}
                  >
                    {p.opis_pl} — {p.wymagalnosc_pl}
                    {p.na_rysunku ? '' : ' (poza rysunkiem wzorca — wymóg klasy pola)'}
                    {p.warunek_pl ? (
                      <span data-testid={`wyposazenie-pola-profil-warunek-${p.kod}`}>
                        {` — warunek przypisania: ${p.warunek_pl}`}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {tryb === 'szablon' && niedopuszczone.length > 0 ? (
            <ul data-testid="wyposazenie-pola-szablony-niedostepne" className="mt-1 list-disc pl-4 text-[11px] text-scada-muted">
              {niedopuszczone.map((s) => (
                <li key={s.template_ref} data-testid={`wyposazenie-pola-szablon-niedostepny-${s.template_ref}`}>
                  <span className="font-medium text-scada-text">{s.template_name_pl}</span> — niedostępny w tym polu:{' '}
                  {s.odmowy.map((o) => o.komunikat_pl).join(' ')}
                </li>
              ))}
            </ul>
          ) : null}
          {polePozwalaNaKlase ? (
            <label className="mt-2 flex flex-wrap items-center gap-2">
              <span>Klasa pola liniowego</span>
              <select
                data-testid="wyposazenie-pola-klasa"
                className={pole}
                value={klasaPo ?? ''}
                onChange={(e) =>
                  setKlasa({
                    zmien: true,
                    wartosc: e.target.value === '' ? null : (e.target.value as (typeof KLASY_POLA_LINIOWEGO)[number]),
                  })
                }
              >
                <option value="">— klasa nieustalona —</option>
                {KLASY_POLA_LINIOWEGO.map((k) => (
                  <option key={k} value={k}>
                    {NAZWA_KLASY_POLA_PL[k]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {zrodloU0 ? (
            // Decyzja właściciela 2026-10-29: 67N wyłącznie przy potwierdzonym źródle 3U₀ —
            // projektant wskazuje przekładnik z otwartym trójkątem pola pomiaru napięcia szyn
            // tej sekcji (ENEA Z.17); kandydatów i ocenę powiązania liczy backend. Kandydat NIE
            // jest wybierany za projektanta — zapis bez wskazania nie przypisuje 67N.
            <div data-testid="wyposazenie-pola-zrodlo-u0" className="mt-2">
              <label className="flex flex-wrap items-center gap-2">
                <span>Źródło napięcia zerowego 3U₀ (zabezpieczenie 67N)</span>
                <select
                  data-testid="wyposazenie-pola-zrodlo-u0-wybor"
                  className={pole}
                  value={zrodloU0Po ?? ''}
                  onChange={(e) =>
                    setZmianaZrodlaU0({ zmien: true, wartosc: e.target.value === '' ? null : e.target.value })
                  }
                >
                  <option value="">— bez powiązania (funkcja 67N nieprzypisana) —</option>
                  {zrodloU0.kandydaci.map((k) => (
                    <option key={k.vt_ref} value={k.vt_ref}>
                      {k.opis_pl}
                    </option>
                  ))}
                  {zrodloU0Po && !zrodloU0.kandydaci.some((k) => k.vt_ref === zrodloU0Po) ? (
                    <option value={zrodloU0Po}>powiązanie nieaktualne — przekładnik spoza kandydatów</option>
                  ) : null}
                </select>
              </label>
              <p
                data-testid="wyposazenie-pola-zrodlo-u0-stan"
                data-potwierdzone={String(zrodloU0.potwierdzone)}
                className="mt-1 text-[11px] text-scada-muted"
              >
                {zrodloU0.potwierdzone
                  ? `${zrodloU0.przyczyna_pl[0]?.toUpperCase() ?? ''}${zrodloU0.przyczyna_pl.slice(1)}.`
                  : `Brakuje: ${zrodloU0.czego_brakuje.join('; ')}.`}
              </p>
            </div>
          ) : null}

          {tryb === 'wyczysc' ? (
            <p className="mt-2 text-scada-muted">
              Pole zostanie bez aparatów pierwotnych (stan „brak danych"). Łączniki gałęzi pola zostają w modelu.
            </p>
          ) : null}

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              data-testid="wyposazenie-pola-zapisz"
              className="rounded border border-scada-accent px-2 py-1 text-scada-accent disabled:opacity-50"
              disabled={!gotowy}
              onClick={() => void onZapisz()}
            >
              Zapisz wyposażenie
            </button>
            <button
              type="button"
              data-testid="wyposazenie-pola-anuluj"
              className="text-scada-muted underline"
              disabled={zapis}
              onClick={() => {
                setOtwarty(false);
                setBlad(null);
              }}
            >
              Anuluj
            </button>
            {!activeCaseId ? <span className="text-scada-muted">Wybierz aktywny zakres obliczeń.</span> : null}
          </div>
          {blad ? (
            <p data-testid="wyposazenie-pola-blad" role="alert" className="mt-1 text-sygnal-blokada-tusz">
              {blad}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
