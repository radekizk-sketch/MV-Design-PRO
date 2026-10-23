/**
 * DOMKNIĘCIE KLASY „dane przyjęte wyniku" (kontrakt werdyktu §3, ZASADA NR 4 pkt 4).
 *
 * Zbiór EMITERÓW backendu pary `status_danych` + `dane_przyjete` (pola addytywne odpowiedzi,
 * pomocnik `pola_danych_przyjetych_biegu/_wiersza` albo pole `status_danych` rekordu werdyktu)
 * musi być RÓWNY zbiorowi kluczy rejestru niżej — nowy emiter bez decyzji o ekranie albo
 * wpis rejestru bez emitera czerwienią test. Każdy emiter z ekranem wskazuje czytelników:
 * plik ekranu musi renderować wspólny zapis `<StanDanychWyniku`, a plik typu odpowiedzi musi
 * nieść typ pary wyprowadzony z kontraktu (`ParaDanychPrzyjetych` albo `StatusDanych` rekordu
 * werdyktu). Strona frontu domknięta odwrotnie: KAŻDY plik produkcyjny renderujący
 * `<StanDanychWyniku` jest czytelnikiem zarejestrowanego emitera.
 *
 * Emitery bez ekranu są wypisane jawnie z dowodem (końcówka bez wywołania we froncie) — nie
 * buduje się dla nich ekranu w ciemno; emitery wewnętrzne (zapis założeń w surowym wyniku,
 * czytelnik eksportu raportu) są nazwane z rolą.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const MV = join(__dirname, '..', '..', '..', '..', '..', '..');
const BACKEND = join(MV, 'backend', 'src');
const FRONT = join(MV, 'frontend', 'src');

interface Czytelnik {
  /** Plik ekranu (względem `frontend/src`) — renderuje `<StanDanychWyniku`. */
  readonly ekran: string;
  /** Plik typu odpowiedzi (względem `frontend/src`) — niesie typ pary z kontraktu. */
  readonly typ: string;
}

/** Końcówka API bez wywołania we froncie — dowodem jest brak wzorca w `frontend/src`. */
interface KoncowkaBezEkranu {
  readonly koncowka: string;
  readonly wzorzec_frontu: string;
}

type WpisRejestru =
  | {
      readonly rodzaj: 'ekran';
      readonly czytelnicy: readonly Czytelnik[];
      /** Inne końcówki tego samego emitera, których front nie wywołuje (jawnie, z dowodem). */
      readonly koncowki_bez_ekranu?: readonly KoncowkaBezEkranu[];
    }
  | ({ readonly rodzaj: 'bez_ekranu' } & KoncowkaBezEkranu)
  | { readonly rodzaj: 'wewnetrzny'; readonly rola_pl: string };

const ZWARCIA_API = 'ui2/wyniki/zwarcia/api.ts';
const JAKOSC_API = 'ui2/wyniki/jakosc/api.ts';
const OZE_API = 'ui2/oze/api.ts';
const EKRAN_JAKOSCI = 'ui2/wyniki/jakosc/EkranJakosci.tsx';
const LV_TYPY = 'ui/sld/v3/lv-domain/types.ts';
const LV_WIDOK = 'ui/sld/v3/lv-domain/LvDomainView.tsx';

