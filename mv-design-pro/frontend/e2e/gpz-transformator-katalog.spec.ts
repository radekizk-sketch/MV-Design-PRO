/**
 * Karta KATALOG-PRZEJECIE-PR (decyzja architekta) — konfigurator GPZ: wybór typu transformatora
 * 110/SN to REALNA operacja modelu, a zwarcia liczą z nową tabliczką.
 *
 * Do tej karty karta „Transformator" konfiguratora GPZ trzymała wybór typu wyłącznie w stanie
 * formularza (lista pięciu nieistniejących identyfikatorów, pole „Moc znamionowa Sn" bez
 * odbiorcy) — kontrolka bez skutku. Teraz lista to pozycje katalogu backendu o napięciu szyn SN
 * transformatora modelu, a wybór woła `assign_catalog_to_element` na transformatorze stacji GPZ.
 *
 * Ścieżka użytkownika natywnie: prawy klik w źródło GPZ na kanwie → „Edytuj główny punkt
 * zasilania" → karta „Transformator" → wybór 40 MVA. Dowód skutku z backendu: transformator
 * modelu ma `catalog_ref` 40 MVA i tabliczkę z katalogu (Sn 40 MVA, uk 11,5 %), a prąd Ik″ na
 * szynie SN GPZ rośnie względem biegu z 25 MVA (mniejsza impedancja transformatora,
 * Z_T = uk·U²/Sn: 11 %/25 MVA → 11,5 %/40 MVA).
 */
import { test, expect } from '@playwright/test';

import { TR_25, TR_40, enm, ikNaSzynie, otworzKonfiguratorGpz, otworzSchemat, siecGpz } from './gpzKonfigurator';

test('GPZ: wybór typu transformatora 110/SN w konfiguratorze zmienia model i wynik zwarcia', async ({ page, request }) => {
  test.setTimeout(300000);
  const seed = await siecGpz(request);
  const ikPrzed = await ikNaSzynie(request, seed.caseId, seed.szynaSnRef);

  await otworzSchemat(page, seed);
  await otworzKonfiguratorGpz(page, seed.zrodloRef);
  await page.getByTestId('gpz-card-tab-transformer').click();

  const wybor = page.getByTestId(`gpz-transformer-select-${seed.transformatorRef}`);
  await expect(wybor).toHaveValue(TR_25);
  await expect(wybor.locator(`option[value="${TR_40}"]`)).toHaveCount(1, { timeout: 20000 });
  // Lista szyn 15 kV nie oferuje typów 110/20 kV (backend i tak by ich odmówił).
  await expect(wybor.locator('option[value^="tr-wn-sn-110-20-"]')).toHaveCount(0);
  await wybor.selectOption(TR_40);

  await expect
    .poll(async () => (await enm(request, seed.caseId)).transformers?.find((t) => t.ref_id === seed.transformatorRef)?.catalog_ref, {
      timeout: 20000,
    })
    .toBe(TR_40);
  const transformator = (await enm(request, seed.caseId)).transformers!.find((t) => t.ref_id === seed.transformatorRef)!;
  expect(transformator.sn_mva).toBe(40);
  expect(transformator.uk_percent).toBe(11.5);
  await expect(page.getByTestId(`gpz-transformer-plate-${seed.transformatorRef}`)).toContainText('40 MVA');
  await expect(page.getByTestId(`gpz-transformer-${seed.transformatorRef}`)).toContainText('11,5 %');

  const ikPo = await ikNaSzynie(request, seed.caseId, seed.szynaSnRef);
  // Sieć 110 kV 3000 MVA + TR: Z_T maleje z 0,11·15²/25 = 0,990 Ω do 0,115·15²/40 = 0,647 Ω,
  // więc Ik″ szyny SN rośnie wyraźnie (ok. o 45 %); próg 30 % odporny na impedancję sieci.
  expect(ikPo / ikPrzed).toBeGreaterThan(1.3);
});
