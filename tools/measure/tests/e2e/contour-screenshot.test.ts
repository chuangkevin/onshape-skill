import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Contour detection screenshot', async ({ page }) => {
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 1920, height: 1080 });

  // Create a fresh project
  const projRes = await page.request.post('/api/projects/', {
    data: { name: 'contour-demo-' + Date.now() },
  });
  const project = await projRes.json();

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  // Open project
  const card = page.locator(`text=${project.name}`).locator('..');
  await card.locator('text=開啟').click();
  await page.waitForTimeout(1000);

  // Select wizard mode
  await page.locator('text=引導模式').first().click();
  await page.waitForTimeout(1000);

  // Upload photo — this triggers SSE auto-analyze
  const testPhoto = path.resolve(__dirname, '../../data/uploads/1774105358965-wnn8eu.jpg');
  await page.locator('input[type="file"]').setInputFiles(testPhoto);

  // Wait a solid 30 seconds for Gemini analysis to fully complete
  console.log('Uploaded. Waiting 30s for full Gemini analysis...');
  await page.waitForTimeout(30000);

  // Screenshot after analysis
  await page.screenshot({ path: 'data/contour-after-analysis.png', fullPage: true });

  // Advance wizard: click 下一步 multiple times
  for (let i = 0; i < 4; i++) {
    const next = page.locator('#wizNext');
    if (await next.isVisible({ timeout: 1000 }).catch(() => false)) {
      await next.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `data/contour-wizard-step${i + 1}.png`, fullPage: true });
    }
  }

  await page.screenshot({ path: 'data/contour-test-result.png', fullPage: true });
});