/** Rejestr emiter → czytelnicy. Klucze: ścieżki względem `backend/src`. */
const REJESTR: Readonly<Record<string, WpisRejestru>> = {
  'api/proof_pack.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: 'ui2/wyniki/zwarcia/WkladyZwarciowe.tsx', typ: ZWARCIA_API }],
  },
  'enm/canonical_analysis.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: 'ui2/wyniki/zwarcia/RozplywZwarciowy.tsx', typ: ZWARCIA_API }],
  },
  'application/analyses/sanity_bounds.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      { ekran: EKRAN_JAKOSCI, typ: JAKOSC_API },
      { ekran: 'ui2/wyniki/jakosc/SekcjaPasmRozplywu.tsx', typ: JAKOSC_API },
    ],
  },
  'application/analyses/energy_validation/service.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      { ekran: EKRAN_JAKOSCI, typ: JAKOSC_API },
      { ekran: 'ui2/wyniki/rozplyw/TabelaGalezi.tsx', typ: JAKOSC_API },
      { ekran: 'ui2/wyniki/rozplyw/TabelaSzyn.tsx', typ: JAKOSC_API },
    ],
  },
  'application/analyses/migotanie.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: EKRAN_JAKOSCI, typ: JAKOSC_API }],
  },
  'application/analyses/arc_flash_view.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: EKRAN_JAKOSCI, typ: JAKOSC_API }],
  },
  'application/analyses/warunki_przylaczenia.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: EKRAN_JAKOSCI, typ: JAKOSC_API }],
  },
  'application/analyses/wytrzymalosc_cieplna_przewodow.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: EKRAN_JAKOSCI, typ: JAKOSC_API }],
  },
  'application/analyses/werdykt_projektowy.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: 'ui2/wyniki/ocena/EkranOceny.tsx', typ: 'ui2/wyniki/ocena/api.ts' }],
  },
  'application/analyses/grid_strength.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: 'ui2/oze/pulpit/SekcjaSilySieci.tsx', typ: OZE_API }],
  },
  'application/analyses/reactive_adequacy.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: 'ui2/oze/pulpit/SekcjaAdekwatnosciQ.tsx', typ: OZE_API }],
  },
  'application/analyses/hosting_capacity.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      { ekran: 'ui2/oze/zdolnosc/EkranZdolnosci.tsx', typ: OZE_API },
      { ekran: 'ui2/oze/ranking/EkranRankingu.tsx', typ: OZE_API },
    ],
  },
  'application/analyses/pq_area.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: 'ui2/oze/obszar/EkranObszaruPQ.tsx', typ: OZE_API }],
  },
  'application/analyses/dobor_kompensacji.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: 'ui2/oze/kompensacja/EkranKompensacji.tsx', typ: OZE_API }],
  },
  'application/analyses/odpowiedz_osd.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: 'ui2/oze/osd/EkranOsd.tsx', typ: OZE_API }],
  },
  'application/analyses/wniosek_osd.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: 'ui2/oze/wniosek/EkranWniosku.tsx', typ: 'ui2/oze/ncrfg/typy.ts' }],
  },
  'application/analyses/wrazliwosc_rozplywu.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      { ekran: 'ui2/wyniki/wrazliwosc/EkranWrazliwosci.tsx', typ: 'ui2/wyniki/wrazliwosc/api.ts' },
    ],
  },
  'application/analyses/kontyngencje_n1.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      {
        ekran: 'ui2/wyniki/kontyngencje/EkranKontyngencji.tsx',
        typ: 'ui2/wyniki/kontyngencje/api.ts',
      },
    ],
  },
  'api/generators.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      {
        ekran: 'ui/network-build/station-der/DoborPrzekladnikowSekcja.tsx',
        typ: 'ui/network-build/station-der/DoborPrzekladnikowSekcja.tsx',
      },
    ],
  },
  'application/proof_engine/pakiet_nastaw.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      {
        ekran: 'ui2/wyniki/koordynacja/SekcjaNastaw.tsx',
        typ: 'ui2/wyniki/koordynacja/nastawyApi.ts',
      },
    ],
  },
  'application/analyses/swz/werdykt.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: 'ui/sld/v3/lv-domain/KartaObwoduNn.tsx', typ: 'ui/sld/v3/canvas/overlay.ts' }],
  },
  'application/analyses/lv_domain/upstream_equivalent.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: LV_WIDOK, typ: LV_TYPY }],
  },
  'application/analyses/voltage_profile_view.py': {
    rodzaj: 'ekran',
    czytelnicy: [{ ekran: LV_WIDOK, typ: LV_TYPY }],
  },
  'network_model/solvers/parametry_linii_napowietrznej.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      { ekran: 'ui2/kreatory/edycja-parametrow/SekcjaLiniiWn.tsx', typ: 'ui/catalog/types.ts' },
    ],
  },
  // Rekord werdyktu: para w `dowod.status_danych` (StatusDanych) — każdy rekord (dynamika,
  // NC RfG, dobory, SWZ TT/IT, ochrona LOM, ocena nadprądowa) czyta ją karta werdyktu albo
  // wiersz oceny nadprądowej przez `paraDanychDowodu`.
  'werdykt/kontrakt.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      { ekran: 'ui2/wyniki/wzorzec/KartaWerdyktu.tsx', typ: 'ui2/wyniki/wzorzec/werdykt.ts' },
      {
        ekran: 'ui2/wyniki/koordynacja/SekcjaOcenyZabezpieczen.tsx',
        typ: 'ui2/wyniki/wzorzec/werdykt.ts',
      },
    ],
  },
  // Fabryka rekordu „ocena niewykonana" (kontrakt werdyktu) — status danych w dowodzie rekordu.
  'application/ocena_niewykonana.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      { ekran: 'ui2/wyniki/wzorzec/KartaWerdyktu.tsx', typ: 'ui2/wyniki/wzorzec/werdykt.ts' },
    ],
  },
  'application/dynamika/opis_wyniku.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      { ekran: 'ui2/wyniki/wzorzec/KartaWerdyktu.tsx', typ: 'ui2/wyniki/wzorzec/werdykt.ts' },
    ],
  },
  // Emitery bez ekranu — końcówka nie ma wywołania we froncie (dowód: wzorzec niżej
  // nie występuje w `frontend/src`). Ekranu nie buduje się w ciemno.
  'application/analyses/nn_device_selection.py': {
    rodzaj: 'bez_ekranu',
    koncowka: 'GET /api/cases/{case_id}/enm/nn-device-selection',
    wzorzec_frontu: 'nn-device-selection',
  },
  'application/analyses/nn_circuit_sheet.py': {
    rodzaj: 'bez_ekranu',
    koncowka: 'GET /api/cases/{case_id}/enm/nn-circuit-sheet',
    wzorzec_frontu: 'nn-circuit-sheet',
  },
  'application/equipment_proof/types.py': {
    rodzaj: 'bez_ekranu',
    koncowka: 'POST /api/equipment-proof/pack',
    wzorzec_frontu: 'equipment-proof',
  },
  // Widok parametrów linii 110 kV: podgląd (`POST /api/catalog/overhead-conductor-types/{id}/
  // parametry-linii`) czyta kreator edycji linii; ślad linii modelu nie ma wywołania we froncie.
  'application/parametry_linii_wn.py': {
    rodzaj: 'ekran',
    czytelnicy: [
      { ekran: 'ui2/kreatory/edycja-parametrow/SekcjaLiniiWn.tsx', typ: 'ui/catalog/types.ts' },
    ],
    koncowki_bez_ekranu: [
      {
        koncowka: 'GET /api/cases/{case_id}/enm/parametry-linii (ślad linii modelu)',
        wzorzec_frontu: 'enm/parametry-linii',
      },
    ],
  },
  // Wewnętrzne: budowa pary i zapis założeń w surowym wyniku, czytelnik eksportu.
  'enm/dane_przyjete_galezi.py': {
    rodzaj: 'wewnetrzny',
    rola_pl: 'pomocnik pary pola_danych_przyjetych_biegu/_wiersza i zapis założeń w raw_result',
  },
  'enm/parametry_linii_wn.py': {
    rodzaj: 'wewnetrzny',
    rola_pl: 'założenia linii 110 kV w raw_result, czytane przez dane_przyjete_galezi',
  },
  'api/analysis_run_exports.py': {
    rodzaj: 'wewnetrzny',
    rola_pl: 'czytelnik danych przyjętych w eksporcie raportu biegu (PDF/DOCX)',
  },
};

