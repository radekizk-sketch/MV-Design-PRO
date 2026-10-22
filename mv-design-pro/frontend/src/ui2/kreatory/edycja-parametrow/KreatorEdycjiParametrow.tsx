/**
 * Kreator „Edycja parametrów elementu" (update_element_parameters) — ui2, kreatory/rama.
 *
 * Ekspercki override pól elementu. Zapis = operacja domenowa `update_element_parameters`,
 * której kontrakt to `element_ref` + `parameters` (mapa). Dawne pole „Uzasadnienie zmiany"
 * wysyłało `reason` na poziomie ładunku, którego operacja nie czyta i żaden ekran nie pokazuje —
 * kontrolka-widmo usunięta (kontrakt kluczy: `harness-fixtures/generated/kontrakt_ladunkow_operacji.json`).
 * Uzasadnienie istnieje wyłącznie w sekcji wartości projektanta aparatu SN, gdzie backend czyta
 * je jako `overrides[].reason`.
 *
 * Naprawa długu (Zero-Debt §1): stary formularz w trybie prostym wysyłał klucz `updates`,
 * którego handler `update_element_parameters` NIE czyta (czyta `parameters`) — zapis był
 * pustą operacją (phantom). Tutaj wysyłamy poprawnie `parameters`. Backend pilnuje listy
 * dozwolonych kluczy dla typu elementu; parametry katalogowe zmienia się przez katalog.
 *
 * WARTOŚCI PROJEKTANTA APARATU SN (zasada nr 4, V12K-351): gałąź z wiązaniem APARAT_SN dostaje
 * sekcję czterech parametrów (czas własny, I_k, t_k, I_p). Zapis to lista `overrides`
 * (`wartosciRoboczeAparatu.ts`); bramą wartości jest walidator backendu, a obok pola stoi to, co
 * obliczenie przyjmie bez wartości projektanta (dana karty albo propozycja rejestru backendu).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchMvApparatusTypes } from '../../../ui/catalog/api';
import type { MVApparatusType } from '../../../ui/catalog/types';
import { useGrupyPolaczen } from '../../../ui/catalog/useGrupyPolaczen';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { ElementType } from '../../../ui/types';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PanelTeorii,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  useSelekcjaPoOperacji,
  type WierszGotowosci,
} from '../rama';
import {
  ETYKIETA_PL_TOLERANCJI_NN,
  ETYKIETA_PL_UZIEMIENIA_EKRANU,
  TOLERANCJE_NAPIECIA_NN,
  UKLADY_SIECI_NN,
  UZIEMIENIA_EKRANU_KABLA,
} from '../../../types/uziemienie';
import {
  formularzDanychModuluZModelu,
  zbudujPolaNcRfgGeneratora,
  zmienionePolaNcRfg,
  type FormularzDanychModulu,
} from '../../oze/ncrfg/daneModulu';
import { SekcjaDanychModulu } from '../../oze/ncrfg/SekcjaDanychModulu';
import { EDYCJA_PARAMETROW_STRINGS as T } from './strings';
import {
  NAMESPACE_APARAT_SN,
  PARAMETRY_APARATU_SN,
  formularzZNadpisan,
  jestParametremAparatuSn,
  nadpisaniaZFormularza,
  nadpisaniaZmienione,
  zrodloBezProjektanta,
  type FormularzWartosciAparatu,
  type ParametrAparatuSn,
} from './wartosciRoboczeAparatu';
import { RODZAJE_STACJI, podpisRodzajuStacjiPl } from '../../../ui/shared/rodzajStacji';
import { useNazwaObiektu } from '../../wyniki/wzorzec/useNazwaObiektu';

interface WierszParametru {
  klucz: string;
  wartosc: string;
}

type OpcjaSlownika = { id: string; etykieta: string };

/**
 * W5-A: klucze o WARTOŚCIACH ZE SŁOWNIKA kontraktu — dla nich pole wartości to lista
 * (ta sama, którą waliduje backend: `Transformer.lv_earthing_system`, `Cable.screen_bonding`,
 * `Transformer.vector_group` ze słownika IEC 60076-1 z `GET /api/catalog/grupy-polaczen`).
 * Wartość spoza słownika i tak odrzuci backend — lista ma ją uczynić niemożliwą, nie tylko błędną.
 */
