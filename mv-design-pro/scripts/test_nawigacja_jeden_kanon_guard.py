"""Testy zapadki NAWIGACJA-JEDEN-KANON.

Kazda regula ma parę: przypadek CZYSTY i przypadek NARUSZAJACY. Guard, ktory
nigdy nie zapalil sie na czerwono w tescie, jest deklaracja bez pokrycia — a
wlasnie takie deklaracje wylaczaja czujnosc (CLAUDE.md, KLASA §4).
"""

from __future__ import annotations

from pathlib import Path

import nawigacja_jeden_kanon_guard as guard

ROUTES_TS = """
export const ROUTES = {
  SLD: { hash: '#sld', label: 'Schemat', description: '', icon: 'SLD' },
  ANALYSIS: { hash: '#analysis', label: 'Analizy', description: '', icon: 'ANL' },
} satisfies Record<string, RouteDefinition>;

export const ALIAS_ROUTES = {
  PROOF: '#proof',
} as const;
"""

PALETA_TSX = """
export function CommandPalette() {
  return null;
}
"""

MOST_TS = """
export const TRASY_KANONICZNE = {};
"""

APPROOT_TSX = """
import { przejdzDoPrzestrzeni } from './shell/przejsciaPrzestrzeni';
import { wykonajAkcjeNaprawcza } from './spaces/gotowosc/akcjeNaprawcze';
const wybierzPrzestrzen = przejdzDoPrzestrzeni;
export function AppRoot() {
  return [
    <PulpitProjektu onAkcjaNaprawcza={wykonajAkcjeNaprawcza} />,
    <PanelGotowosci onAkcjaNaprawcza={wykonajAkcjeNaprawcza} />,
  ];
}
"""

AKCJE_NAPRAWCZE_TS = """
import { przejdzDoPrzestrzeni } from '../../shell/przejsciaPrzestrzeni';
import { executeFixActionSurface } from './fixActionSurfaceExecutor';
export function wykonajAkcjeNaprawcza(problem) {
  przejdzDoPrzestrzeni('schemat');
  executeFixActionSurface(problem.akcja, {});
}
"""

WYKONAWCA_TS = """
export function executeFixActionSurface(action, deps) {
  return true;
}
"""

PETLA_TS = """
import { przejdzDoPrzestrzeni } from '../../shell/przejsciaPrzestrzeni';
export function usePoprawWModelu() {
  return () => przejdzDoPrzestrzeni('schemat');
}
"""


JEDNA_DROGA_TS = """
export function pokazElementNaSchemacie(ref) {
  useSelectionStore.getState().centerSldOnElement(ref, 'kadruj');
}
"""

PRZEJSCIA_TS = """
export function przejdzDoPrzestrzeni(space) {
  if (space === 'schemat') navigateToSld();
}
"""

KANWA_TSX = """
export function KanwaSchematu(props) {
  useRejestracjaKanwySchematu();
  return <SldCanvasV3Workspace {...props} />;
}
"""

STORE_SELEKCJI_TS = """
export const useSelectionStore = create((set) => ({
  centerSldOnElement: (elementId, tryb = 'kadruj') => set({}),
}));
"""


def zbuduj_front(tmp_path: Path) -> Path:
    """Minimalne, POPRAWNE drzewo frontu — punkt wyjscia kazdego przypadku."""
    src = tmp_path / "frontend" / "src"
    (src / "ui" / "navigation").mkdir(parents=True)
    (src / "ui" / "navigation" / "routes.ts").write_text(ROUTES_TS, encoding="utf-8")
    (src / "ui2" / "search").mkdir(parents=True)
    (src / "ui2" / "search" / "CommandPalette.tsx").write_text(PALETA_TSX, encoding="utf-8")
    (src / "ui2" / "legacy").mkdir(parents=True)
    (src / "ui2" / "legacy" / "mostObszarow.ts").write_text(MOST_TS, encoding="utf-8")
    (src / "ui2" / "AppRoot.tsx").write_text(APPROOT_TSX, encoding="utf-8")
    (src / "ui2" / "spaces" / "gotowosc").mkdir(parents=True)
    (src / "ui2" / "spaces" / "gotowosc" / "akcjeNaprawcze.ts").write_text(
        AKCJE_NAPRAWCZE_TS, encoding="utf-8"
    )
    (src / "ui2" / "spaces" / "gotowosc" / "fixActionSurfaceExecutor.ts").write_text(
        WYKONAWCA_TS, encoding="utf-8"
    )
    (src / "ui2" / "wyniki" / "wzorzec").mkdir(parents=True)
    (src / "ui2" / "wyniki" / "wzorzec" / "usePoprawWModelu.ts").write_text(
        PETLA_TS, encoding="utf-8"
    )
    (src / "ui2" / "shell").mkdir(parents=True)
    (src / "ui2" / "shell" / "zaznaczElementModelu.ts").write_text(JEDNA_DROGA_TS, encoding="utf-8")
    (src / "ui2" / "shell" / "przejsciaPrzestrzeni.ts").write_text(PRZEJSCIA_TS, encoding="utf-8")
    (src / "ui2" / "legacy" / "KanwaSchematu.tsx").write_text(KANWA_TSX, encoding="utf-8")
    (src / "ui" / "selection").mkdir(parents=True)
    (src / "ui" / "selection" / "store.ts").write_text(STORE_SELEKCJI_TS, encoding="utf-8")
    return src