/** Emiter pary: pole odpowiedzi, pomocnik pary albo pole rekordu werdyktu. */
const WZORZEC_EMITERA =
  /"status_danych"|"dane_przyjete"|pola_danych_przyjetych_(?:biegu|wiersza)|^\s+status_danych:\s*StatusDanych\b/m;

function pliki(katalog: string, rozszerzenia: readonly string[]): string[] {
  const wynik: string[] = [];
  for (const nazwa of readdirSync(katalog)) {
    const sciezka = join(katalog, nazwa);
    if (statSync(sciezka).isDirectory()) {
      if (nazwa === '__tests__' || nazwa === 'node_modules' || nazwa === '__pycache__') continue;
      wynik.push(...pliki(sciezka, rozszerzenia));
    } else if (rozszerzenia.some((r) => nazwa.endsWith(r))) {
      wynik.push(sciezka);
    }
  }
  return wynik;
}

function wzgledna(baza: string, sciezka: string): string {
  return relative(baza, sciezka).split(sep).join('/');
}

function zrodloFrontu(plik: string): string {
  return readFileSync(join(FRONT, plik), 'utf-8');
}

/** Emitery wykryte w źródłach backendu (zbiór, posortowany — deterministyczny komunikat). */
function emiteryBackendu(): string[] {
  return pliki(BACKEND, ['.py'])
    .filter((p) => WZORZEC_EMITERA.test(readFileSync(p, 'utf-8')))
    .map((p) => wzgledna(BACKEND, p))
    .sort();
}

