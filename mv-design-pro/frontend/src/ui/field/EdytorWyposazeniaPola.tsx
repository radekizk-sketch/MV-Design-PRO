/**
 * KARTY W5-C i GPZ-H5-APARATURA — edytor wyposażenia pola (karta pola, ekran E-11).
 *
 * Jedyny dostawca operacji `set_bay_equipment` w interfejsie. Pięć trybów = pięć trybów
 * operacji: „z katalogu aparatów" (aparaty z pozycją katalogową, opcjonalnie w gnieździe
 * standardu), „z szablonu pola" (szablon pola producenta), „z szablonu pola standardu"
 * (gniazda standardu operatora bez pozycji — status „wymagane standardem"), „obsadź gniazda
 * wymaganiami standardu" (wolne gniazda dostają pozycje wymagań standardu z katalogu) i
 * „usuń wyposażenie". Skład pola (gniazda ze statusem i wyjaśnieniem, aparaty spoza gniazd)
 * pokazuje z modelu odczytu pola (`base_model.sklad`), a po zapisie — z odpowiedzi operacji
 * (`wyposazenie_pola.sklad`); obie liczy JEDNA funkcja backendu (`enm/sklad_pola.py`).
 * Każda kontrolka mapuje na pole ładunku operacji; reguły doboru (rodzaj pozycji, U_m wobec
 * szyny pola, gniazdo szablonu) ocenia backend, odmowa wraca tu zdaniem z kodem. ZERO fizyki
 * i zero domysłu w UI.
 *
 * Katalog aparatów i szablonów pobierany dopiero po otwarciu edycji („Zmień wyposażenie") —
 * sama karta pola nie odpytuje katalogu, gdy pole nie ma z nim powiązania.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  Bay,
  EnergyNetworkModel,
  WierszSkladuPola,
  WyposazeniePolaOdpowiedz,
} from '../../types/enm';
import { ETYKIETA_PL_ROLI_UZIEMNIKA, ROLE_UZIEMNIKA, type RolaUziemnika } from '../../types/uziemienie';
import {
  fetchBayStandardTemplates,
  fetchCompleteBayTemplates,
  fetchCtTypes,
  fetchElementPolaTypes,
  fetchMvApparatusTypes,
  fetchSurgeArresterTypes,
  fetchVtTypes,
  getCatalogErrorMessage,
} from '../catalog/api';
import type { CompleteMvBayTemplateSummary } from '../catalog/BayTemplatePicker';
import type {
  CatalogType,
  ElementPolaCatalogType,
  MVApparatusType,
  SzablonPolaStandardu,
} from '../catalog/types';
import { czyLacznik } from '../shared/stanLacznika';
import {
  czyWierszKompletny,
  NAZWA_RODZAJU_APARATU_PL,
  PRZESTRZEN_KATALOGU_APARATU,
  RODZAJE_APARATU_POLA_SN,
  RODZAJE_KATALOGOWE_APARATU,
  RODZAJE_Z_GALEZIA,
  RODZAJE_Z_ROLA_UZIEMIENIA,
  STATUS_SKLADU_POLA_PL,
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
} from './wyposazeniePola';
import type { DomainOpResponseV1 } from '../../types/enm';

interface PozycjeKatalogu {
  readonly APARAT_SN: readonly MVApparatusType[];
  readonly CT: readonly CatalogType[];
  readonly VT: readonly CatalogType[];
  readonly OGRANICZNIK_SN: readonly CatalogType[];
  readonly ELEMENT_POLA_SN: readonly ElementPolaCatalogType[];
}

const KATALOG_PUSTY: PozycjeKatalogu = {
  APARAT_SN: [],
  CT: [],
  VT: [],
  OGRANICZNIK_SN: [],
  ELEMENT_POLA_SN: [],
};

const TRYBY: ReadonlyArray<{ id: TrybWyposazenia; etykieta: string }> = [
  { id: 'katalog', etykieta: 'Z katalogu aparatów' },
  { id: 'szablon', etykieta: 'Z szablonu pola producenta' },
  { id: 'standard', etykieta: 'Z szablonu pola standardu' },
  { id: 'wymagania', etykieta: 'Obsadź gniazda wymaganiami standardu' },
  { id: 'wyczysc', etykieta: 'Usuń wyposażenie' },
];

/** Szablony pól standardu opisują wyłącznie rozdzielnicę SN — szynę sieci z tabeli 3 IEC 60038
 *  (napięcie znamionowe do 35 kV); szablon dla innej szyny backend odrzuca
 *  (`bay_equipment.standard_template_voltage_mismatch`), więc lista jest wtedy pusta. */
