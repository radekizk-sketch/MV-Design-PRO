/**
 * S9-6 (karta „Eksport jako dokument", audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`
 * E-1…E-6) — JEDNO ŹRÓDŁO PRAWDY o formatach eksportu schematu.
 *
 * DLACZEGO TU (reguła KLASA, NIE INSTANCJA): audyt nazwał JEDNĄ instancję
 * (E-2 „DXF eksportuje pusty rysunek"), ale KLASĄ defektu było rozejście się
 * DWÓCH niezależnych list: tego, co menu OFERUJE (`FORMAT_DESCRIPTORS` w
 * komponencie menu), i tego, co kanał eksportu UMIE (rozgałęzienie `if
 * (format === …)` w tym samym komponencie, wołające generatory z PUSTYMI
 * tablicami wejścia). Rozjazd dawał trzy martwe pozycje (PDF/PNG — brak
 * pliku) i trzy pozorne sukcesy (DXF 176 B, SCD 169 B, CIM 220 B — plik
 * formalnie poprawny, ale bez ANI JEDNEJ encji).
 *
 * Odtąd zbiór OFEROWANY i zbiór OBSŁUGIWANY pochodzą z tego samego literału:
 * menu renderuje `SLD_EXPORT_FORMATS`, a wołający dostarcza mapę
 * `Record<SldExportFormat, …>` — TypeScript wymusza kompletność w czasie
 * kompilacji, a test odbioru (`__tests__/exportFormaty.test.tsx`) sprawdza na
 * REALNEJ scenie goldenowej, że każda pozycja zwraca plik z geometrią.
 * Dołożenie pozycji do tej tablicy BEZ implementacji nie skompiluje się.
 *
 * KARTA KASACJA-SCL-I-CIM-KLIENT (decyzja K-14/D-41, 2026-09-30) — JEDEN eksport
 * modelu sieci. Dawniej menu miało DWIE pozycje modelu liczone w KLIENCIE:
 * „SCD" (opis stacji SCL) — szkielet bez żadnego konsumenta — oraz „CIM" —
 * minimalny RDF z przeglądarki, podczas gdy backend miał pełny eksporter CGMES
 * EQ+TP bez końcówki. Dwie ścieżki jednego eksportu = defekt. Oba klientowe
 * eksportery SKASOWANE; pozycja modelu jest jedna (`cgmes`) i jej plik buduje
 * WYŁĄCZNIE backend (`GET /api/cases/{case_id}/enm/eksport-cgmes`). Moduł SCL
 * (opis stacji) nie istnieje świadomie: powstanie tylko po dostarczeniu danych
 * właściciela D1–D8, jako adapter backendowy (bramka wskrzeszenia klientowych
 * eksporterów: `scripts/legacy_public_path_guard.py`).
 */

/** Formaty oferowane w menu eksportu schematu. Lista ZAMKNIĘTA — patrz
 *  nagłówek: każda pozycja MUSI mieć implementację (bramka typu + test). */
export type SldExportFormat = 'svg' | 'pdf' | 'dxf' | 'cgmes';

/**
 * Z czego powstaje plik — JEDNO źródło decyzji, czy eksport potrzebuje
 * rysunku z kanwy (`rysunek`: arkusz SVG → SVG/PDF/DXF), czy modelu sieci po
 * stronie serwera (`model`: ENM → CGMES). Wołający nie zgaduje tego z `id`.
 */
export type SldExportSource = 'rysunek' | 'model';

export interface SldExportFormatDescriptor {
  readonly id: SldExportFormat;
  readonly labelPl: string;
  readonly descriptionPl: string;
  /** Rozszerzenie pliku (bez kropki) — część konwencji nazw (`exportNames.ts`). */
  readonly extension: string;
  readonly mime: string;
  readonly source: SldExportSource;
}

/**
 * PNG USUNIĘTY z listy (decyzja karty S9-6 do E-1, wariant „usuń" z dwóch
 * dopuszczonych — uzasadnienie merytoryczne, nie brak czasu):
 *  1. Rasteryzacja SVG w przeglądarce zależy od silnika renderu, dostępnych
 *     krojów i wygładzania — plik NIE jest bajt-deterministyczny, a
 *     determinizm eksportu jest regułą nienaruszalną (CLAUDE.md „Determinism
 *     Rule": „exports must be deterministic, SHA-256 fingerprints stable").
 *  2. Kryterium odbioru karty („każdy format zwraca plik z GEOMETRIĄ,
 *     struktura zawiera elementy sceny") jest dla rastra niesprawdzalne —
 *     mapa bitowa nie ma struktury do zbadania. Pozycja mogłaby więc wrócić
 *     tylko jako niesprawdzalna deklaracja („deklaracja bez testu = fałszywa
 *     pewność").
 *  3. Zdolność nie ginie: podgląd/prezentację pokrywa PDF (druk, jedna
 *     strona A3) i SVG (osadzenie w dokumencie, wektor).
 */
export const SLD_EXPORT_FORMATS: readonly SldExportFormatDescriptor[] = [
  {
    id: 'svg',
    labelPl: 'SVG — rysunek wektorowy',
    descriptionPl: 'Arkusz z tytułówką i legendą; paleta dokumentowa (jasna). Do dokumentacji i dalszej edycji.',
    extension: 'svg',
    mime: 'image/svg+xml',
    source: 'rysunek',
  },
  {
    id: 'pdf',
    labelPl: 'PDF — arkusz A3 do druku',
    descriptionPl: 'Ten sam rysunek wpasowany w arkusz A3 poziomy, wektorowo (bez rastra).',
    extension: 'pdf',
    mime: 'application/pdf',
    source: 'rysunek',
  },
  {
    id: 'dxf',
    labelPl: 'DXF — wymiana z CAD',
    descriptionPl: 'Geometria sceny jako encje LINE/CIRCLE/TEXT na warstwach. AutoCAD, BricsCAD, ZWCAD.',
    extension: 'dxf',
    mime: 'application/dxf',
    source: 'rysunek',
  },
  {
    id: 'cgmes',
    labelPl: 'CGMES — model sieci (IEC 61970 EQ+TP)',
    descriptionPl:
      'Model sieci do wymiany z innymi programami: węzły, odcinki, transformatory, łączniki, źródła, generatory i odbiory. Archiwum ZIP z profilami wyposażenia i topologii.',
    extension: 'cgmes.zip',
    mime: 'application/zip',
    source: 'model',
  },
];

export function sldExportFormatDescriptor(id: SldExportFormat): SldExportFormatDescriptor {
  const found = SLD_EXPORT_FORMATS.find((d) => d.id === id);
  // Nie może się zdarzyć przy typie zamkniętym — ale cichy `undefined` byłby
  // dokładnie tą klasą defektu, którą ta karta zamyka, więc mówimy głośno.
  if (!found) throw new Error(`Eksport schematu: nieznany format „${id}".`);
  return found;
}