def przypnij(monkeypatch, src: Path) -> None:
    monkeypatch.setattr(guard, "REPO_ROOT", src.parent.parent)
    monkeypatch.setattr(guard, "FRONTEND_SRC", src)
    monkeypatch.setattr(guard, "PLIK_TRAS", src / "ui" / "navigation" / "routes.ts")
    monkeypatch.setattr(guard, "PLIK_MOSTU", src / "ui2" / "legacy" / "mostObszarow.ts")
    monkeypatch.setattr(guard, "PLIK_PALETY", src / "ui2" / "search" / "CommandPalette.tsx")
    monkeypatch.setattr(guard, "PLIK_APPROOT", src / "ui2" / "AppRoot.tsx")
    gotowosc = src / "ui2" / "spaces" / "gotowosc"
    monkeypatch.setattr(guard, "PLIK_AKCJI_NAPRAWCZYCH", gotowosc / "akcjeNaprawcze.ts")
    monkeypatch.setattr(guard, "PLIK_WYKONAWCY", gotowosc / "fixActionSurfaceExecutor.ts")
    monkeypatch.setattr(
        guard,
        "PLIK_PETLI_WYNIK_MODEL",
        src / "ui2" / "wyniki" / "wzorzec" / "usePoprawWModelu.ts",
    )
    monkeypatch.setattr(
        guard, "PLIK_JEDNEJ_DROGI", src / "ui2" / "shell" / "zaznaczElementModelu.ts"
    )
    monkeypatch.setattr(guard, "PLIK_PRZEJSC", src / "ui2" / "shell" / "przejsciaPrzestrzeni.ts")
    monkeypatch.setattr(guard, "PLIK_KANWY", src / "ui2" / "legacy" / "KanwaSchematu.tsx")
    monkeypatch.setattr(guard, "PLIK_STORE_SELEKCJI", src / "ui" / "selection" / "store.ts")
    monkeypatch.setattr(guard, "KATALOG_INFRASTRUKTURY_TESTOW", src / "test")
    monkeypatch.setattr(guard, "KATALOG_UI2", src / "ui2")
    monkeypatch.setattr(
        guard,
        "SCIEZKA_REJESTRU_OBSZAROW",
        src / "ui" / "navigation" / "areaRegistry.ts",
    )


# --------------------------------------------------------------------------
# REGULA A — literaly tras
# --------------------------------------------------------------------------