const GRANICA_TABELI_SN_KV = 35;

export interface EdytorWyposazeniaPolaProps {
  readonly bay: Bay;
  readonly snapshot: EnergyNetworkModel | null;
  /** Skład pola z modelu odczytu pola (`null` = model odczytu niedostępny). */
  readonly sklad: readonly WierszSkladuPola[] | null;
  /** Nazwa szablonu pola standardu (z modelu odczytu pola). */
  readonly szablonStandarduNazwa?: string | null;
  readonly activeCaseId: string | null;
  readonly executeDomainOperation: (
    caseId: string,
    opName: string,
    payload: Record<string, unknown>,
  ) => Promise<DomainOpResponseV1 | null>;
  readonly bladStore?: () => string | null;
}

function pozycjeDlaWiersza(katalog: PozycjeKatalogu, kind: RodzajAparatuPolaSn): readonly CatalogType[] {
  const przestrzen: PrzestrzenKatalogu | null = PRZESTRZEN_KATALOGU_APARATU[kind];
  if (przestrzen === null) return [];
  const dozwolone = RODZAJE_KATALOGOWE_APARATU[kind] ?? [];
  if (przestrzen === 'APARAT_SN') return katalog.APARAT_SN.filter((p) => dozwolone.includes(p.device_kind));
  if (przestrzen === 'ELEMENT_POLA_SN') return katalog.ELEMENT_POLA_SN.filter((p) => dozwolone.includes(p.rodzaj));
  return katalog[przestrzen];
}

/** Gniazda standardu pola (z wierszy składu, kolejność od szyny) przyjmujące rodzaj aparatu. */
function gniazdaRodzaju(
  sklad: readonly WierszSkladuPola[],
  kind: RodzajAparatuPolaSn,
): ReadonlyArray<{ id: string; nazwa: string }> {
  const widziane = new Set<string>();
  const wynik: Array<{ id: string; nazwa: string }> = [];
  for (const w of sklad) {
    if (w.gniazdo_ref && w.rodzaj === kind && !widziane.has(w.gniazdo_ref)) {
      widziane.add(w.gniazdo_ref);
      wynik.push({ id: w.gniazdo_ref, nazwa: w.gniazdo_nazwa_pl ?? w.rodzaj_pl });
    }
  }
  return wynik;
}

function wierszeStartowe(bay: Bay): WierszAparatu[] {
  const z = wierszeZAparatow(bay.primary_devices);
  return z.length > 0 ? z : [{ ...WIERSZ_PUSTY }];
}

/** Skład pola: wiersz = gniazdo standardu albo aparat spoza gniazd; status zawsze ze zdaniem
 *  wyjaśnienia i podstawą (kontrakt werdyktu wyjaśnialnego). */