const SLOWNIKI_STATYCZNE: Readonly<Record<string, readonly OpcjaSlownika[]>> = {
  // Karta ETYKIETA-STACJI-PRZELOTOWEJ: deklaracja rodzaju stacji SN/nN (akcja naprawcza
  // walidatora W043 podaje tu rodzaj wyprowadzony z topologii) — ten sam zbiór, który przyjmuje
  // backend (`TYPY_STACJI_SN_NN`); GPZ i rozdzielnicy nN deklaracji zmienić nie można.
  station_type: [
    ...RODZAJE_STACJI.map((id) => ({ id, etykieta: podpisRodzajuStacjiPl(id) })),
    { id: 'mv_lv', etykieta: 'Stacja SN/nN bez wskazania rodzaju' },
  ],
  lv_earthing_system: UKLADY_SIECI_NN.map((id) => ({ id, etykieta: id })),
  // Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: tolerancja napięcia sieci nN transformatora albo źródła
  // na szynie nN (`lv_voltage_tolerance`) — wiersz nN tabeli 1 IEC 60909-0 dla doboru c.
  lv_voltage_tolerance: TOLERANCJE_NAPIECIA_NN.map((id) => ({
    id,
    etykieta: ETYKIETA_PL_TOLERANCJI_NN[id],
  })),
  screen_bonding: UZIEMIENIA_EKRANU_KABLA.map((id) => ({ id, etykieta: `${id} — ${ETYKIETA_PL_UZIEMIENIA_EKRANU[id]}` })),
};

/** Klucze parametrów, dla których kontrakt ma słownik wartości (pole = lista). */
const KLUCZE_SLOWNIKOWE: ReadonlySet<string> = new Set([
  ...Object.keys(SLOWNIKI_STATYCZNE),
  'vector_group',
]);

