/**
 * Kreator „Edycja parametrów elementu" (update_element_parameters) — ui2, kreatory/rama.
 *
 * Ekspercki override pól elementu. Zapis = operacja domenowa `update_element_parameters`,
 * której kontrakt to `element_ref` + `parameters` (mapa) + opcjonalny `reason`.
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
 *
 * LINIA NAPOWIETRZNA 110 kV: linia z wiązaniem PRZEWOD_LINII_WN (albo na szynie o napięciu
 * przewodu z katalogu) dostaje sekcję przewodu fazowego i geometrii słupa (`SekcjaLiniiWn`).
 * Zapis: `geometria_slupa` w tej samej operacji `update_element_parameters` co pozostałe pola,
 * a zmiana przewodu — następnie `assign_catalog_to_element` (backend przelicza R′, X′, B′, Z′0
 * linii z geometrii przy każdej z tych operacji; kolejność daje jedno przeliczenie na danych
 * końcowych przy zmianie obu).
 *
 * WARTOŚCI PROJEKTANTA MASZYNY WIRUJĄCEJ (karta PODSTAWA-Q, zasada nr 4): generator, którego rodzaj
 * jest maszyną wirującą w rejestrze backendu (synchroniczna, asynchroniczna klatkowa albo dwustronnie
 * zasilana), dostaje sekcję parametrów zwarciowych (moc znamionowa S_rG albo P_rM, x″d, cos φ, p,
 * I_LR/I_rM, η — zestaw rodziny z `GET /api/catalog/maszyny-wirujace/wartosci-robocze`). Ta sama
 * mechanika listy `overrides` (`wartosciRoboczeWspolne.ts`), brama wartości w operacji domenowej.
 * Podpowiedź pola mocy znamionowej podaje regułę z rejestru (wyznaczenie P_rM z S_rM tabliczki
 * albo propozycja z punktu pracy elementu) — bez liczby liczonej w UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import {
  fetchKatalogPrzewodowLiniiWn,
  fetchMvApparatusTypes,
  fetchRejestrMaszynWirujacych,
} from '../../../ui/catalog/api';
import { buildCatalogBinding } from '../../../ui/catalog/catalogBinding';
import type {
  KatalogPrzewodowLiniiWn,
  MVApparatusType,
  ParametrMaszynyRejestru,
  RejestrMaszynWirujacych,
} from '../../../ui/catalog/types';
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
import {
  NAMESPACE_PRZEWOD_LINII_WN,
  formularzZLinii,
  geometriaZFormularza,
  geometriaZmieniona,
  jestLiniaNapowietrzna,
  liniaWnWgKatalogu,
  podzialPrzewodow,
  przewodZmieniony,
  type FormularzLiniiWn,
} from './geometriaLiniiWn';
import { SekcjaLiniiWn } from './SekcjaLiniiWn';
import {
  formularzZNadpisanRejestru,
  nadpisaniaZFormularzaRejestru,
  nadpisaniaZmienioneRejestru,
  type FormularzWartosci,
} from './wartosciRoboczeWspolne';
import {
  czyRejestrMaszyn,
  parametryMaszynyGeneratora,
  zrodloParametruMaszyny,
} from './wartosciRoboczeMaszyny';
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

/** Etykieta pola parametru maszyny z opisu rejestru backendu: nazwa, symbol i jednostka. */
function etykietaParametruMaszyny(opis: ParametrMaszynyRejestru): string {
  const jednostka = opis.jednostka === '1' ? '' : ` [${opis.jednostka}]`;
  return `${opis.nazwa_pl.charAt(0).toUpperCase()}${opis.nazwa_pl.slice(1)} ${opis.symbol}${jednostka}`;
}

/** Podpowiedź pola maszyny: co obliczenie przyjmie, gdy projektant nie poda wartości. */
function podpowiedzMaszyny(
  tabliczka: Readonly<Record<string, unknown>> | null | undefined,
  opis: ParametrMaszynyRejestru,
): string {
  const zrodlo = zrodloParametruMaszyny(tabliczka, opis);
  const jednostka = opis.jednostka === '1' ? '' : ` ${opis.jednostka}`;
  if (zrodlo.rodzaj === 'tabliczka') {
    return `${T.maszynaZTabliczki} ${liczbaPl(zrodlo.wartosc)}${jednostka}.`;
  }
  if (zrodlo.rodzaj === 'wyznaczenie') {
    return `${T.maszynaWyznaczenie} ${zrodlo.opis}.`;
  }
  const rodzaj = T.aparatRodzajZrodla[zrodlo.rodzajZrodla] ?? zrodlo.rodzajZrodla;
  if (zrodlo.rodzaj === 'propozycja_elementu') {
    return `${T.maszynaPropozycja} (${rodzaj}): ${zrodlo.regula}.`;
  }
  return `${T.maszynaPropozycja} ${liczbaPl(zrodlo.wartosc)}${jednostka} (${rodzaj}).`;
}