function TabelaSkladu({ sklad, testid }: { sklad: readonly WierszSkladuPola[]; testid: string }) {
  if (sklad.length === 0) {
    return (
      <p data-testid={`${testid}-pusty`} className="mt-1 text-scada-muted">
        Pole nie ma aparatów — ani w rekordzie pola, ani w elementach modelu tego pola.
      </p>
    );
  }
  return (
    <ul data-testid={testid} className="mt-1 space-y-1 text-[11px]">
      {sklad.map((w, i) => (
        <li
          key={`${w.gniazdo_ref ?? ''}:${w.device_ref ?? ''}:${i}`}
          data-testid={`${testid}-wiersz-${i}`}
          data-status={w.status}
          className="rounded border border-scada-border px-1.5 py-1"
        >
          <span className="font-medium text-scada-text">{w.gniazdo_nazwa_pl ?? w.rodzaj_pl}</span>{' '}
          — <span data-testid={`${testid}-wiersz-${i}-status`}>{STATUS_SKLADU_POLA_PL[w.status]}</span>
          <span className="block text-scada-muted">{w.opis_pl}</span>
          {w.podstawa_pl ? <span className="block text-scada-muted">Podstawa: {w.podstawa_pl}</span> : null}
          {w.interpretacja_pl ? <span className="block text-scada-muted">{w.interpretacja_pl}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function EdytorWyposazeniaPola({
  bay,
  snapshot,
  sklad,
  szablonStandarduNazwa,
  activeCaseId,
  executeDomainOperation,
  bladStore,
}: EdytorWyposazeniaPolaProps): JSX.Element {
  const [tryb, setTryb] = useState<TrybWyposazenia>('katalog');
  const [wiersze, setWiersze] = useState<WierszAparatu[]>(() => wierszeStartowe(bay));
  const [szablonRef, setSzablonRef] = useState('');
  const [katalog, setKatalog] = useState<PozycjeKatalogu>(KATALOG_PUSTY);
  const [szablony, setSzablony] = useState<readonly CompleteMvBayTemplateSummary[]>([]);
  const [szablonyStandardu, setSzablonyStandardu] = useState<readonly SzablonPolaStandardu[]>([]);
  const [szablonStandarduRef, setSzablonStandarduRef] = useState('');
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [wynik, setWynik] = useState<WyposazeniePolaOdpowiedz | null>(null);
  const [zapis, setZapis] = useState(false);
  const [otwarty, setOtwarty] = useState(false);

  useEffect(() => {
    if (!otwarty) return undefined;
    let anulowane = false;
    Promise.all([
      fetchMvApparatusTypes(),
      fetchCtTypes(),
      fetchVtTypes(),
      fetchSurgeArresterTypes(),
      fetchElementPolaTypes(),
      fetchCompleteBayTemplates(),
      fetchBayStandardTemplates(),
    ])
      .then(([aparaty, ct, vt, ograniczniki, elementy, pola, standardy]) => {
        if (anulowane) return;
        setKatalog({ APARAT_SN: aparaty, CT: ct, VT: vt, OGRANICZNIK_SN: ograniczniki, ELEMENT_POLA_SN: elementy });
        setSzablony(pola);
        setSzablonyStandardu(standardy);
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

  // Szablony pola tej samej funkcji (rola pola w modelu) — inne backend odrzuca.
  const szablonyPola = useMemo(
    () => szablony.filter((s) => s.bay_role === bay.bay_role),
    [bay.bay_role, szablony],
  );

  // Szablony pola standardu tej samej funkcji, tylko dla szyny rozdzielnicy SN — inne backend
  // odrzuca (`bay_equipment.standard_template_role_mismatch` / `..._voltage_mismatch`).
  const szablonyStandarduPola = useMemo(() => {
    const napiecie = (snapshot?.buses ?? []).find((b) => b.ref_id === bay.bus_ref)?.voltage_kv;
    if (typeof napiecie === 'number' && napiecie > GRANICA_TABELI_SN_KV) return [];
    return szablonyStandardu.filter((s) => s.role_pola.includes(bay.bay_role));
  }, [bay.bay_role, bay.bus_ref, snapshot, szablonyStandardu]);

  const skladBiezacy = wynik?.sklad ?? sklad ?? [];

  const zmienWiersz = useCallback((indeks: number, zmiana: (w: WierszAparatu) => WierszAparatu) => {
    setWiersze((p) => p.map((w, i) => (i === indeks ? zmiana(w) : w)));
  }, []);

  const gotowy =
    activeCaseId !== null &&
    !zapis &&
    (tryb !== 'katalog' || (wiersze.length > 0 && wiersze.every(czyWierszKompletny))) &&
    (tryb !== 'standard' || szablonStandarduRef !== '') &&
    (tryb !== 'wymagania' || Boolean(bay.szablon_standardu_ref));

  const onZapisz = useCallback(async () => {
    if (!activeCaseId) return;
    setZapis(true);
    setBlad(null);
    setWynik(null);
    try {
      const odpowiedz = await executeDomainOperation(
        activeCaseId,
        'set_bay_equipment',
        zbudujPayloadWyposazenia(bay.ref_id, tryb, wiersze, szablonRef, szablonStandarduRef),
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
  }, [activeCaseId, bay.ref_id, bladStore, executeDomainOperation, szablonRef, szablonStandarduRef, tryb, wiersze]);

  const pole = 'rounded border border-scada-border bg-white px-1.5 py-1 text-xs';

  return (
    <section data-testid="wyposazenie-pola" className="border-t border-scada-border p-3 text-xs">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
        Wyposażenie pola (aparaty pierwotne)
      </h3>
      <p data-testid="wyposazenie-pola-standard" className="mt-1 text-scada-text">
        {szablonStandarduNazwa
          ? `Szablon pola standardu: ${szablonStandarduNazwa}.`
          : bay.szablon_standardu_ref
            ? 'Pole ma szablon pola standardu.'
            : 'Pole bez szablonu pola standardu — skład to aparaty rekordu pola i elementy modelu pola.'}
      </p>
      {wynik ? (
        <p data-testid="wyposazenie-pola-wynik" className="mt-1">
          Zapisano — skład pola po zapisie:
        </p>
      ) : null}
      {sklad === null && !wynik ? (
        <p data-testid="wyposazenie-pola-sklad-niedostepny" className="mt-1 text-scada-muted">
          Skład pola nieznany — brak modelu odczytu pola.
        </p>
      ) : (
        <TabelaSkladu sklad={skladBiezacy} testid="wyposazenie-pola-sklad" />
      )}

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
            setSzablonStandarduRef('');
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
                const pozycje = w.kind ? pozycjeDlaWiersza(katalog, w.kind) : [];
                const maKatalog = w.kind !== '' && PRZESTRZEN_KATALOGU_APARATU[w.kind] !== null;
                const gniazda = w.kind ? gniazdaRodzaju(skladBiezacy, w.kind) : [];
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
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : w.kind ? (
                      <span data-testid={`wyposazenie-pola-aparat-${i}-bez-katalogu`} className="text-scada-muted">
                        rodzaj bez katalogu — dane niesie element modelu, któremu służy
                      </span>
                    ) : null}
                    {gniazda.length > 0 ? (
                      <select
                        aria-label={`Gniazdo standardu aparatu ${i + 1}`}
                        data-testid={`wyposazenie-pola-aparat-${i}-gniazdo`}
                        className={pole}
                        value={w.gniazdo_ref}
                        onChange={(e) => zmienWiersz(i, (x) => ({ ...x, gniazdo_ref: e.target.value }))}
                      >
                        <option value="">— poza gniazdami standardu —</option>
                        {gniazda.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.nazwa}
                          </option>
                        ))}
                      </select>
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
                    <input
                      aria-label={`Oznaczenie aparatu ${i + 1}`}
                      data-testid={`wyposazenie-pola-aparat-${i}-oznaczenie`}
                      className={`${pole} w-16`}
                      placeholder="np. Q1"
                      value={w.designation}
                      onChange={(e) => zmienWiersz(i, (x) => ({ ...x, designation: e.target.value }))}
                    />
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
                  <option key={s.template_ref} value={s.template_ref}>
                    {s.template_name_pl ?? s.template_ref}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {tryb === 'standard' ? (
            <label className="mt-2 flex flex-wrap items-center gap-2">
              <span>Szablon pola standardu</span>
              <select
                data-testid="wyposazenie-pola-szablon-standardu"
                className={pole}
                value={szablonStandarduRef}
                onChange={(e) => setSzablonStandarduRef(e.target.value)}
              >
                <option value="">— wskaż szablon pola standardu —</option>
                {szablonyStandarduPola.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nazwa_pl}
                  </option>
                ))}
              </select>
              <span className="basis-full text-scada-muted">
                Pole dostanie gniazda standardu w kolejności od szyny, każde bez pozycji katalogowej (status „wymagane
                standardem — brak aparatu z katalogu”); pozycje wskażesz trybem „z katalogu aparatów” albo obsadzeniem
                wymaganiami standardu.
              </span>
            </label>
          ) : null}

          {tryb === 'wymagania' ? (
            <p data-testid="wyposazenie-pola-wymagania-opis" className="mt-2 text-scada-muted">
              {bay.szablon_standardu_ref
                ? 'Wolne gniazda standardu dostaną pozycje wymagań standardu z katalogu (progi wymagań operatora z podstawą — nie dane wyrobu); gniazda obsadzone zostają bez zmian.'
                : 'Pole nie ma szablonu pola standardu — nadaj go trybem „z szablonu pola standardu”, zanim obsadzisz gniazda.'}
            </p>
          ) : null}

          {tryb === 'wyczysc' ? (
            <p className="mt-2 text-scada-muted">
              Pole zostanie bez rekordu aparatów pierwotnych; skład pokaże wyłącznie aparaty wyprowadzone z elementów
              modelu pola (łączniki, przekładniki, transformator). Łączniki gałęzi pola zostają w modelu.
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
