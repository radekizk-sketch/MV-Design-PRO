# SLD Station/DER Readability And Zero-Load Audit

Status: wykonane dla bieżącej iteracji SLD V2

## Zakres

Audyt dotyczy błędu widocznego w aktywnym SLD: zbyt duże etykiety stacji/DER/TR zasłaniały schemat, a naruszenie `semantic.zero_power_load` prowadziło użytkownika ogólnym CTA zamiast techniczną akcją uzupełnienia mocy odbioru.

Nie jest to zewnętrzna konsultacja. Poniższa lista to wewnętrzna matryca krytycznego przeglądu według ról, aby uniknąć fikcyjnego przypisywania opinii realnym osobom lub firmom.

## Dowody

- Screenshot po poprawce: `tmp/sld-station-readability/final-sld-station-readability.png`
- Diagnostyka browser: `tmp/sld-station-readability/final-sld-station-readability-diagnostics.json`
- Browser: brak błędów i ostrzeżeń konsoli dla retestowanego widoku.
- DOM SLD: etykiety stacji objęte audytem nie przekraczają `16 px`; `tooLarge=[]`.
- Pola WE/WY/TR: `role=button`, `data-hit-area=true`, transparentny hit area, opisy `aria-label`.

## Matryca 20 ról

| Rola | Ocena | Decyzja |
|---|---|---|
| Profesor sieci SN | Etykiety nie mogą dominować nad topologią. | Accepted: ograniczono rozmiary tekstu w world-space przy dużym zoomie. |
| Projektant OSD | CTA blockera musi prowadzić do naprawy danych. | Accepted: `semantic.zero_power_load` pokazuje `Uzupełnij moc odbioru`. |
| Projektant stacji SN/nN | Kod stacji, liczba nN i nazwa mają tworzyć mały stos etykiet. | Accepted: dodano regresję font-size dla mini-RMU. |
| Projektant GPZ | Klik pola ma otwierać konfigurację pola, nie wymagać trafiania w symbol. | Accepted: pola SN dostały pełny hit area. |
| Automatyk zabezpieczeń | Aparaty i pola muszą pozostać rozróżnialne. | Accepted: zmiana dotyczy tylko etykiet i hit areas, nie symboliki aparatury. |
| Specjalista DER/PV | Nazwa punktu blokowego nie może przykrywać SLD. | Accepted: długie etykiety DER są skracane na canvasie przy zoomie. |
| Specjalista BESS | Readiness musi widzieć realne braki. | Accepted: nie ukryto blockera, poprawiono tylko akcję prowadzącą. |
| Specjalista FW | Flow DER ma pozostać kontekstowy dla stacji/PCC. | Accepted: brak zmian domenowych PCC w tej iteracji. |
| Specjalista NC RfG | UI nie może sugerować zgodności bez danych. | Accepted: blocker danych pozostaje widoczny. |
| Specjalista jakości energii | Brak danych nie może wyglądać jak wynik zerowy. | Accepted: `semantic.zero_power_load` pozostaje naruszeniem, nie wynikiem. |
| Inżynier zwarć | Zmiana nie może dotykać solverów. | Accepted: brak zmian solverowych. |
| Inżynier rozpływów | Odbiór P/Q=0 musi blokować sens obliczeń. | Accepted: CTA kieruje do uzupełnienia mocy, nie zeruje wyniku. |
| Audytor proof/report | Ślad ma pokazywać te same obiekty co SLD. | Accepted: nie zmieniono identyfikatorów ENM/refs. |
| UX CAD reviewer | Klikalność pola musi być większa niż sam symbol. | Accepted: transparentne hit areas na kolumnach pól. |
| SCADA reviewer | Etykiety nie mogą robić z obiektu billboardu. | Accepted: font cap dla stacji/DER. |
| ETAP-like reviewer | Wynik wizualny powinien być techniczny, nie kafelkowy. | Accepted: brak nowych kart/dekoracji; poprawiono istniejący SVG. |
| DIgSILENT-like reviewer | Modelowa topologia nie może być zmieniana przez UI. | Accepted: tylko prezentacja i interakcja. |
| ABB/producent aparatów reviewer | Symbolika nie może być zastąpiona tekstem. | Accepted: teksty ograniczone, symbole zostają. |
| QA frontend | Każda poprawka ma mieć test regresyjny. | Accepted: dodano testy DER, mini-RMU, banner. |
| Accessibility reviewer | Elementy interaktywne mają role i opisy. | Accepted: pola SN mają `role=button` i `aria-label`. |

## Zmiany przyjęte

- `DerRenderer`: ograniczenie rozmiaru etykiet na canvasie przy dużym zoomie i skracanie długich nazw DER.
- `MiniBlockRmuRenderer`: ograniczenie tekstów stacji/DER przy dużym zoomie.
- `BayColumnSn` i custom compact bay renderery: pełne hit areas i role klikalne dla pól.
- `SemanticIssuesBanner`: techniczna akcja `Uzupełnij moc odbioru` dla odbioru P/Q=0.

## Odrzucone

- Usuwanie blockera P/Q=0: odrzucone, bo ukryłoby realny problem danych i mogłoby udawać poprawne obliczenia.
- Zmiana solverów: odrzucone, bo defekt jest w prezentacji/flow, nie w fizyce.

## Odłożone

Brak odłożeń w zakresie tej iteracji. Szersze zadanie "SLD 10/10" pozostaje większym programem prac, ale bieżący krytyczny defekt screenshotowy został zaadresowany i przetestowany.

## Walidacja

```text
npm test -- --run src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx src/ui/sld/v2/renderer/__tests__/DerConnectionTreeRenderer.test.tsx src/ui/tech-card/__tests__/SemanticIssuesBanner.test.tsx
PASS: 3 pliki, 97 testów

npm run type-check
PASS

npm run lint
PASS

npm run build
PASS, z istniejącym ostrzeżeniem Vite o dużych chunkach
```

## Werdykt

Bieżący defekt `0/10` z przeskalowanymi napisami DER/stacji został naprawiony w rendererze i potwierdzony testami oraz browser retestem. Pozostaje ostrzeżenie semantyczne odbioru P/Q=0, ale jest to poprawny blocker danych, a nie błąd renderingu; UI prowadzi teraz do uzupełnienia mocy odbioru.
