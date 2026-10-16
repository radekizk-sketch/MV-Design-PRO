"""Fikstura rejestru gotowości frontu == backend (karta C-12, klasa „snapshot bez strażnika").

PO CO. Frontend przypina dwie własności do SNAPSHOTU rejestru kodów gotowości
(`frontend/src/ui2/spaces/gotowosc/__tests__/fixtures/readiness_registry_snapshot.json`):
grupę celu każdego kodu (parytet `grupowanieCelow`) i KOMPLETNĄ tabelę akcji naprawczych
(każdy kod z nawigacją naprawczą ma dostawcę formularza albo nazwaną odmowę). Snapshot bez
strażnika dryfuje po cichu: nowy kod kanonu albo nowy typ okna walidatora nie trafia do
fikstury, więc testy frontu dalej są zielone, a projektant dostaje martwy przycisk.
Ten test jest strażnikiem: fikstura MUSI być równa temu, co liczy backend.

Regeneracja (z katalogu `backend/`):

    PYTHONPATH=$PWD:$PWD/src python tests/domain/test_fikstura_rejestru_gotowosci_frontu.py

Emitery akcji naprawczych (pole `emitery_akcji`) to KAŻDA trójka
(`action_type`, `modal_type`, `panel`), jaką odpowiedź operacji domenowej może nieść w
`fix_actions`: wywołania `FixAction(...)` walidatora ENM (`enm/validator.py`) oraz słowniki
akcji budowane wprost w `_build_readiness` (`enm/domain_operations.py`). Odczyt przez AST —
literały, bez uruchamiania walidatora na sieciach wzorcowych, więc żaden emiter nie umknie
przez brak scenariusza.
"""

from __future__ import annotations

import ast
import json
from pathlib import Path
from typing import Any

from domain.readiness_bridge import widok_rejestru

BACKEND = Path(__file__).resolve().parents[2]
FIKSTURA = (
    BACKEND.parent
    / "frontend/src/ui2/spaces/gotowosc/__tests__/fixtures/readiness_registry_snapshot.json"
)
PLIK_WALIDATORA = BACKEND / "src/enm/validator.py"
PLIK_OPERACJI = BACKEND / "src/enm/domain_operations.py"


def _literal(wezel: ast.expr | None) -> Any:
    if wezel is None:
        return None
    try:
        return ast.literal_eval(wezel)
    except ValueError:
        return "<dynamiczny>"


def _emitery_walidatora() -> set[tuple[Any, Any, Any]]:
    """Trójki z `FixAction(...)` walidatora — także gdy `modal_type` jest stałą modułu
    (`OPERACJA_PRZEPIECIA`) albo parametrem funkcji pomocniczej (`_fix(ref, modal, pole)`):
    wtedy zbierane są literały ze WSZYSTKICH wywołań tej funkcji."""
    import enm.validator as modul_walidatora

    drzewo = ast.parse(PLIK_WALIDATORA.read_text(encoding="utf-8"))
    rodzice: dict[ast.AST, ast.AST] = {}
    for wezel in ast.walk(drzewo):
        for dziecko in ast.iter_child_nodes(wezel):
            rodzice[dziecko] = wezel

    def funkcja_nadrzedna(wezel: ast.AST) -> ast.FunctionDef | None:
        while wezel in rodzice:
            wezel = rodzice[wezel]
            if isinstance(wezel, ast.FunctionDef):
                return wezel
        return None

    def wartosci_parametru(funkcja: ast.FunctionDef, nazwa: str) -> list[Any]:
        indeks = [a.arg for a in funkcja.args.args].index(nazwa)
        wynik: list[Any] = []
        for wezel in ast.walk(drzewo):
            if isinstance(wezel, ast.Call) and getattr(wezel.func, "id", None) == funkcja.name:
                if len(wezel.args) > indeks:
                    wynik.append(_literal(wezel.args[indeks]))
                else:
                    kw = {k.arg: k.value for k in wezel.keywords}
                    wynik.append(_literal(kw.get(nazwa)))
        return wynik

    def wartosci(wezel: ast.expr | None, miejsce: ast.AST) -> list[Any]:
        if isinstance(wezel, ast.Name):
            if hasattr(modul_walidatora, wezel.id):
                return [getattr(modul_walidatora, wezel.id)]
            funkcja = funkcja_nadrzedna(miejsce)
            if funkcja is not None and wezel.id in [a.arg for a in funkcja.args.args]:
                return wartosci_parametru(funkcja, wezel.id)
        return [_literal(wezel)]

    wynik: set[tuple[Any, Any, Any]] = set()
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.Call) and getattr(wezel.func, "id", None) == "FixAction":
            kw = {k.arg: k.value for k in wezel.keywords}
            for akcja in wartosci(kw.get("action_type"), wezel):
                for okno in wartosci(kw.get("modal_type"), wezel):
                    wynik.add((akcja, okno, None))
    return wynik


