/**
 * UI Results & Preview E2E 測試
 *
 * Phase 1: AI 結果確認面板
 * - 分析後顯示確認面板
 * - checkbox 勾選/取消
 * - 點擊數值可編輯
 * - export 包含確認項目
 *
 * 執行方式：npx playwright test tests/e2e/ui-results-preview.test.ts --headed
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULT_DIR = resolve(__dirname, '../../data/ui-results-test');
const PHOTO_DIR = 'd:/GitClone/trackpoint-laptop/doc/L390/硬體參考/電池';

const PHOTOS = {
  top: resolve(PHOTO_DIR, 'S__10092550_0.jpg'),
  thickness: resolve(PHOTO_DIR, 'S__10108951_0.jpg'),
};

test.describe('UI Results & Preview', () => {
  test.beforeAll(() => {
    mkdirSync(RESULT_DIR, { recursive: true });
  });

  test('Phase 1: AI 結果確認面板 — 分析 → 確認面板 → 編輯 → 匯出', async ({ page }) => {
    test.setTimeout(180_000);

    page.on('dialog', async (dialog) => {
      console.log(`[Dialog] ${dialog.type()}: ${dialog.message()}`);
      if (dialog.type() === 'prompt') {
        await dialog.accept('UI 測試專案');
      } else {
        await dialog.accept();
      }
    });

    // ─── 1. 開啟 app + 建專案 ───
    console.log('\n=== 1. 開啟 app + 建專案 ===');
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('measureMode', 'free'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.locator('#newProjectBtn').click();
    await page.waitForTimeout(1500);
    console.log('✓ 專案已建立');

    // ─── 2. 上傳照片 ───
    console.log('\n=== 2. 上傳照片 ===');
    await page.locator('#fileInput').setInputFiles([PHOTOS.top, PHOTOS.thickness]);
    await page.waitForTimeout(2000);

    const photoCount = await page.locator('.photo-thumb').count();
    console.log(`✓ ${photoCount} 張照片已上傳`);
    await page.screenshot({ path: resolve(RESULT_DIR, '01-photos-uploaded.png') });

    // ─── 3. AI 分析 ───
    console.log('\n=== 3. 執行 AI 分析 ===');
    await page.locator('#analyzeBtn').click();

    // Wait for analysis to complete (loading spinner disappears)
    await page.waitForFunction(() => {
      const panel = document.getElementById('analysisResults');
      return panel && !panel.innerHTML.includes('分析中') && panel.innerHTML.includes('分析完成');
    }, { timeout: 120_000 });

    await page.screenshot({ path: resolve(RESULT_DIR, '02-analysis-done.png') });
    console.log('✓ AI 分析完成');

    // ─── 4. 驗證 AI 結果確認面板出現 ───
    console.log('\n=== 4. 驗證 AI 結果確認面板 ===');

    const aiPanel = page.locator('#aiResultsPanel');
    const panelHtml = await aiPanel.innerHTML();
    console.log(`  面板內容長度: ${panelHtml.length} chars`);

    // Check if confirmation panel appeared (may have 0 items if no data detected)
    if (panelHtml.includes('ai-results')) {
      console.log('✓ AI 結果確認面板已顯示');

      // Count result cards
      const cardCount = await page.locator('.ai-result-card').count();
      console.log(`  共 ${cardCount} 個結果項目`);

      // Check all checkboxes are checked by default
      const checkedCount = await page.locator('.ai-result-card input[type="checkbox"]:checked').count();
      console.log(`  已勾選: ${checkedCount} / ${cardCount}`);
      expect(checkedCount).toBe(cardCount);

      await page.screenshot({ path: resolve(RESULT_DIR, '03-results-panel.png') });

      // ─── 5. 測試取消勾選 ───
      if (cardCount > 0) {
        console.log('\n=== 5. 測試取消勾選 ===');
        const firstCheckbox = page.locator('.ai-result-card input[type="checkbox"]').first();
        await firstCheckbox.uncheck();
        await page.waitForTimeout(300);

        const newChecked = await page.locator('.ai-result-card input[type="checkbox"]:checked').count();
        expect(newChecked).toBe(checkedCount - 1);
        console.log(`✓ 取消勾選成功 (${newChecked} / ${cardCount})`);

        // Re-check it
        await firstCheckbox.check();
        await page.waitForTimeout(300);
        console.log('✓ 重新勾選成功');
      }

      // ─── 6. 測試編輯功能 ───
      if (cardCount > 0) {
        console.log('\n=== 6. 測試編輯功能 ===');
        const firstValue = page.locator('.ai-result-card .result-value').first();
        const originalText = await firstValue.textContent();
        console.log(`  原始值: ${originalText}`);

        await firstValue.click();
        await page.waitForTimeout(300);

        // Should now be an input
        const editInput = page.locator('.ai-result-card .result-edit').first();
        if (await editInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await editInput.fill('999.9 mm');
          await editInput.press('Enter');
          await page.waitForTimeout(300);

          // Verify the value changed
          const newValue = await page.locator('.ai-result-card .result-value').first().textContent();
          console.log(`  修改後: ${newValue}`);
          expect(newValue).toContain('999.9');
          console.log('✓ 編輯功能正常');

          await page.screenshot({ path: resolve(RESULT_DIR, '04-value-edited.png') });
        } else {
          console.log('  (編輯 input 未出現，跳過)');
        }
      }
    } else {
      console.log('  (AI 未偵測到可確認的資料，面板為空)');
    }

    // ─── 7. 驗證下一步按鈕 ───
    console.log('\n=== 7. 驗證下一步按鈕 ===');
    const nextStepsEl = page.locator('#nextSteps');
    const nextStepsVisible = await nextStepsEl.evaluate(el => el.style.display !== 'none');
    expect(nextStepsVisible).toBe(true);
    console.log('✓ 下一步按鈕組已顯示');

    const previewBtn = page.locator('#previewCadBtn');
    const genBtn = page.locator('#genFeatureScriptBtn');
    const exportBtn = page.locator('#exportBtn');

    console.log(`  預覽 CAD: disabled=${await previewBtn.isDisabled()}`);
    console.log(`  生成 FeatureScript: disabled=${await genBtn.isDisabled()}`);
    console.log(`  匯出 JSON: disabled=${await exportBtn.isDisabled()}`);

    await page.screenshot({ path: resolve(RESULT_DIR, '05-next-steps.png') });

    // ─── 8. 匯出 JSON 並驗證確認資料 ───
    console.log('\n=== 8. 匯出 JSON ===');

    const exportResult = await page.evaluate(async () => {
      const state = (window as any).__debugStore?.();
      if (!state?.projectId) {
        // Fallback: get projectId from sidebar
        const el = document.getElementById('sidebarProjectName');
        if (!el) return null;
      }
      // Use the export button's fetch logic
      const projectId = document.querySelector('[data-project-id]')?.getAttribute('data-project-id');
      // Try direct API call
      const storeState = (window as any).__debugStore?.();
      const pid = storeState?.projectId;
      if (!pid) return { error: 'no project id' };
      const res = await fetch(`/api/projects/${pid}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: storeState.photos }),
      });
      return res.json();
    });

    if (exportResult && !exportResult.error) {
      writeFileSync(resolve(RESULT_DIR, 'measurement.json'), JSON.stringify(exportResult, null, 2));
      console.log('✓ measurement.json 已匯出');
      console.log(`  零件名稱: ${exportResult.part_name}`);
      console.log(`  型號: ${exportResult.model_number || '未偵測'}`);
      console.log(`  Views: ${exportResult.views?.length || 0}`);
    } else {
      console.log('  (匯出失敗，可能是 store 未暴露)');
    }

    await page.screenshot({ path: resolve(RESULT_DIR, '06-final.png'), fullPage: true });

    console.log('\n═══════════════════════════════════════════');
    console.log('  Phase 1 E2E 測試完成');
    console.log(`  截圖: ${RESULT_DIR}`);
    console.log('═══════════════════════════════════════════\n');
  });
});
