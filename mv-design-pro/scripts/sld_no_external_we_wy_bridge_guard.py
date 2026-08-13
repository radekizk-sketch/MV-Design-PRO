from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDERER = ROOT / "frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx"
TEST = ROOT / "frontend/src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx"


def fail(message: str) -> None:
    raise SystemExit(f"sld_no_external_we_wy_bridge_guard: FAIL - {message}")


def main() -> None:
    renderer = RENDERER.read_text(encoding="utf-8")
    test = TEST.read_text(encoding="utf-8")

    required_renderer_tokens = [
        "COMPACT_TERRAIN_PORT_Y = -96",
        "COMPACT_EXTERNAL_BRIDGE_CLEARANCE",
        'data-guard="no_external_we_wy_bridge"',
        'data-render-contract="mask_only_not_electrical_element"',
        'data-visible-label="false"',
        'data-parity-key="station.mini.external_stub.compact"',
        'data-parity-key="station.mini.bay_drop_to_bus.compact"',
        "cableHeadY - 7",
        "cableHeadY + 4",
    ]
    for token in required_renderer_tokens:
        if token not in renderer:
            fail(f"brak kontraktu renderera: {token}")

    renderer_compact = renderer.replace("\n", "").replace(" ", "")
    forbidden_renderer_tokens = [
        'data-role="external_trunk_visual_cut_label"',
        ">przerwa<",
    ]
    for token in forbidden_renderer_tokens:
        if token in renderer_compact:
            fail(f"aktywny SVG nadal ma widoczny mostek/etykiete: {token}")

    required_test_tokens = [
        "nie renderuje",
        "no_external_we_wy_bridge",
        "mask_only_not_electrical_element",
        "not.toContain('przerwa')",
        "station.mini.external_stub.compact",
        "station.mini.bay_drop_to_bus.compact",
        "internal_station_busbar",
    ]
    for token in required_test_tokens:
        if token not in test:
            fail(f"brak regresji testowej: {token}")

    print("sld_no_external_we_wy_bridge_guard: OK - brak zewnetrznego mostka WE-WY.")


if __name__ == "__main__":
    main()
