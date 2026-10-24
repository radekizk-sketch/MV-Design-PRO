# QElectroTech → MV-DESIGN PRO / badanie symboli nN

**STATUS: WYŁĄCZNIE ŹRÓDŁA I PRZEGLĄD. B-02 ODRZUCONE.**

W katalogu znajdują się **7 niezmienionych oryginalnych plików .elmt** z
[qelectrotech/qelectrotech-elements](https://github.com/qelectrotech/qelectrotech-elements),
dane bibliograficzne w `import_manifest.json` oraz oryginalna licencja
`ELEMENTS.LICENSE`.

Autor: The QElectroTech team. Licencja elementów CC BY 3.0:
https://creativecommons.org/licenses/by/3.0/.
**Dalsza redystrybucja wymaga atrybucji. Nie wykorzystywać jako danych treningowych ML.**

## Lokalna rekonstrukcja atlasu ze źródeł (Python 3.11, bez bibliotek zewnętrznych)

Z katalogu `mv-design-pro`:

```bash
python scripts/import_qet_nn.py \
  --manifest docs/sld/vendor/qet/import_manifest.json \
  --source-root docs/sld/vendor/qet \
  --output /tmp/nn-qet-kandydaci.json

python scripts/build_qet_nn_atlas.py \
  --input /tmp/nn-qet-kandydaci.json \
  --output /tmp/nn-qet-atlas.html \
  --svg-dir /tmp/nn-qet-svg

python -m unittest discover -s tests/unit -p 'test_import_qet_nn.py' -v
```

Na GitHub: PR #499 → Actions → `nN CAD — QElectroTech importer and atlas evidence`
→ artefakt `nn-qet-atlas-do-oceny`.

## Granica akceptacji

- `status=DRAFT` dla **wszystkich** źródeł QET. Brak zweryfikowanej pary z
  licencjonowaną bazą symboli IEC 60617 oraz brak porównania geometrycznego 1:1.
- `qet_1`, `qet_2` oznaczają **wyłącznie fizyczne położenie zacisków**
  w pliku źródłowym, bez przypisania przewodu/fazy, potencjału ani roli ENM.
- Import NIE wnioskuje o stanie OTWARTY/ZAMKNIĘTY, bo QET .elmt zawiera
  pojedynczy rysunek, a nie wiarygodny mechanizm stanu aparatu.
- Działający import do JSON **nie oznacza** zaakceptowanego wykorzystania
  w produkcyjnym SLD. Bramka `qetAdmissionGate.ts` z definicji zabrania
  zatwierdzenia bez decyzji właściciela, dowodu IEC i mapowania wszystkich portów.
- Układy ENEA do 630/400 kVA wynikają ze standardów operatora, nie są
  kopiowane z PDF do plików SVG ani nie są „wytwarzane” z katalogu QET.
- Bez zgody nie usuwać 20 istniejących kanonicznych definicji, nie zmieniać
  zachowania `CadSymbol` ani `LvDomainView`.

**Podstawa rozwoju:** `docs/sld/NN_CAD_QET_ENEA_SOURCE_TO_ATLAS_2026-10-24.md`.