def test_regula_a_czysto_gdy_trasy_tylko_w_routes(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "shell" / "most.ts").write_text(
        "import { ROUTES } from '../../ui/navigation';\nconst a = ROUTES.SLD.hash;\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert guard.regula_a_literaly_tras() == []


def test_regula_a_lapie_literal_trasy_w_komponencie(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui" / "gdzies").mkdir(parents=True)
    (src / "ui" / "gdzies" / "Panel.tsx").write_text(
        "export const cel = '#sld';\n", encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    naruszenia = guard.regula_a_literaly_tras()

    assert any("[trasa-literal]" in wpis and "'#sld'" in wpis for wpis in naruszenia)


def test_regula_a_lapie_alias_z_parametrem(tmp_path, monkeypatch) -> None:
    """Adres z kontekstem (`'#proof?run=1'`) to nadal literal trasy."""
    src = zbuduj_front(tmp_path)
    (src / "ui" / "gdzies").mkdir(parents=True)
    (src / "ui" / "gdzies" / "Panel.tsx").write_text(
        'const cel = "#proof?run=1";\n', encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert any("'#proof'" in wpis for wpis in guard.regula_a_literaly_tras())


def test_regula_a_przepuszcza_komentarz_i_test(tmp_path, monkeypatch) -> None:
    """Komentarz cytujacy trase to nie kod; spec MUSI umiec ustawic adres."""
    src = zbuduj_front(tmp_path)
    (src / "ui" / "gdzies").mkdir(parents=True)
    (src / "ui" / "gdzies" / "Panel.tsx").write_text(
        "// trasa '#sld' renderuje kanwe\n/* albo '#analysis' */\nexport const x = 1;\n",
        encoding="utf-8",
    )
    (src / "ui" / "gdzies" / "panel.test.ts").write_text(
        "window.location.hash = '#sld';\n", encoding="utf-8"
    )
    (src / "ui" / "gdzies" / "__tests__").mkdir()
    (src / "ui" / "gdzies" / "__tests__" / "inny.ts").write_text(
        "window.location.hash = '#analysis';\n", encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert guard.regula_a_literaly_tras() == []


def test_regula_a_melduje_brak_kanonu_gdy_nie_ma_routes(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui" / "navigation" / "routes.ts").unlink()
    przypnij(monkeypatch, src)

    assert any("[trasy-brak-kanonu]" in wpis for wpis in guard.regula_a_literaly_tras())


# --------------------------------------------------------------------------
# REGULA B — druga nawigacja
# --------------------------------------------------------------------------


def test_regula_b_czysto_gdy_jest_sam_most(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    przypnij(monkeypatch, src)

    assert guard.regula_b_druga_nawigacja() == []


def test_regula_b_lapie_wskrzeszony_rejestr_obszarow(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui" / "navigation" / "areaRegistry.ts").write_text(
        "export const AREA_DEFINITIONS = [];\n", encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert any("[obszary-rejestr]" in wpis for wpis in guard.regula_b_druga_nawigacja())


def test_regula_b_lapie_import_rejestru(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "cos.ts").write_text(
        "import type { AreaId } from '../ui/navigation/areaRegistry';\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert any("[obszary-import]" in wpis for wpis in guard.regula_b_druga_nawigacja())


def test_regula_b_lapie_rownolegly_stan_takze_w_tescie(tmp_path, monkeypatch) -> None:
    """Stan drugiej nawigacji nie moze wrocic NAWET przez atrape testowa."""
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "__tests__").mkdir()
    (src / "ui2" / "__tests__" / "cos.test.ts").write_text(
        "const stan = { activeArea: 'MODEL_SIECI' };\n", encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert any("[obszary-stan]" in wpis for wpis in guard.regula_b_druga_nawigacja())


def test_regula_b_lapie_brak_mostu(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "legacy" / "mostObszarow.ts").unlink()
    przypnij(monkeypatch, src)

    assert any("[obszary-most]" in wpis for wpis in guard.regula_b_druga_nawigacja())


# --------------------------------------------------------------------------
# REGULA C — flaga powloki V3
# --------------------------------------------------------------------------


def test_regula_c_czysto_bez_flagi(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    przypnij(monkeypatch, src)

    assert guard.regula_c_flaga_v3() == []


def test_regula_c_lapie_flage_w_kodzie_frontu(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui" / "config").mkdir(parents=True)
    (src / "ui" / "config" / "featureFlags.ts").write_text(
        "export const f = { USE_LAYOUT_V3: false };\n", encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert any("[flaga-v3]" in wpis for wpis in guard.regula_c_flaga_v3())


def test_regula_c_lapie_flage_w_zmiennej_srodowiskowej(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui" / "config").mkdir(parents=True)
    (src / "ui" / "config" / "env.ts").write_text(
        "const v = import.meta.env.VITE_USE_LAYOUT_V3;\n", encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert any("[flaga-v3]" in wpis for wpis in guard.regula_c_flaga_v3())


# --------------------------------------------------------------------------
# REGULA D — jedna paleta komend
# --------------------------------------------------------------------------


def test_regula_d_czysto_przy_jednej_palecie(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    przypnij(monkeypatch, src)

    assert guard.regula_d_jedna_paleta() == []


def test_regula_d_lapie_druga_definicje_palety(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui" / "network-build").mkdir(parents=True)
    (src / "ui" / "network-build" / "CommandPalette.tsx").write_text(
        "export function CommandPalette() {\n  return null;\n}\n", encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    naruszenia = guard.regula_d_jedna_paleta()

    assert any("[paleta-duplikat]" in wpis and "2 definicje" in wpis for wpis in naruszenia)


def test_regula_d_lapie_duplikat_zapisany_jako_stala(tmp_path, monkeypatch) -> None:
    """Duplikat nie musi byc `function` — `const CommandPalette = …` tez liczy."""
    src = zbuduj_front(tmp_path)
    (src / "ui" / "gdzies").mkdir(parents=True)
    (src / "ui" / "gdzies" / "Paleta.tsx").write_text(
        "const CommandPalette = () => null;\nexport default CommandPalette;\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert any("[paleta-duplikat]" in wpis for wpis in guard.regula_d_jedna_paleta())


def test_regula_d_lapie_brak_palety(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "search" / "CommandPalette.tsx").unlink()
    przypnij(monkeypatch, src)

    assert any("[paleta-brak]" in wpis for wpis in guard.regula_d_jedna_paleta())


# --------------------------------------------------------------------------
# Guard na zywym repozytorium
# --------------------------------------------------------------------------


def test_regula_e_czysto_przy_wiazaniu_kanonicznym(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    przypnij(monkeypatch, src)

    assert guard.regula_e_wiazanie_pulpitu() == []


def test_regula_e_lapie_goly_setter_zamiast_kanonu(tmp_path, monkeypatch) -> None:
    # Dokladnie iniekcja odbioru PULPIT-NBA (2026-08-14), ktora przetrwala 371
    # testow jednostkowych: podmiana wiazania na goly setActiveSpace zostawia
    # trase nadrzedna (most tras nie idzie) i klik z pulpitu jest martwy.
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "AppRoot.tsx").write_text(
        "const wybierzPrzestrzen = (s) => useShellStore.getState().setActiveSpace(s);\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    naruszenia = guard.regula_e_wiazanie_pulpitu()

    assert any("[pulpit-poza-kanonem]" in wpis for wpis in naruszenia)


# --------------------------------------------------------------------------
# REGULA F — akcja naprawcza jako wykonawca (C-12)
# --------------------------------------------------------------------------


def test_regula_f_czysto_przy_jednym_wykonawcy(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    przypnij(monkeypatch, src)

    assert guard.regula_f_akcja_naprawcza() == []


def test_regula_f_lapie_goly_setter_w_wykonawcy(tmp_path, monkeypatch) -> None:
    # Dokladnie defekt sprzed C-12 w petli wynik->model: goly setter zostawia trase
    # nadrzedna (`#analysis`), ktora przykrywa „Schemat".
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "wyniki" / "wzorzec" / "usePoprawWModelu.ts").write_text(
        "export const f = () => useShellStore.getState().setActiveSpace('schemat');\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert any("[naprawa-goly-setter]" in w for w in guard.regula_f_akcja_naprawcza())


def test_regula_f_lapie_wykonawce_bez_nawigacji(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "spaces" / "gotowosc" / "akcjeNaprawcze.ts").write_text(
        "export function wykonajAkcjeNaprawcza(p) { executeFixActionSurface(p, {}); }\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert any("[naprawa-bez-nawigacji]" in w for w in guard.regula_f_akcja_naprawcza())


def test_regula_f_lapie_druga_implementacje_w_approot(tmp_path, monkeypatch) -> None:
    # Stan sprzed C-12: AppRoot mial wlasne `wykonajAkcjeNaprawcza` (selekcja + „Schemat").
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "AppRoot.tsx").write_text(
        APPROOT_TSX.replace(
            "import { wykonajAkcjeNaprawcza } from './spaces/gotowosc/akcjeNaprawcze';",
            "const wykonajAkcjeNaprawcza = (p) => wybierzPrzestrzen('schemat');",
        ),
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert any("[naprawa-druga-implementacja]" in w for w in guard.regula_f_akcja_naprawcza())


def test_regula_f_lapie_niewpieta_droge_naprawy(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "AppRoot.tsx").write_text(
        APPROOT_TSX.replace(
            "<PulpitProjektu onAkcjaNaprawcza={wykonajAkcjeNaprawcza} />",
            "<PulpitProjektu onAkcjaNaprawcza={() => {}} />",
        ),
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert any("[naprawa-niewpieta]" in w for w in guard.regula_f_akcja_naprawcza())


def test_regula_f_lapie_wyspe_wykonawcy_w_ui(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui" / "shared").mkdir(parents=True)
    (src / "ui" / "shared" / "fixActionSurfaceExecutor.ts").write_text(
        WYKONAWCA_TS, encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert any("[naprawa-wyspa-legacy]" in w for w in guard.regula_f_akcja_naprawcza())


def test_regula_f_lapie_drugiego_wolajacego_wykonawce(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "Inny.tsx").write_text(
        "export const x = () => executeFixActionSurface(a, d);\n", encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert any("[naprawa-wolajacy]" in w for w in guard.regula_f_akcja_naprawcza())


# --------------------------------------------------------------------------
# REGULA G — jedna droga wejscia na schemat
# --------------------------------------------------------------------------


def test_regula_g_czysto_na_minimalnym_drzewie(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "Komponent.tsx").write_text(
        "// dawniej: dispatchEvent('sld:center-on-element') — komentarz to nie kod\n"
        "export const x = () => pokazElementNaSchemacie(ref, 'tabela');\n",
        encoding="utf-8",
    )
    (src / "test").mkdir()
    (src / "test" / "schematTestowy.ts").write_text(
        "export const z = () => renderHook(() => useRejestracjaKanwySchematu());\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert guard.regula_g_jedna_droga_na_schemat() == []


def test_regula_g_lapie_martwe_zdarzenie_takze_w_tescie(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui" / "x" / "__tests__").mkdir(parents=True)
    (src / "ui" / "x" / "__tests__" / "a.test.tsx").write_text(
        "window.dispatchEvent(new CustomEvent('sld:center-on-element', { detail }));\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert any("[schemat-martwe-zdarzenie]" in w for w in guard.regula_g_jedna_droga_na_schemat())


def test_regula_g_lapie_wlasna_nawigacje_na_schemat(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui" / "Wiersz.tsx").write_text(
        "export const klik = () => { selectElement(e); navigateToSld(); };\n", encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert any("[schemat-wlasna-nawigacja]" in w for w in guard.regula_g_jedna_droga_na_schemat())


def test_regula_g_przepuszcza_definicje_nawigacji_w_routes(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui" / "navigation" / "routes.ts").write_text(
        ROUTES_TS + "\nexport function navigateToSld(): void {}\n", encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert guard.regula_g_jedna_droga_na_schemat() == []


def test_regula_g_lapie_gole_wskazanie_kamery(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui" / "Drzewo.tsx").write_text(
        "export const klik = () => useSelectionStore.getState().centerSldOnElement(id);\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert any("[schemat-gole-wskazanie]" in w for w in guard.regula_g_jedna_droga_na_schemat())


def test_regula_g_lapie_montaz_kanwy_poza_rejestrem(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "Warsztat.tsx").write_text(
        'export const W = () => <SldCanvasV3Workspace mode="edit" />;\n', encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert any(
        "[schemat-montaz-poza-rejestrem]" in w for w in guard.regula_g_jedna_droga_na_schemat()
    )


def test_regula_g_lapie_druga_rejestracje_montazu(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "InnaKanwa.tsx").write_text(
        "export const K = () => { useRejestracjaKanwySchematu(); return null; };\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert any("[schemat-druga-rejestracja]" in w for w in guard.regula_g_jedna_droga_na_schemat())


def test_regula_g_lapie_kanwe_bez_rejestracji(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "legacy" / "KanwaSchematu.tsx").write_text(
        "export const K = (p) => <SldCanvasV3Workspace {...p} />;\n", encoding="utf-8"
    )
    przypnij(monkeypatch, src)

    assert any(
        "[schemat-kanwa-bez-rejestracji]" in w for w in guard.regula_g_jedna_droga_na_schemat()
    )


def test_regula_g_lapie_droge_bez_kamery(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "shell" / "zaznaczElementModelu.ts").write_text(
        "export function pokazElementNaSchemacie(ref) { selectElement(ref); }\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert any("[schemat-droga-pusta]" in w for w in guard.regula_g_jedna_droga_na_schemat())


def test_regula_g_lapie_wybor_wiersza_bez_powrotu(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "Ekran.tsx").write_text(
        "const [wybrany, setWybrany] = useState<string | null>(null);\n"
        "export const E = () => <TabelaWynikow wybranyWiersz={wybrany} />;\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert any("[schemat-wybor-bez-powrotu]" in w for w in guard.regula_g_jedna_droga_na_schemat())


def test_regula_g_przepuszcza_wybor_przez_powrot(tmp_path, monkeypatch) -> None:
    src = zbuduj_front(tmp_path)
    (src / "ui2" / "Ekran.tsx").write_text(
        "const [wybrany, setWybrany] = useWyborPowrotu('wybor:ekran');\n"
        "export const E = () => <TabelaWynikow wybranyWiersz={wybrany} />;\n",
        encoding="utf-8",
    )
    przypnij(monkeypatch, src)

    assert guard.regula_g_jedna_droga_na_schemat() == []


def test_guard_zielony_na_repozytorium() -> None:
    assert guard.main() == 0
