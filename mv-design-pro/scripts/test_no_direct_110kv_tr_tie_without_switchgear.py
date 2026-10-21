"""Testy `no_direct_110kv_tr_tie_without_switchgear` (karta SUITA-BEZ-WYWOLANIA, 2026-08-12).

Guard istniał w repo, ale był osiągalny WYŁĄCZNIE przez skasowany
`scripts/verify_v12_6.py` — agregator, ktory sam nigdy nie stał w żadnym
workflow CI, więc guard nigdy się nie wykonywał mimo że działał poprawnie
(zmierzone: `RC=0` na żywym rendererze przy wydzieleniu karty). Wpięty teraz
bezpośrednio w `p0-extended-guards.yml`. Testy pilnują ostrości w obie strony
na PODMIENIONEJ ścieżce pliku (regula KLASA §4 — deklaracja bez testu jest
fałszywą pewnością), żeby aktywacja guarda nie była samym RC=0 bez dowodu, że
guard faktycznie gryzie.

Karta GPZ-PARYTET: guard przepięty z martwego renderera v2 (`GpzCanonicalRenderer.tsx`,
skasowany — żaden ekran go nie renderował) na jedyną kompozycję GPZ kanwy v3
(`frontend/src/ui/sld/v3/compose/gpz.ts`).
"""

from __future__ import annotations

import no_direct_110kv_tr_tie_without_switchgear as guard


def test_plik_z_kompletem_markerow_bez_zakazanych_wzorcow_jest_ok(tmp_path, monkeypatch) -> None:
    kompozycja = tmp_path / "gpz.ts"
    kompozycja.write_text(
        "\n".join(f'const x = "{marker}";' for marker in guard.REQUIRED_MARKERS),
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "GPZ_KOMPOZYCJA", kompozycja)

    assert guard.run() == 0


def test_brak_markera_daje_rc1(tmp_path, monkeypatch) -> None:
    kompozycja = tmp_path / "gpz.ts"
    markery_bez_jednego = guard.REQUIRED_MARKERS[1:]
    kompozycja.write_text(
        "\n".join(f'const x = "{marker}";' for marker in markery_bez_jednego),
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "GPZ_KOMPOZYCJA", kompozycja)

    assert guard.run() == 1


def test_wstrzykniety_zakazany_wzorzec_daje_rc1(tmp_path, monkeypatch) -> None:
    kompozycja = tmp_path / "gpz.ts"
    tresc = "\n".join(f'const x = "{marker}";' for marker in guard.REQUIRED_MARKERS)
    tresc += '\nconst bypass = "direct_110kv_tr_tie";\n'
    kompozycja.write_text(tresc, encoding="utf-8")
    monkeypatch.setattr(guard, "GPZ_KOMPOZYCJA", kompozycja)

    assert guard.run() == 1


def test_brakujacy_plik_kompozycji_daje_rc1_a_nie_wyjatek(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(guard, "GPZ_KOMPOZYCJA", tmp_path / "nie_istnieje.tsx")

    assert guard.run() == 1


def test_realna_kompozycja_w_repo_jest_dzis_zielona() -> None:
    assert guard.run() == 0
