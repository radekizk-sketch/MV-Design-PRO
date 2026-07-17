"""Reference Engine V1 — parytet mirror frontendu ↔ pakiet backendu (spec §8).

Frontend konsumuje profile pól i słownik symboli z lustrzanych kopii JSON
(`frontend/src/ui/sld/reference/*.pack.json`) — test wymusza identyczność
BAJTOWĄ z pakietami backendu (packs/*/pack.json). Rozjazd = czerwone CI:
nie istnieje druga definicja profili (pkt 10/12 dyrektywy).
"""

from pathlib import Path

_BACKEND_PACKS = Path(__file__).resolve().parents[2] / "src" / "reference_engine" / "packs"
_FRONTEND_MIRRORS = (
    Path(__file__).resolve().parents[3] / "frontend" / "src" / "ui" / "sld" / "reference"
)

_MIRRORED_PACKS = ["iec60617", "iec62271"]


class TestPackParity:
    def test_frontend_mirrors_are_byte_identical(self) -> None:
        for pack_id in _MIRRORED_PACKS:
            backend_file = _BACKEND_PACKS / pack_id / "pack.json"
            mirror_file = _FRONTEND_MIRRORS / f"{pack_id}.pack.json"
            assert mirror_file.exists(), (
                f"Brak mirrora frontendu dla pakietu {pack_id}: {mirror_file} "
                "(skopiuj pack.json backendu — spec Reference Engine §8 pkt 1)."
            )
            assert backend_file.read_bytes() == mirror_file.read_bytes(), (
                f"Mirror frontendu pakietu {pack_id} rozjechał się z backendem — "
                "zsynchronizuj kopię (jedno źródło prawdy, V12K-060)."
            )