function kluczZWymogu(wymog: string): string {
  return KLUCZE_SLOWNIKOWE.has(wymog) ? wymog : '';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Klucze kontraktu o wartości TEKSTOWEJ (pola `str` modeli ENM) — ich wartość nie jest
 * zgadywana jako liczba. K6: numer pola „01" wysyłany jako liczba 1 był odrzucany przez
 * walidację backendu (`Bay.bay_number: str`), a nazwa „2" zapisywała się jako liczba.
 */
const KLUCZE_TEKSTOWE: ReadonlySet<string> = new Set([
  'name',
  'bay_number',
  'feeder_short_name',
  'outgoing_destination_ref',
  'entry_point_ref',
  'station_type',
  'vector_group',
  'lv_earthing_system',
  'screen_bonding',
  'insulation',
  'conductor_material',
  'catalog_ref',
  'catalog_namespace',
  'source_mode',
  'parameter_source',
]);

/** Liczba z backendu z przecinkiem dziesiętnym (podpowiedź pola) — bez przeliczeń. */
function liczbaPl(wartosc: number): string {
  return String(wartosc).replace('.', ',');
}

/** Podpowiedź pola: co obliczenie przyjmie, gdy projektant nie poda wartości. */
function podpowiedzAparatu(pozycja: MVApparatusType | null, parametr: ParametrAparatuSn): string {
  const zrodlo = zrodloBezProjektanta(pozycja, parametr);
  const jednostka = T.aparatJednostki[parametr];
  if (zrodlo.rodzaj === 'karta') return `${T.aparatZKarty} ${liczbaPl(zrodlo.wartosc)} ${jednostka}.`;
  if (zrodlo.rodzaj === 'propozycja') {
    const rodzaj = T.aparatRodzajZrodla[zrodlo.rodzajZrodla] ?? zrodlo.rodzajZrodla;
    return `${T.aparatPropozycja} ${liczbaPl(zrodlo.wartosc)} ${jednostka} (${rodzaj}).`;
  }
  return `${T.aparatBrak}.`;
}

/** Konwersja tekstu na typ: dla kluczy tekstowych tekst; inaczej liczba / tak-nie / brak
 *  wartości wykrywane automatycznie, reszta jako tekst. */
function parsujWartosc(raw: string, klucz = ''): string | number | boolean | null {
  const trimmed = raw.trim();
  if (KLUCZE_TEKSTOWE.has(klucz.trim())) return trimmed;
  if (trimmed === 'brak') return null;
  if (trimmed === 'tak') return true;
  if (trimmed === 'nie') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return raw;
}

export function KreatorEdycjiParametrow() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();

  const elementRef = readString(context?.element_ref);
  // Element podpisany NAZWĄ z migawki (ten sam most nazw co lista gotowości) — nie
  // identyfikatorem maszynowym (karta ETYKIETA-STACJI-PRZELOTOWEJ: naprawa W043).
  const nazwaObiektu = useNazwaObiektu();
  const nazwaElementu = elementRef ? nazwaObiektu(elementRef) : '';
  const zrodloParametrow = readString(context?.parameter_source) || readString(context?.source_mode);
  const fallbackType = (readString(context?.element_type) || 'LineBranch') as ElementType;

  // Gałąź aparatu pola SN (wiązanie APARAT_SN): sekcja wartości projektanta (`overrides`).
  const galaz = useSnapshotStore(
    (s) => s.snapshot?.branches?.find((b) => b.ref_id === elementRef) ?? null,
  );
  const jestAparatSn = galaz?.catalog_namespace === NAMESPACE_APARAT_SN;
  const poleKontekstu = readString(context?.field);
  const poleAparatuZKontekstu =
    jestAparatSn && jestParametremAparatuSn(poleKontekstu) ? poleKontekstu : null;

  // Pole wskazane przez kontekst (akcja naprawcza gotowości, C-12): klucz pierwszego
  // wiersza i kursor w polu jego wartości — projektant wpisuje od razu brakującą daną.
  // Klucz startowy: jawne `field` kontekstu albo `required` z `payload_hint` akcji naprawczej
  // bramki (np. transformer.lv_earthing_system_missing → `lv_earthing_system`). `required` bywa też
  // opisem wymogu, nie kluczem parametru (`continuous_path_to_source`) — przyjmujemy go
  // wyłącznie, gdy jest kluczem ze słownika kontraktu (jedno źródło: SLOWNIKI_STATYCZNE
  // + `vector_group`), inaczej formularz zaczynałby się od klucza, którego backend nie zna.
  // Parametr aparatu SN wskazany kontekstem (akcja „Zmień wartość" ekranu wytrzymałości)
  // trafia do sekcji aparatu, nie do wiersza klucz → wartość.
  const initialKey = poleAparatuZKontekstu
    ? ''
    : poleKontekstu || kluczZWymogu(readString(context?.required));
  const [wiersze, setWiersze] = useState<WierszParametru[]>(() => [
    { klucz: initialKey, wartosc: readString(context?.value) },
  ]);
  // Uzasadnienie wartości projektanta aparatu SN — czytane przez backend jako
  // `overrides[].reason` (`_nadpisania_aparatu_sn`); poza sekcją aparatu nie istnieje.
  const [powod, setPowod] = useState('');
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  // Brak słownika z backendu = pole tekstowe (backend i tak waliduje E-W5-02).
  const grupySlownik = useGrupyPolaczen();
  const grupyPolaczen = useMemo<readonly OpcjaSlownika[] | null>(
    () => (grupySlownik ? grupySlownik.map((id) => ({ id, etykieta: id })) : null),
    [grupySlownik],
  );

  const slownikDlaKlucza = useCallback(
    (klucz: string): readonly OpcjaSlownika[] | null => {
      const k = klucz.trim();
      if (k === 'vector_group') return grupyPolaczen;
      return SLOWNIKI_STATYCZNE[k] ?? null;
    },
    [grupyPolaczen],
  );

  const wypelnione = useMemo(
    () => wiersze.filter((w) => w.klucz.trim() && w.wartosc.trim() !== ''),
    [wiersze],
  );

  // Plan AB O-50 pkt 5: generator ma w modelu dane modułu NC RfG (art. 4, data umowy, nastawy
  // zabezpieczeń, deklaracje) — edycja przez TEN SAM formularz i tę samą budowę pól co kreator
  // źródła OZE; zapis wyłącznie pól zmienionych wobec modelu (bez nadpisywania niezmienionych).
  const generator = useSnapshotStore(
    (s) => s.snapshot?.generators?.find((g) => g.ref_id === elementRef) ?? null,
  );
  const [daneModulu, setDaneModulu] = useState<FormularzDanychModulu | null>(() =>
    generator ? formularzDanychModuluZModelu(generator) : null,
  );
  useEffect(() => {
    if (generator && daneModulu === null) setDaneModulu(formularzDanychModuluZModelu(generator));
  }, [generator, daneModulu]);
  const wynikDanychModulu = useMemo(
    () => (daneModulu ? zbudujPolaNcRfgGeneratora(daneModulu) : null),
    [daneModulu],
  );
  const zmianyNcRfg = useMemo(
    () =>
      generator && wynikDanychModulu?.stan === 'ok'
        ? zmienionePolaNcRfg(wynikDanychModulu.pola, generator)
        : {},
    [generator, wynikDanychModulu],
  );
  const liczbaZmianNcRfg = Object.keys(zmianyNcRfg).length;

  const [formularzAparatu, setFormularzAparatu] = useState<FormularzWartosciAparatu | null>(() =>
    jestAparatSn ? formularzZNadpisan(galaz?.overrides) : null,
  );
  useEffect(() => {
    if (jestAparatSn && formularzAparatu === null) {
      setFormularzAparatu(formularzZNadpisan(galaz?.overrides));
    }
  }, [jestAparatSn, galaz, formularzAparatu]);
  const [pozycjaAparatu, setPozycjaAparatu] = useState<MVApparatusType | null>(null);
  const catalogRefAparatu = jestAparatSn ? readString(galaz?.catalog_ref) : '';
  useEffect(() => {
    if (!catalogRefAparatu) return undefined;
    let aktywny = true;
    fetchMvApparatusTypes()
      .then((pozycje) => {
        if (aktywny) setPozycjaAparatu(pozycje.find((p) => p.id === catalogRefAparatu) ?? null);
      })
      // Bez katalogu podpowiedź mówi „brak" — zapis i walidacja zostają po stronie backendu.
      .catch(() => undefined);
    return () => {
      aktywny = false;
    };
  }, [catalogRefAparatu]);
  const wynikAparatu = useMemo(
    () =>
      formularzAparatu ? nadpisaniaZFormularza(formularzAparatu, galaz?.overrides, powod) : null,
    [formularzAparatu, galaz, powod],
  );
  const zmianaAparatu =
    wynikAparatu?.rodzaj === 'lista' && nadpisaniaZmienione(wynikAparatu.nadpisania, galaz?.overrides);
  const zmienPoleAparatu = useCallback((parametr: ParametrAparatuSn, wartosc: string) => {
    setFormularzAparatu((p) => (p ? { ...p, [parametr]: wartosc } : p));
  }, []);

  const liczbaDoZapisu = wypelnione.length + liczbaZmianNcRfg + (zmianaAparatu ? 1 : 0);
  const brakElementu = !elementRef;
  const kompletne = Boolean(elementRef && liczbaDoZapisu > 0);

  const dodajWiersz = useCallback(() => {
    setWiersze((p) => [...p, { klucz: '', wartosc: '' }]);
  }, []);
  const usunWiersz = useCallback((index: number) => {
    setWiersze((p) => (p.length <= 1 ? p : p.filter((_, i) => i !== index)));
  }, []);
  const zmienWiersz = useCallback((index: number, pole: keyof WierszParametru, value: string) => {
    setWiersze((p) => p.map((w, i) => (i === index ? { ...w, [pole]: value } : w)));
  }, []);

  const onZapisz = useCallback(async () => {
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    if (!elementRef) {
      setBladGlobalny(T.brakElementuWalid);
      return;
    }
    if (wynikDanychModulu?.stan === 'blad') {
      setBladGlobalny(T.bledneDaneModulu);
      return;
    }
    if (wynikAparatu?.rodzaj === 'blad') {
      setBladGlobalny(T.bledneWartosciAparatu);
      return;
    }
    if (liczbaDoZapisu === 0) {
      setBladGlobalny(T.brakParametrow);
      return;
    }
    const parameters = wypelnione.reduce<Record<string, unknown>>((acc, w) => {
      acc[w.klucz.trim()] = parsujWartosc(w.wartosc, w.klucz);
      return acc;
    }, { ...zmianyNcRfg });
    if (zmianaAparatu && wynikAparatu?.rodzaj === 'lista') parameters.overrides = wynikAparatu.nadpisania;
    const payload: Record<string, unknown> = { element_ref: elementRef, parameters };

    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId, 'update_element_parameters', payload);
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, { type: fallbackType, name: elementRef });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, closeForm, elementRef, executeDomainOperation, fallbackType, liczbaDoZapisu, powod, selekcjaPoOperacji, wynikAparatu, wynikDanychModulu, wypelnione, zmianaAparatu, zmianyNcRfg]);

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszElement, stan: elementRef ? 'kompletne' : 'brak', wartosc: nazwaElementu || 'Brak' },
    {
      etykieta: T.wierszParametry,
      stan: liczbaDoZapisu > 0 ? 'kompletne' : 'brak',
      wartosc: `${liczbaDoZapisu} do zapisu`,
    },
    ...(formularzAparatu
      ? [
          {
            etykieta: T.wierszAparat,
            stan: wynikAparatu?.rodzaj === 'blad' ? ('brak' as const) : ('kompletne' as const),
            wartosc:
              wynikAparatu?.rodzaj === 'lista' ? `${wynikAparatu.nadpisania.length} z 4` : T.aparatBladLiczby,
          },
        ]
      : []),
    ...(formularzAparatu
      ? [{ etykieta: T.wierszPowod, stan: powod.trim() ? ('kompletne' as const) : ('ostrzezenie' as const), wartosc: powod.trim() ? 'Podane' : 'Brak' }]
      : []),
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-edycja-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  return (
    <KreatorRama
      eyebrow={T.eyebrow}
      tytul={T.tytul}
      cel={T.cel}
      odznaka={T.odznaka}
      pelny
      aside={aside}
      bladGlobalny={bladGlobalny}
      walidacja={!kompletne ? T.walidacjaStopka : null}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !kompletne || !activeCaseId, testid: 'mvd-kreator-edycja-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-edycja-anuluj' }}
      testid="mvd-kreator-edycja"
    >
      {brakElementu ? (
        <KreatorSekcja tytul={T.brakElementuTytul} testid="mvd-kreator-edycja-brak">
          <KreatorInfo>{T.brakElementuOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      <KreatorSekcja tytul={T.elementTytul} testid="mvd-kreator-edycja-element">
        <KreatorInfo>{T.elementPomoc}</KreatorInfo>
        <KreatorSiatka kolumny={2}>
          <RzadWartosci etykieta={T.element} wartosc={nazwaElementu || '—'} />
          <RzadWartosci etykieta={T.zrodloParametrow} wartosc={zrodloParametrow || 'nieznane'} />
        </KreatorSiatka>
      </KreatorSekcja>

      {generator && daneModulu ? (
        <KreatorSekcja tytul={T.daneModuluTytul} testid="mvd-kreator-edycja-dane-modulu">
          <KreatorInfo>{T.daneModuluPomoc}</KreatorInfo>
          <SekcjaDanychModulu
            formularz={daneModulu}
            bledy={wynikDanychModulu?.stan === 'blad' ? wynikDanychModulu.bledy : {}}
            onZmien={setDaneModulu}
            testid="mvd-kreator-edycja-ncrfg"
          />
        </KreatorSekcja>
      ) : null}

      {formularzAparatu ? (
        <KreatorSekcja tytul={T.aparatTytul} testid="mvd-kreator-edycja-aparat">
          <KreatorInfo>{T.aparatPomoc}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            {PARAMETRY_APARATU_SN.map((parametr) => (
              <PoleTekstowe
                key={parametr}
                etykieta={T.aparatEtykiety[parametr]}
                wartosc={formularzAparatu[parametr]}
                onZmiana={(v) => zmienPoleAparatu(parametr, v)}
                placeholder={T.aparatPlaceholder}
                pomoc={podpowiedzAparatu(pozycjaAparatu, parametr)}
                blad={
                  wynikAparatu?.rodzaj === 'blad' && wynikAparatu.parametr === parametr
                    ? T.aparatBladLiczby
                    : undefined
                }
                fokus={poleAparatuZKontekstu === parametr}
                testid={`mvd-kreator-edycja-aparat-${parametr}`}
              />
            ))}
          </KreatorSiatka>
          <PoleTekstowe
            etykieta={T.powod}
            wartosc={powod}
            onZmiana={setPowod}
            placeholder={T.powodPlaceholder}
            testid="mvd-kreator-edycja-powod"
          />
        </KreatorSekcja>
      ) : null}

      <KreatorSekcja tytul={T.parametryTytul} testid="mvd-kreator-edycja-parametry">
        <KreatorInfo>{T.parametryPomoc}</KreatorInfo>
        {wiersze.map((w, i) => (
          <KreatorSiatka kolumny={2} key={`param-${i}`}>
            <PoleTekstowe
              etykieta={T.klucz}
              wartosc={w.klucz}
              onZmiana={(v) => zmienWiersz(i, 'klucz', v)}
              placeholder={T.kluczPlaceholder}
              testid={`mvd-kreator-edycja-klucz-${i}`}
            />
            {slownikDlaKlucza(w.klucz) ? (
              <PoleWyboru
                etykieta={T.wartosc}
                wartosc={w.wartosc}
                onZmiana={(v) => zmienWiersz(i, 'wartosc', v)}
                opcje={[{ id: '', etykieta: T.wartoscZeSlownika }, ...(slownikDlaKlucza(w.klucz) ?? [])]}
                fokus={i === 0 && initialKey !== ''}
                testid={`mvd-kreator-edycja-wartosc-${i}`}
              />
            ) : (
              <PoleTekstowe
                etykieta={T.wartosc}
                wartosc={w.wartosc}
                onZmiana={(v) => zmienWiersz(i, 'wartosc', v)}
                placeholder={T.wartoscPlaceholder}
                fokus={i === 0 && initialKey !== ''}
                testid={`mvd-kreator-edycja-wartosc-${i}`}
              />
            )}
            {wiersze.length > 1 ? (
              <button
                type="button"
                className="mvd-kreator-btn"
                data-testid={`mvd-kreator-edycja-usun-${i}`}
                onClick={() => usunWiersz(i)}
              >
                {T.usunWiersz}
              </button>
            ) : null}
          </KreatorSiatka>
        ))}
        <button
          type="button"
          className="mvd-kreator-btn"
          data-testid="mvd-kreator-edycja-dodaj"
          onClick={dodajWiersz}
        >
          {T.dodajWiersz}
        </button>

        <PanelTeorii
          tytul={T.teoriaTytul}
          opis={T.teoriaOpis}
          wymog={T.teoriaWymog}
          podstawa={T.teoriaPodstawa}
          testid="mvd-kreator-edycja-teoria"
        />
      </KreatorSekcja>
    </KreatorRama>
  );
}
