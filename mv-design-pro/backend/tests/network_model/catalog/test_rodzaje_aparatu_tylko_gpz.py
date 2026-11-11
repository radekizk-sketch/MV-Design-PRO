"""Rodzaje aparatu pola baterii GPZ występują wyłącznie w szablonach `tylko_gpz`.

Karta UX-04/ROZDZIELNICA-SN-KOREKTA (parytet rysunku aparatu: podgląd kreatora stacji SN/nN ×
kanwa SLD). Przekładnik niezrównoważenia (`UNBALANCE_CT`) i przekładnik napięciowy międzyfazowy
(`PHASE_TO_PHASE_VT`) leżą na połączeniu międzygwiazdowym i na zaciskach baterii (ENEA Zeszyt 1,
Zał. 16, s. 96) — kanwa rysuje je glifem baterii, nie w torze pola. Kreator stacji SN/nN nie ma
dla nich osobnego rysunku, bo nie może ich dostać: szablon `tylko_gpz` poza sekcją GPZ jest
odmawiany (W051, `pole.szablon_tylko_gpz`). Ten test przypina tę przesłankę — nowy szablon
stacji z takim rodzajem aparatu zaczerwieni go i wymusi rysunek w kreatorze
(`frontend/src/ui2/kreatory/stacja/__tests__/parytetRysunkuAparatu.test.ts`).
"""

from __future__ import annotations

from network_model.catalog.bay_templates import BAY_TEMPLATE_REGISTRY

RODZAJE_TYLKO_BATERII_GPZ = frozenset({"UNBALANCE_CT", "PHASE_TO_PHASE_VT"})


def test_rodzaje_aparatu_baterii_tylko_w_szablonach_gpz() -> None:
    zawierajace = {
        template_id: szablon
        for template_id, szablon in BAY_TEMPLATE_REGISTRY.items()
        if any(d.kind in RODZAJE_TYLKO_BATERII_GPZ for d in szablon.devices)
    }
    # Przesłanka niepusta: pole baterii Z.16 niesie oba rodzaje (test nie przechodzi pustym zbiorem).
    assert zawierajace, "żaden szablon nie niesie aparatów baterii — przesłanka testu zniknęła"
    poza_gpz = sorted(tid for tid, s in zawierajace.items() if not s.tylko_gpz)
    assert poza_gpz == [], f"szablony stacji z aparatem baterii GPZ: {poza_gpz}"