def _emitery_operacji_domenowej() -> set[tuple[Any, Any, Any]]:
    drzewo = ast.parse(PLIK_OPERACJI.read_text(encoding="utf-8"))
    funkcja = next(
        w
        for w in ast.walk(drzewo)
        if isinstance(w, ast.FunctionDef) and w.name == "_build_readiness"
    )
    wynik: set[tuple[Any, Any, Any]] = set()
    for wezel in ast.walk(funkcja):
        if not isinstance(wezel, ast.Dict):
            continue
        klucze = [_literal(k) if k is not None else None for k in wezel.keys]
        if "action_type" not in klucze:
            continue
        pola = dict(zip(klucze, wezel.values, strict=True))
        akcja = pola["action_type"]
        # Wpis walidatora przepisuje typ z `issue.fix_action` — ten zbiór liczy
        # `_emitery_walidatora`; tu tylko akcje z literałem.
        if not isinstance(akcja, ast.Constant):
            continue
        wynik.add((akcja.value, _literal(pola.get("modal_type")), _literal(pola.get("panel"))))
    return wynik


def oczekiwana_fikstura() -> dict[str, Any]:
    widok = widok_rejestru()
    kody = [
        {"area": k["area"], "code": k["code"], "fix_navigation": k["fix_navigation"]}
        for k in widok["codes"]
    ]
    emitery = sorted(
        _emitery_walidatora() | _emitery_operacji_domenowej(),
        key=lambda t: tuple(str(x) for x in t),
    )
    return {
        "codes": kody,
        "count": len(kody),
        "emitery_akcji": [{"action_type": a, "modal_type": m, "panel": p} for a, m, p in emitery],
        "validator_mapping": widok["validator_mapping"],
    }


def _serializuj(dane: dict[str, Any]) -> str:
    return json.dumps(dane, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def test_emitery_czytane_literalami() -> None:
    """Żaden emiter nie ma dynamicznego typu akcji ani okna — inaczej fikstura kłamie."""
    for emiter in oczekiwana_fikstura()["emitery_akcji"]:
        assert "<dynamiczny>" not in emiter.values(), emiter
    assert len(oczekiwana_fikstura()["emitery_akcji"]) > 20


def test_typ_akcji_kazdego_emitera_nalezy_do_slownika_kontraktu() -> None:
    """`FixActionItem.action_type` to zamknięty słownik — emiter spoza niego łamie kontrakt
    (dawniej `pv_bess.transformer_required` wysyłał nazwę operacji `add_transformer_sn_nn`)."""
    from typing import get_args

    from enm.domain_ops_models import FixActionItem

    slownik = set(get_args(FixActionItem.model_fields["action_type"].annotation))
    for emiter in oczekiwana_fikstura()["emitery_akcji"]:
        assert emiter["action_type"] in slownik, emiter


def test_fikstura_frontu_rowna_backendowi() -> None:
    zapisana = FIKSTURA.read_text(encoding="utf-8")
    assert zapisana == _serializuj(oczekiwana_fikstura()), (
        "Fikstura rejestru gotowości frontu rozjechała się z backendem — zregeneruj ją "
        "poleceniem z nagłówka tego modułu."
    )


if __name__ == "__main__":
    FIKSTURA.write_text(_serializuj(oczekiwana_fikstura()), encoding="utf-8")
    print(f"zapisano {FIKSTURA}")