/** Konwersja tekstu na typ: liczba / tak-nie / brak wartości wykrywane automatycznie, reszta jako tekst. */
function parsujWartosc(raw: string): string | number | boolean | null {
  const trimmed = raw.trim();
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
  // `overrides` (akcja naprawcza blokady E011 — wartość projektanta spoza bramy) wskazuje całą
  // sekcję aparatu: kursor w pierwszym polu.
  const poleAparatuZKontekstu = !jestAparatSn
    ? null
    : jestParametremAparatuSn(poleKontekstu)
      ? poleKontekstu
      : poleKontekstu === 'overrides'
        ? PARAMETRY_APARATU_SN[0]
        : null;

  // Pole wskazane przez kontekst (akcja naprawcza gotowości, C-12): klucz pierwszego
  // wiersza i kursor w polu jego wartości — projektant wpisuje od razu brakującą daną.
  // Klucz startowy: jawne `field` kontekstu albo `required` z `payload_hint` akcji naprawczej
  // bramki (np. transformer.lv_earthing_system_missing → `lv_earthing_system`). `required` bywa też
  // opisem wymogu, nie kluczem parametru (`continuous_path_to_source`) — przyjmujemy go
  // wyłącznie, gdy jest kluczem ze słownika kontraktu (jedno źródło: SLOWNIKI_STATYCZNE
  // + `vector_group`), inaczej formularz zaczynałby się od klucza, którego backend nie zna.
  // Parametr aparatu SN wskazany kontekstem (akcja „Zmień wartość" ekranu wytrzymałości)
  // trafia do sekcji aparatu, nie do wiersza klucz → wartość.
  // Geometria słupa linii (akcja naprawcza `line.geometria_wartosc_robocza`) trafia do sekcji
  // linii 110 kV — to struktura, nie wartość wiersza klucz → wartość.
  const poleGeometriiZKontekstu =
    jestLiniaNapowietrzna(galaz) && poleKontekstu === 'geometria_slupa';
  // Generator: akcja naprawcza założenia `fault.parametry_maszyny_robocze` wskazuje `overrides`
  // (nośnik wartości projektanta maszyny) — to sekcja maszyny, nie wiersz klucz → wartość.
  const generatorZKontekstu = useSnapshotStore(
    (s) => s.snapshot?.generators?.some((g) => g.ref_id === elementRef) ?? false,
  );
  const poleMaszynyZKontekstu = generatorZKontekstu && poleKontekstu === 'overrides';
  const initialKey = poleAparatuZKontekstu || poleGeometriiZKontekstu || poleMaszynyZKontekstu
    ? ''
    : poleKontekstu || kluczZWymogu(readString(context?.required));
  const [wiersze, setWiersze] = useState<WierszParametru[]>(() => [
    { klucz: initialKey, wartosc: readString(context?.value) },
  ]);
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

  // Linia napowietrzna 110 kV: katalog przewodów (z propozycjami wartości roboczych) pobierany
  // dla każdej linii napowietrznej — o pokazaniu sekcji rozstrzyga wiązanie albo napięcie
  // szyny równe napięciu przewodu z katalogu (dana katalogu, nie próg w UI).
  const jestLiniaNapowietrznaGalaz = jestLiniaNapowietrzna(galaz);
  const [katalogLiniiWn, setKatalogLiniiWn] = useState<KatalogPrzewodowLiniiWn | null>(null);
  useEffect(() => {
    if (!jestLiniaNapowietrznaGalaz) return undefined;
    let aktywny = true;
    fetchKatalogPrzewodowLiniiWn()
      .then((katalog) => {
        if (aktywny) setKatalogLiniiWn(katalog);
      })
      // Bez katalogu sekcja się nie pojawia — zapis pozostałych pól działa bez zmian.
      .catch(() => undefined);
    return () => {
      aktywny = false;
    };
  }, [jestLiniaNapowietrznaGalaz]);
  const napiecieSzynyKv = useSnapshotStore((s) => {
    const ref = galaz && 'from_bus_ref' in galaz ? galaz.from_bus_ref : null;
    return s.snapshot?.buses?.find((b) => b.ref_id === ref)?.voltage_kv ?? null;
  });
  const czestotliwoscHz = useSnapshotStore((s) => s.snapshot?.header?.defaults?.frequency_hz ?? null);
  const przewodyLiniiWn = useMemo(
    () => podzialPrzewodow(katalogLiniiWn?.przewody ?? []),
    [katalogLiniiWn],
  );
  const jestLiniaWn =
    katalogLiniiWn !== null && liniaWnWgKatalogu(galaz, napiecieSzynyKv, przewodyLiniiWn.fazowe);
  const [formularzLinii, setFormularzLinii] = useState<FormularzLiniiWn | null>(null);
  useEffect(() => {
    if (jestLiniaWn && formularzLinii === null) setFormularzLinii(formularzZLinii(galaz));
  }, [jestLiniaWn, galaz, formularzLinii]);
  const wynikGeometrii = useMemo(
    () => (formularzLinii ? geometriaZFormularza(formularzLinii) : null),
    [formularzLinii],
  );
  const zmianaGeometrii = formularzLinii !== null && geometriaZmieniona(formularzLinii, galaz);
  const zmianaPrzewodu = formularzLinii !== null && przewodZmieniony(formularzLinii, galaz);


  // Karta PODSTAWA-Q: sekcja maszyny wirującej — rodzina i parametry z rejestru backendu.
  const [rejestrMaszyn, setRejestrMaszyn] = useState<RejestrMaszynWirujacych | null>(null);
  const [rejestrMaszynNiedostepny, setRejestrMaszynNiedostepny] = useState(false);
  const generatorRef = generator?.ref_id ?? '';
  useEffect(() => {
    if (!generatorRef) return undefined;
    let aktywny = true;
    fetchRejestrMaszynWirujacych()
      .then((rejestr: unknown) => {
        if (!aktywny) return;
        if (czyRejestrMaszyn(rejestr)) setRejestrMaszyn(rejestr);
        else setRejestrMaszynNiedostepny(true);
      })
      .catch(() => {
        if (aktywny) setRejestrMaszynNiedostepny(true);
      });
    return () => {
      aktywny = false;
    };
  }, [generatorRef]);
  const parametryMaszyny = useMemo(
    () => parametryMaszynyGeneratora(rejestrMaszyn, generator?.gen_type),
    [rejestrMaszyn, generator],
  );
  const kluczeMaszyny = useMemo(
    () => (parametryMaszyny ?? []).map((p) => p.parametr),
    [parametryMaszyny],
  );
  const [formularzMaszyny, setFormularzMaszyny] = useState<FormularzWartosci | null>(null);
  useEffect(() => {
    if (parametryMaszyny && formularzMaszyny === null) {
      setFormularzMaszyny(formularzZNadpisanRejestru(kluczeMaszyny, generator?.overrides));
    }
  }, [parametryMaszyny, kluczeMaszyny, generator, formularzMaszyny]);
  const wynikMaszyny = useMemo(
    () =>
      formularzMaszyny && parametryMaszyny
        ? nadpisaniaZFormularzaRejestru(kluczeMaszyny, formularzMaszyny, generator?.overrides, powod)
        : null,
    [formularzMaszyny, parametryMaszyny, kluczeMaszyny, generator, powod],
  );
  const zmianaMaszyny =
    wynikMaszyny?.rodzaj === 'lista'
    && nadpisaniaZmienioneRejestru(wynikMaszyny.nadpisania, generator?.overrides);
  const zmienPoleMaszyny = useCallback((parametr: string, wartosc: string) => {
    setFormularzMaszyny((p) => (p ? { ...p, [parametr]: wartosc } : p));
  }, []);

  const liczbaDoZapisu =
    wypelnione.length
    + liczbaZmianNcRfg
    + (zmianaAparatu ? 1 : 0)
    + (zmianaGeometrii ? 1 : 0)
    + (zmianaPrzewodu ? 1 : 0)
    + (zmianaMaszyny ? 1 : 0);
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
    if (wynikGeometrii?.rodzaj === 'blad') {
      setBladGlobalny(T.bledneDaneLiniiWn);
      return;
    }
    if (wynikMaszyny?.rodzaj === 'blad') {
      setBladGlobalny(T.bledneWartosciMaszyny);
      return;
    }
    if (liczbaDoZapisu === 0) {
      setBladGlobalny(T.brakParametrow);
      return;
    }
    const parameters = wypelnione.reduce<Record<string, unknown>>((acc, w) => {
      acc[w.klucz.trim()] = parsujWartosc(w.wartosc);
      return acc;
    }, { ...zmianyNcRfg });
    if (zmianaAparatu && wynikAparatu?.rodzaj === 'lista') parameters.overrides = wynikAparatu.nadpisania;
    if (zmianaGeometrii && wynikGeometrii?.rodzaj === 'geometria') {
      parameters.geometria_slupa = wynikGeometrii.geometria;
    }
    if (zmianaMaszyny && wynikMaszyny?.rodzaj === 'lista') parameters.overrides = wynikMaszyny.nadpisania;
    const payload: Record<string, unknown> = { element_ref: elementRef, parameters };
    if (powod.trim()) payload.reason = powod.trim();

    setBladGlobalny(null);
    try {
      let response: Awaited<ReturnType<typeof executeDomainOperation>> = null;
      if (Object.keys(parameters).length > 0) {
        response = await executeDomainOperation(activeCaseId, 'update_element_parameters', payload);
        if (!response) {
          setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
          return;
        }
        if (response.error) {
          setBladGlobalny(response.error);
          return;
        }
      }
      if (zmianaPrzewodu && formularzLinii) {
        response = await executeDomainOperation(activeCaseId, 'assign_catalog_to_element', {
          element_ref: elementRef,
          catalog_binding: buildCatalogBinding(NAMESPACE_PRZEWOD_LINII_WN, formularzLinii.przewodId),
          source_mode: 'KATALOG',
        });
        if (!response) {
          setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
          return;
        }
        if (response.error) {
          setBladGlobalny(response.error);
          return;
        }
      }
      if (!response) {
        setBladGlobalny(T.brakParametrow);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, { type: fallbackType, name: elementRef });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, closeForm, elementRef, executeDomainOperation, fallbackType, formularzLinii, liczbaDoZapisu, powod, selekcjaPoOperacji, wynikAparatu, wynikDanychModulu, wynikGeometrii, wynikMaszyny, wypelnione, zmianaAparatu, zmianaGeometrii, zmianaMaszyny, zmianaPrzewodu, zmianyNcRfg]);

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
    ...(formularzLinii
      ? [
          {
            etykieta: T.wierszLiniaWn,
            stan: wynikGeometrii?.rodzaj === 'blad' ? ('brak' as const) : ('kompletne' as const),
            wartosc:
              wynikGeometrii?.rodzaj === 'blad'
                ? T.bledneDaneLiniiWn
                : zmianaGeometrii || zmianaPrzewodu
                  ? T.liniaWnDoZapisu
                  : T.liniaWnBezZmian,
          },
        ]
      : []),
    ...(formularzMaszyny && parametryMaszyny
      ? [
          {
            etykieta: T.wierszMaszyna,
            stan: wynikMaszyny?.rodzaj === 'blad' ? ('brak' as const) : ('kompletne' as const),
            wartosc:
              wynikMaszyny?.rodzaj === 'lista'
                ? `${wynikMaszyny.nadpisania.length} z ${parametryMaszyny.length}`
                : T.maszynaBladLiczby,
          },
        ]
      : []),
    { etykieta: T.wierszPowod, stan: powod.trim() ? 'kompletne' : 'ostrzezenie', wartosc: powod.trim() ? 'Podane' : 'Brak' },
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
        </KreatorSekcja>
      ) : null}

      {formularzLinii && katalogLiniiWn && czestotliwoscHz !== null ? (
        <SekcjaLiniiWn
          formularz={formularzLinii}
          onZmien={setFormularzLinii}
          przewodyFazowe={przewodyLiniiWn.fazowe}
          przewodyOdgromowe={przewodyLiniiWn.odgromowe}
          propozycje={katalogLiniiWn.wartosci_robocze}
          bladPola={wynikGeometrii?.rodzaj === 'blad' ? wynikGeometrii.pole : null}
          czestotliwoscHz={czestotliwoscHz}
          fokusGeometrii={poleGeometriiZKontekstu}
        />
      ) : null}

      {formularzMaszyny && parametryMaszyny ? (
        <KreatorSekcja tytul={T.maszynaTytul} testid="mvd-kreator-edycja-maszyna">
          <KreatorInfo>{T.maszynaPomoc}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            {parametryMaszyny.map((opis, i) => (
              <PoleTekstowe
                key={opis.parametr}
                etykieta={etykietaParametruMaszyny(opis)}
                wartosc={formularzMaszyny[opis.parametr] ?? ''}
                onZmiana={(v) => zmienPoleMaszyny(opis.parametr, v)}
                placeholder={T.maszynaPlaceholder}
                pomoc={podpowiedzMaszyny(generator?.materialized_params, opis)}
                blad={
                  wynikMaszyny?.rodzaj === 'blad' && wynikMaszyny.parametr === opis.parametr
                    ? T.maszynaBladLiczby
                    : undefined
                }
                fokus={poleMaszynyZKontekstu && i === 0}
                testid={`mvd-kreator-edycja-maszyna-${opis.parametr}`}
              />
            ))}
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}

      {generator && rejestrMaszynNiedostepny ? (
        <KreatorSekcja tytul={T.maszynaTytul} testid="mvd-kreator-edycja-maszyna-niedostepna">
          <KreatorInfo>{T.maszynaRejestrNiedostepny}</KreatorInfo>
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

        <PoleTekstowe
          etykieta={T.powod}
          wartosc={powod}
          onZmiana={setPowod}
          placeholder={T.powodPlaceholder}
          testid="mvd-kreator-edycja-powod"
        />

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