/** Pliki produkcyjne frontu renderujące wspólny zapis danych przyjętych. */
function czytelnicyFrontu(): string[] {
  return pliki(FRONT, ['.tsx'])
    .filter((p) => !/\.test\.tsx$/.test(p))
    .filter((p) => readFileSync(p, 'utf-8').includes('<StanDanychWyniku'))
    .map((p) => wzgledna(FRONT, p))
    .sort();
}

describe('dane przyjęte — domknięcie klasy emiter ↔ czytelnik', () => {
  it('zbiór emiterów backendu = zbiór kluczy rejestru (w obie strony)', () => {
    expect(emiteryBackendu()).toEqual(Object.keys(REJESTR).sort());
  });

  it('każdy czytelnik emitera renderuje wspólny zapis i czyta typ pary z kontraktu', () => {
    for (const [emiter, wpis] of Object.entries(REJESTR)) {
      if (wpis.rodzaj !== 'ekran') continue;
      expect(wpis.czytelnicy.length, emiter).toBeGreaterThan(0);
      for (const { ekran, typ } of wpis.czytelnicy) {
        expect(zrodloFrontu(ekran), `${emiter} → ${ekran}`).toContain('<StanDanychWyniku');
        expect(zrodloFrontu(typ), `${emiter} → typ ${typ}`).toMatch(
          /\bParaDanychPrzyjetych\b|\bStatusDanych\b/,
        );
      }
    }
  });

  it('każdy plik frontu z zapisem danych przyjętych jest czytelnikiem zarejestrowanego emitera', () => {
    const zarejestrowani = new Set(
      Object.values(REJESTR).flatMap((w) => (w.rodzaj === 'ekran' ? w.czytelnicy.map((c) => c.ekran) : [])),
    );
    // Sam komponent zapisu nie jest czytelnikiem (definicja); karta werdyktu jest (dowód).
    const czytelnicy = czytelnicyFrontu();
    expect(czytelnicy.filter((p) => !zarejestrowani.has(p))).toEqual([]);
    expect([...zarejestrowani].filter((p) => !czytelnicy.includes(p))).toEqual([]);
  });

  it('emitery bez ekranu: końcówka nie ma wywołania we froncie (dowód braku ekranu)', () => {
    const zrodla = pliki(FRONT, ['.ts', '.tsx'])
      .filter((p) => !/\.test\.tsx?$/.test(p))
      .map((p) => readFileSync(p, 'utf-8'));
    for (const [emiter, wpis] of Object.entries(REJESTR)) {
      const koncowki: readonly KoncowkaBezEkranu[] =
        wpis.rodzaj === 'bez_ekranu'
          ? [wpis]
          : wpis.rodzaj === 'ekran'
            ? (wpis.koncowki_bez_ekranu ?? [])
            : [];
      for (const { koncowka, wzorzec_frontu } of koncowki) {
        const wywolania = zrodla.filter((z) => z.includes(wzorzec_frontu));
        expect(wywolania, `${emiter}: ${koncowka}`).toEqual([]);
      }
    }
  });
});
