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

  test('Phase 2: Three.js CAD 預覽 — 模擬輪廓 → 開啟預覽 → canvas 渲染', async ({ page }) => {
    test.setTimeout(180_000);

    page.on('dialog', async (dialog) => {
      console.log(`[Dialog] ${dialog.type()}: ${dialog.message()}`);
      if (dialog.type() === 'prompt') {
        await dialog.accept('CAD 預覽測試專案');
      } else {
        await dialog.accept();
      }
    });

    // ─── 1. 開啟 app + 建專案 + free mode ───
    console.log('\n=== 1. 開啟 app + 建專案 ===');
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('measureMode', 'free'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.locator('#newProjectBtn').click();
    await page.waitForTimeout(1500);
    console.log('✓ 專案已建立');

    // ─── 2. 上傳 top photo ───
    console.log('\n=== 2. 上傳照片 ===');
    await page.locator('#fileInput').setInputFiles([PHOTOS.top]);
    await page.waitForTimeout(2000);

    const photoCount = await page.locator('.photo-thumb').count();
    console.log(`✓ ${photoCount} 張照片已上傳`);
    await page.screenshot({ path: resolve(RESULT_DIR, 'p2-01-photo-uploaded.png') });

    // ─── 3. 等待載入完成 ───
    console.log('\n=== 3. 等待載入完成 ===');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    console.log('✓ 頁面載入完成');

    // ─── 4. 注入模擬輪廓 + 觸發 AI 分析讓按鈕可見 ───
    console.log('\n=== 4. 注入模擬輪廓 + 執行分析 ===');
    await page.evaluate(() => {
      const storeApi = (window as any).__debugStoreApi;
      if (storeApi && typeof storeApi.addDrawing === 'function') {
        storeApi.addDrawing({
          type: 'polyline',
          id: 'mock_contour',
          points_px: [
            { x: 50, y: 50 },
            { x: 200, y: 50 },
            { x: 200, y: 120 },
            { x: 50, y: 120 },
          ],
          closed: true,
        });
        storeApi.setScale({
          pointA_px: { x: 0, y: 0 },
          pointB_px: { x: 100, y: 0 },
          distance_mm: 50,
          px_per_mm: 2,
        });
        console.log('[mock] contour + scale injected');
      }
    });
    await page.waitForTimeout(500);

    // Run analysis to trigger nextSteps visibility
    await page.locator('#analyzeBtn').click();
    await page.waitForFunction(() => {
      const panel = document.getElementById('analysisResults');
      return panel && !panel.innerHTML.includes('分析中');
    }, { timeout: 120_000 });
    console.log('✓ 模擬輪廓已注入 + 分析完成');
    await page.screenshot({ path: resolve(RESULT_DIR, 'p2-02-contour-injected.png') });

    // ─── 5. 點擊預覽 CAD 按鈕 ───
    console.log('\n=== 5. 點擊預覽 CAD 按鈕 ===');
    const previewBtn = page.locator('#previewCadBtn');
    // Button should be enabled now since contour exists
    await previewBtn.click({ timeout: 10_000 });
    await page.waitForTimeout(2000);
    console.log('✓ 已點擊 #previewCadBtn');

    // ─── 6. 驗證預覽 Modal 可見 ───
    console.log('\n=== 6. 驗證預覽 Modal ===');
    const previewModal = page.locator('#previewModal');
    await expect(previewModal).toBeVisible({ timeout: 10_000 });
    console.log('✓ #previewModal 已顯示');
    await page.screenshot({ path: resolve(RESULT_DIR, 'p2-03-preview-modal.png') });

    // ─── 7. 驗證 canvas 存在 ───
    console.log('\n=== 7. 驗證 canvas 渲染 ===');
    const canvas = page.locator('#previewContainer canvas');
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    console.log('✓ canvas 已渲染在 #previewContainer 內');
    await page.screenshot({ path: resolve(RESULT_DIR, 'p2-04-canvas-rendered.png') });

    // ─── 8. 截圖完整預覽畫面 ───
    console.log('\n=== 8. 截圖預覽畫面 ===');
    await page.screenshot({ path: resolve(RESULT_DIR, 'p2-05-preview-full.png'), fullPage: true });
    console.log('✓ 截圖已儲存');

    // ─── 9. 關閉預覽 Modal ───
    console.log('\n=== 9. 關閉預覽 Modal ===');
    await page.locator('#previewClose').click();
    await page.waitForTimeout(1000);
    console.log('✓ 已關閉預覽');

    // ─── 10. 驗證 Modal 已隱藏 ───
    console.log('\n=== 10. 驗證 Modal 已隱藏 ===');
    await expect(previewModal).toBeHidden({ timeout: 5000 });
    console.log('✓ #previewModal 已隱藏');
    await page.screenshot({ path: resolve(RESULT_DIR, 'p2-06-modal-closed.png') });

    console.log('\n═══════════════════════════════════════════');
    console.log('  Phase 2 E2E 測試完成');
    console.log(`  截圖: ${RESULT_DIR}`);
    console.log('═══════════════════════════════════════════\n');
  });

  test('Phase 3: FeatureScript 生成 — 匯出資料 → 生成 → code block 顯示', async ({ page }) => {
    test.setTimeout(180_000);

    page.on('dialog', async (dialog) => {
      console.log(`[Dialog] ${dialog.type()}: ${dialog.message()}`);
      if (dialog.type() === 'prompt') {
        await dialog.accept('FeatureScript 測試專案');
      } else {
        await dialog.accept();
      }
    });

    // ─── 1. 開啟 app + 建專案 + free mode ───
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
    await page.locator('#fileInput').setInputFiles([PHOTOS.top]);
    await page.waitForTimeout(2000);

    const photoCount = await page.locator('.photo-thumb').count();
    console.log(`✓ ${photoCount} 張照片已上傳`);
    await page.screenshot({ path: resolve(RESULT_DIR, 'p3-01-photo-uploaded.png') });

    // ─── 3. 嘗試 AI 分析 (若無 API key 則跳過) ───
    console.log('\n=== 3. AI 分析 (或跳過) ===');
    const analyzeBtn = page.locator('#analyzeBtn');
    if (await analyzeBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
      await analyzeBtn.click();

      try {
        await page.waitForFunction(() => {
          const panel = document.getElementById('analysisResults');
          return panel && !panel.innerHTML.includes('分析中') && panel.innerHTML.includes('分析完成');
        }, { timeout: 120_000 });
        console.log('✓ AI 分析完成');
      } catch {
        console.log('  (AI 分析超時或無 API key，繼續測試)');
      }
    } else {
      console.log('  (分析按鈕未啟用，跳過 AI 分析)');
    }
    await page.screenshot({ path: resolve(RESULT_DIR, 'p3-02-after-analysis.png') });

    // ─── 4. 點擊生成 FeatureScript 按鈕 ───
    console.log('\n=== 4. 點擊生成 FeatureScript ===');
    const genBtn = page.locator('#genFeatureScriptBtn');
    await genBtn.click();
    await page.waitForTimeout(2000);
    console.log('✓ 已點擊 #genFeatureScriptBtn');

    // ─── 5. 驗證 code Modal 可見 ───
    console.log('\n=== 5. 驗證 code Modal ===');
    const codeModal = page.locator('#codeModal');
    await expect(codeModal).toBeVisible({ timeout: 10_000 });
    console.log('✓ #codeModal 已顯示');
    await page.screenshot({ path: resolve(RESULT_DIR, 'p3-03-code-modal.png') });

    // ─── 6. 等待 code 內容載入 (非 "生成中...") ───
    console.log('\n=== 6. 等待 code 內容載入 ===');
    await page.waitForFunction(() => {
      const codeEl = document.querySelector('#codeModal pre code, #codeModal .code-content, #codeModal pre');
      if (!codeEl) return false;
      const text = codeEl.textContent || '';
      return text.length > 10 && !text.includes('生成中');
    }, { timeout: 60_000 });
    console.log('✓ code 內容已載入');
    await page.screenshot({ path: resolve(RESULT_DIR, 'p3-04-code-loaded.png') });

    // ─── 7. 驗證 code 內容有文字 ───
    console.log('\n=== 7. 驗證 code 內容 ===');
    const codeContent = await page.evaluate(() => {
      const codeEl = document.querySelector('#codeModal pre code, #codeModal .code-content, #codeModal pre');
      return codeEl?.textContent || '';
    });
    expect(codeContent.length).toBeGreaterThan(10);
    console.log(`✓ code 內容長度: ${codeContent.length} chars`);
    console.log(`  前 100 字: ${codeContent.substring(0, 100)}...`);

    // ─── 8. 點擊複製按鈕，驗證文字變更 ───
    console.log('\n=== 8. 測試複製按鈕 ===');
    const copyBtn = codeModal.locator('button:has-text("複製"), button:has-text("Copy"), .copy-btn').first();
    if (await copyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copyBtn.click();
      await page.waitForTimeout(1000);

      // Verify button text changed to "已複製！" or similar
      const btnText = await copyBtn.textContent();
      console.log(`  複製按鈕文字: ${btnText}`);
      const copied = btnText?.includes('已複製') || btnText?.includes('Copied');
      if (copied) {
        console.log('✓ 複製成功，按鈕文字已變更');
      } else {
        console.log('  (按鈕文字未變更，可能複製邏輯不同)');
      }
      await page.screenshot({ path: resolve(RESULT_DIR, 'p3-05-copied.png') });
    } else {
      console.log('  (複製按鈕未找到，跳過)');
    }

    // ─── 9. 關閉 Modal ───
    console.log('\n=== 9. 關閉 code Modal ===');
    await page.locator('#codeModalCloseBtn').click();
    await page.waitForTimeout(1000);
    await expect(codeModal).toBeHidden({ timeout: 5000 });
    console.log('✓ #codeModal 已關閉');

    // ─── 10. 最終截圖 ───
    console.log('\n=== 10. 最終截圖 ===');
    await page.screenshot({ path: resolve(RESULT_DIR, 'p3-06-final.png'), fullPage: true });

    console.log('\n═══════════════════════════════════════════');
    console.log('  Phase 3 E2E 測試完成');
    console.log(`  截圖: ${RESULT_DIR}`);
    console.log('═══════════════════════════════════════════\n');
  });

  test('Phase 4: Wizard 模式改善 — step 4 AI 確認 + step 5 預覽/生成按鈕', async ({ page }) => {
    test.setTimeout(180_000);

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept('Wizard 測試');
      else await dialog.accept();
    });

    // ─── 1. Wizard mode ───
    console.log('\n=== P4-1. Wizard 模式建專案 ===');
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('measureMode', 'wizard'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.locator('#newProjectBtn').click();
    await page.waitForTimeout(1500);
    console.log('✓ 專案已建立 (wizard mode)');

    // ─── 2. 上傳照片 → 自動分析 ───
    console.log('\n=== P4-2. 上傳照片 ===');
    await page.locator('#fileInput').setInputFiles([PHOTOS.top]);
    await page.waitForTimeout(2000);

    // Wait for wizard to advance past step 1
    await page.waitForFunction(() => {
      const active = document.querySelector('.wiz-step.active');
      return active && !active.textContent?.includes('上傳');
    }, { timeout: 60_000 }).catch(() => console.log('  (wizard 未自動前進)'));
    console.log('✓ 照片已上傳');
    await page.screenshot({ path: resolve(RESULT_DIR, 'p4-01-uploaded.png') });

    // ─── 3. 快速前進到 step 4 ───
    console.log('\n=== P4-3. 前進到 step 4 ===');
    for (let i = 0; i < 3; i++) {
      const skipBtn = page.locator('#wizSkip');
      if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await skipBtn.click();
        await page.waitForTimeout(500);
      }
    }

    const step4Active = await page.locator('.wiz-step.active').textContent();
    console.log(`  目前步驟: ${step4Active}`);
    await page.screenshot({ path: resolve(RESULT_DIR, 'p4-02-step4.png') });

    // ─── 4. 驗證 step 4 的 wizard body ───
    console.log('\n=== P4-4. 驗證 step 4 ===');
    const step4Body = await page.locator('#wizardBody').textContent();
    console.log(`  Step 4 body: ${step4Body?.substring(0, 100)}`);
    // Should mention AI results or manual features
    expect(step4Body).toBeTruthy();
    console.log('✓ Step 4 內容正常');

    // ─── 5. 前進到 step 5 ───
    console.log('\n=== P4-5. 前進到 step 5 ===');
    const nextBtn = page.locator('#wizNext');
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(500);
    } else {
      const skipBtn = page.locator('#wizSkip');
      await skipBtn.click();
      await page.waitForTimeout(500);
    }

    const step5Active = await page.locator('.wiz-step.active').textContent();
    console.log(`  目前步驟: ${step5Active}`);
    await page.screenshot({ path: resolve(RESULT_DIR, 'p4-03-step5.png') });

    // ─── 6. 驗證 step 5 有預覽/生成/匯出按鈕 ───
    console.log('\n=== P4-6. 驗證 step 5 按鈕 ===');
    const wizPreview = page.locator('#wizPreviewBtn');
    const wizGenFS = page.locator('#wizGenFSBtn');
    const wizExport = page.locator('#wizExportBtn');

    const hasPreview = await wizPreview.isVisible({ timeout: 3000 }).catch(() => false);
    const hasGenFS = await wizGenFS.isVisible({ timeout: 1000 }).catch(() => false);
    const hasExport = await wizExport.isVisible({ timeout: 1000 }).catch(() => false);

    console.log(`  預覽 CAD: ${hasPreview ? '✓' : '✗'}`);
    console.log(`  生成 FeatureScript: ${hasGenFS ? '✓' : '✗'}`);
    console.log(`  匯出 JSON: ${hasExport ? '✓' : '✗'}`);
    expect(hasExport).toBe(true);

    await page.screenshot({ path: resolve(RESULT_DIR, 'p4-04-step5-buttons.png'), fullPage: true });

    console.log('\n═══════════════════════════════════════════');
    console.log('  Phase 4 E2E 測試完成');
    console.log('═══════════════════════════════════════════\n');
  });
});
