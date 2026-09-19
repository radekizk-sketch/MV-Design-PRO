"""Jednorazowa migracja tabel legacy modelu sieci do ENM i ich KASACJA (W1, OD-2).

Uruchamiana przy starcie (`db.init_db`) na każdej bazie, która ma jeszcze tabele
`network_*` / katalogu typów / SLD ORM / `design_*` (klasy ORM skasowane w W1, więc
`create_all` ich już nie tworzy; baza sprzed W1 nadal je ma). Kolejność, bez wyjątków:

1. ZRZUT ARCHIWALNY — każda tabela legacy trafia jako JSON do
   `<magazyn ENM>/legacy_baza/<znacznik>/<tabela>.json` ZANIM cokolwiek zostanie
   skasowane (zero utraty danych, niezależnie od wyniku kompilacji).
2. KOMPILACJA — dla każdego projektu z węzłami w `network_nodes`, który NIE ma jeszcze
   modelu ENM pod kluczem projektu: rekordy legacy → `application/migracja_legacy.
   graf_z_modelu_legacy` → kompilator grafu (te same operacje domenowe co kreator) →
   `set_enm` z wpisem dziennika „Model odtworzony z modelu zastanego (W1)". Odmowa
   (`OdmowaMigracji`, błąd kompilacji) NIE zatrzymuje migracji — trafia do manifestu
   z nazwą projektu i przyczyną; projekt zostaje bez modelu, a jego dane leżą w zrzucie.
3. `DROP TABLE` każdej tabeli legacy (dzieci przed rodzicami; Postgres: `CASCADE`, bo
   `projects.connection_node_id` sprzed W1 ma klucz obcy do `network_nodes`).

Manifest (`manifest.json` obok zrzutu) wylicza: projekty zmigrowane (z hashem modelu),
pominięte (model ENM już istniał — zrzut legacy odłożony), odmówione (przyczyna).
Idempotencja: druga uruchomienie na bazie bez tabel legacy niczego nie robi.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import Engine, inspect, text

#: Tabele legacy w kolejności KASACJI (dzieci przed rodzicami).
TABELE_LEGACY: tuple[str, ...] = (
    "network_switching_states",
    "sld_annotations",
    "sld_branch_symbols",
    "sld_node_symbols",
    "sld_diagrams",
    "design_evidence",
    "design_proposals",
    "design_specs",
    "switch_equipment_assignments",
    "network_branches",
    "network_sources",
    "network_loads",
    "network_nodes",
    "network_snapshots",
    "line_types",
    "cable_types",
    "transformer_types",
    "switch_equipment_types",
    "inverter_types",
)
KATALOG_ZRZUTU = "legacy_baza"
ZRODLO_MIGRACJI = "migracja_legacy"
OPIS_MIGRACJI = "Model odtworzony z modelu zastanego (tabele network_*, W1)"


@dataclass
class RaportMigracjiLegacy:
    tabele: tuple[str, ...] = ()
    katalog_zrzutu: str | None = None
    zmigrowane: dict[str, str] = field(default_factory=dict)  # project_id -> hash ENM
    pominiete: dict[str, str] = field(default_factory=dict)  # project_id -> powód
    odmowione: dict[str, str] = field(default_factory=dict)  # project_id -> przyczyna

    @property
    def nic_do_zrobienia(self) -> bool:
        return not self.tabele

    def to_dict(self) -> dict[str, Any]:
        return {
            "tabele": list(self.tabele),
            "katalog_zrzutu": self.katalog_zrzutu,
            "zmigrowane": dict(self.zmigrowane),
            "pominiete": dict(self.pominiete),
            "odmowione": dict(self.odmowione),
        }


def _json_bezpieczny(wartosc: Any) -> Any:
    if isinstance(wartosc, datetime):
        return wartosc.isoformat()
    if isinstance(wartosc, UUID):
        return str(wartosc)
    return str(wartosc)


def _uuid_str(wartosc: Any) -> str:
    """Kolumna GUID czytana surowym SELECT to 32 znaki szesnastkowe (SQLite) albo UUID
    (Postgres) — jedna postać kanoniczna z myślnikami."""
    return str(UUID(str(wartosc)))


def _wiersze(polaczenie: Any, tabela: str) -> list[dict[str, Any]]:
    return [dict(w) for w in polaczenie.execute(text(f"SELECT * FROM {tabela}")).mappings().all()]


def _jsonb(wartosc: Any) -> Any:
    """Kolumny JSON czytane surowym SELECT bywają tekstem (SQLite) — jedna postać."""
    if isinstance(wartosc, str):
        try:
            return json.loads(wartosc)
        except ValueError:
            return wartosc
    return wartosc


def migruj_i_usun_tabele_legacy(engine: Engine) -> RaportMigracjiLegacy:
    """Zrzut → kompilacja do ENM (projekty bez modelu) → DROP tabel legacy."""
    from enm.klucz_twin import klucz_twin_projektu
    from enm.store import ZrodloZmiany, _store_dir, has_enm, set_enm

    inspektor = inspect(engine)
    istniejace = set(inspektor.get_table_names())
    obecne = tuple(t for t in TABELE_LEGACY if t in istniejace)
    raport = RaportMigracjiLegacy(tabele=obecne)
    if not obecne:
        return raport

    znacznik = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    katalog = Path(_store_dir()) / KATALOG_ZRZUTU / znacznik
    katalog.mkdir(parents=True, exist_ok=True)
    raport.katalog_zrzutu = str(katalog)

    with engine.begin() as polaczenie:
        zrzut: dict[str, list[dict[str, Any]]] = {}
        for tabela in obecne:
            zrzut[tabela] = _wiersze(polaczenie, tabela)
            (katalog / f"{tabela}.json").write_text(
                json.dumps(zrzut[tabela], default=_json_bezpieczny, ensure_ascii=False, indent=1),
                encoding="utf-8",
            )

        projekty = {_uuid_str(w["id"]): w for w in _wiersze(polaczenie, "projects")}
        wezly_per_projekt: dict[str, list[dict[str, Any]]] = {}
        for wezel in zrzut.get("network_nodes", []):
            wezly_per_projekt.setdefault(_uuid_str(wezel["project_id"]), []).append(wezel)
        for project_id, wezly in sorted(wezly_per_projekt.items()):
            projekt = projekty.get(project_id)
            nazwa = str(projekt["name"]) if projekt else project_id
            klucz = klucz_twin_projektu(UUID(project_id))
            if has_enm(klucz):
                raport.pominiete[project_id] = (
                    "projekt ma już model ENM — dane zastane odłożone w zrzucie, nie scalane"
                )
                continue
            try:
                model = _skompiluj_projekt(
                    nazwa=nazwa,
                    wezly=wezly,
                    galezie=[
                        g
                        for g in zrzut.get("network_branches", [])
                        if _uuid_str(g["project_id"]) == project_id
                    ],
                    zrodla=[
                        z
                        for z in zrzut.get("network_sources", [])
                        if _uuid_str(z["project_id"]) == project_id
                    ],
                    odbiory=[
                        o
                        for o in zrzut.get("network_loads", [])
                        if _uuid_str(o["project_id"]) == project_id
                    ],
                    proweniencja=f"legacy:{project_id}",
                )
            except Exception as blad:  # noqa: BLE001 — każda przyczyna idzie do manifestu
                raport.odmowione[project_id] = f"{nazwa}: {blad}"
                continue
            zapisany = set_enm(
                klucz,
                model,
                zrodlo_zmiany=ZrodloZmiany(
                    operacja=None,
                    utworzone=tuple(
                        sorted(
                            [b.ref_id for b in model.buses]
                            + [b.ref_id for b in model.branches]
                            + [t.ref_id for t in model.transformers]
                            + [s.ref_id for s in model.sources]
                            + [o.ref_id for o in model.loads]
                        )
                    ),
                    opis_pl=OPIS_MIGRACJI,
                    ladunek={"zrodlo": ZRODLO_MIGRACJI, "zrzut": str(katalog), "projekt": nazwa},
                ),
            )
            raport.zmigrowane[project_id] = zapisany.header.hash_sha256

        cascade = " CASCADE" if engine.dialect.name == "postgresql" else ""
        for tabela in obecne:
            polaczenie.execute(text(f"DROP TABLE IF EXISTS {tabela}{cascade}"))

    (katalog / "manifest.json").write_text(
        json.dumps(raport.to_dict(), ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return raport


def _skompiluj_projekt(
    *,
    nazwa: str,
    wezly: list[dict[str, Any]],
    galezie: list[dict[str, Any]],
    zrodla: list[dict[str, Any]],
    odbiory: list[dict[str, Any]],
    proweniencja: str,
) -> Any:
    from application.migracja_legacy import graf_z_modelu_legacy
    from enm.kompilator_grafu import kompiluj_graf
    from enm.models import EnergyNetworkModel

    graf = graf_z_modelu_legacy(
        nazwa=nazwa,
        wezly=[{**w, "attrs_jsonb": _jsonb(w.get("attrs_jsonb"))} for w in wezly],
        galezie=[{**g, "params_jsonb": _jsonb(g.get("params_jsonb"))} for g in galezie],
        zrodla=[{**z, "payload_jsonb": _jsonb(z.get("payload_jsonb"))} for z in zrodla],
        odbiory=[{**o, "payload_jsonb": _jsonb(o.get("payload_jsonb"))} for o in odbiory],
        proweniencja=proweniencja,
    )
    return EnergyNetworkModel.model_validate(kompiluj_graf(graf).enm)
