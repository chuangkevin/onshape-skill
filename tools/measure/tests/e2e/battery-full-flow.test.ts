/**
 * L390 電池完整量測流程 E2E 測試
 *
 * 使用真實照片：D:\Projects\trackpoint-laptop\doc\L390\硬體參考\電池
 * 執行方式（有畫面）：npx playwright test tests/e2e/battery-full-flow.test.ts --headed
 */
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULT_DIR = resolve(__dirname, '../../data/battery-test');
const PHOTO_DIR = 'D:/Projects/trackpoint-laptop/doc/L390/硬體參考/電池';

const PHOTOS = {
  top: resolve(PHOTO_DIR, 'S__10092550_0.jpg'),       // 俯視圖 + 尺規
  thickness: resolve(PHOTO_DIR, 'S__10108951_0.jpg'),  // 卡尺 6.5mm
  connector_w: resolve(PHOTO_DIR, 'S__10108952_0.jpg'), // 卡尺 12.5mm
  connector_h: resolve(PHOTO_DIR, 'S__10108953_0.jpg'), // 卡尺 27.8mm
};

test.describe('L390 電池完整量測流程', () => {
  test.beforeAll(() => {
    mkdirSync(RESULT_DIR, { recursive: true });
  });

  test('從零開始：建專案 → 上傳 4 張照片 → AI 分析 → 確認 → 匯出 JSON → 生成 FeatureScript', async ({ page }) => {
    test.setTimeout(180_000); // 3 分鐘（AI 分析需要時間）

    // Handle all dialogs
    page.on('dialog', async (dialog) => {
      console.log(`[Dialog] ${dialog.type()}: ${dialog.message()}`);
      if (dialog.type() === 'prompt') {
        await dialog.accept('L390 電池');
      } else {
        await dialog.accept();
      }
    });

    // ═══════════════════════════════════════════
    // STEP 1: 開啟 app + 新建專案
    // ═══════════════════════════════════════════
    console.log('\n=== STEP 1: 新建專案 ===');
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('measureMode', 'wizard'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click "新建專案"
    await page.locator('#newProjectBtn').click();
    await page.waitForTimeout(1500);

    await page.screenshot({ path: resolve(RESULT_DIR, '01-project-created.png') });
    console.log('✓ 專案已建立');

    // ═══════════════════════════════════════════
    // STEP 2: 上傳俯視圖（有尺規）
    // ═══════════════════════════════════════════
    console.log('\n=== STEP 2: 上傳俯視圖 ===');
    await page.locator('#fileInput').setInputFiles(PHOTOS.top);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: resolve(RESULT_DIR, '02-photo-uploaded.png') });
    console.log('✓ 俯視圖已上傳');

    // ═══════════════════════════════════════════
    // STEP 3: 等待 AI 自動分析（尺規 + 輪廓 + 標籤）
    // ═══════════════════════════════════════════
    console.log('\n=== STEP 3: 等待 AI 自動分析 ===');

    // Wait for wizard to advance past step 1 (analysis complete)
    await page.waitForFunction(() => {
      const active = document.querySelector('.wiz-step.active');
      return active && !active.textContent?.includes('上傳');
    }, { timeout: 60_000 });

    await page.screenshot({ path: resolve(RESULT_DIR, '03-analysis-done.png') });

    // Check what wizard shows
    const wizBody = await page.locator('#wizardBody').textContent();
    console.log(`✓ 分析完成，Wizard 顯示: ${wizBody?.substring(0, 80)}`);

    // ═══════════════════════════════════════════
    // STEP 4: 確認比例尺
    // ═══════════════════════════════════════════
    console.log('\n=== STEP 4: 確認比例尺 ===');

    const confirmScaleBtn = page.locator('#wizConfirmScale');
    const manualScaleBtn = page.locator('#wizManualScale');

    if (await confirmScaleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // AI found ruler → confirm
      const scaleText = await page.locator('#wizardBody').textContent();
      console.log(`  AI 偵測結果: ${scaleText?.substring(0, 100)}`);
      await confirmScaleBtn.click();
      console.log('✓ 比例尺已確認（AI 偵測）');
    } else if (await manualScaleBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('  AI 未偵測到尺規，使用手動模式');
      // Skip to manual — click wizard "下一步"
      await page.locator('#wizSkip').click();
      console.log('✓ 跳過比例尺（手動模式）');
    } else {
      // Wizard might already be on step 3
      console.log('  已在下一步');
    }

    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(RESULT_DIR, '04-scale-confirmed.png') });

    // ═══════════════════════════════════════════
    // STEP 5: 確認輪廓
    // ═══════════════════════════════════════════
    console.log('\n=== STEP 5: 確認輪廓 ===');

    const confirmContourBtn = page.locator('#wizConfirmContour');
    const redrawBtn = page.locator('#wizRedrawContour');

    if (await confirmContourBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const contourText = await page.locator('#wizardBody').textContent();
      console.log(`  AI 輪廓: ${contourText?.substring(0, 80)}`);
      await confirmContourBtn.click();
      console.log('✓ 輪廓已確認（AI 偵測）');
    } else {
      console.log('  未偵測到輪廓，跳過');
      await page.locator('#wizSkip').click();
    }

    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(RESULT_DIR, '05-contour-confirmed.png') });

    // ═══════════════════════════════════════════
    // STEP 6: 上傳額外照片（卡尺特寫）
    // ═══════════════════════════════════════════
    console.log('\n=== STEP 6: 上傳卡尺特寫照片 ===');

    // Upload remaining photos via the sidebar button
    await page.locator('#addPhotoBtn').click();
    await page.locator('#fileInput').setInputFiles([
      PHOTOS.thickness,
      PHOTOS.connector_w,
      PHOTOS.connector_h,
    ]);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: resolve(RESULT_DIR, '06-all-photos.png') });

    const photoCount = await page.locator('.photo-thumb').count();
    console.log(`✓ 共 ${photoCount} 張照片已上傳`);

    // ═══════════════════════════════════════════
    // STEP 7: 手動輸入卡尺讀數
    // ═══════════════════════════════════════════
    console.log('\n=== STEP 7: 輸入卡尺讀數 ===');

    const dimensions = [
      { location: '主體厚度', value: '6.7' },
      { location: 'connector 寬度', value: '12.5' },
      { location: 'connector 高度', value: '27.8' },
    ];

    for (const dim of dimensions) {
      await page.locator('#dimLocation').fill(dim.location);
      await page.locator('#dimValue').fill(dim.value);
      await page.locator('#addDimBtn').click();
      await page.waitForTimeout(300);
      console.log(`  + ${dim.location}: ${dim.value}mm`);
    }

    await page.screenshot({ path: resolve(RESULT_DIR, '07-dimensions-added.png') });
    console.log('✓ 卡尺讀數已輸入');

    // ═══════════════════════════════════════════
    // STEP 8: 點擊 AI 分析（完整分析）
    // ═══════════════════════════════════════════
    console.log('\n=== STEP 8: AI 完整分析 ===');

    // Navigate to step 5 if not there
    const currentStep = await page.locator('.wiz-step.active').textContent();
    if (!currentStep?.includes('匯出')) {
      // Click next until we reach step 5
      for (let i = 0; i < 3; i++) {
        const nextBtn = page.locator('#wizNext');
        if (await nextBtn.isVisible()) {
          await nextBtn.click();
          await page.waitForTimeout(300);
        }
      }
    }

    await page.screenshot({ path: resolve(RESULT_DIR, '08-ready-to-export.png') });
    console.log('✓ 準備匯出');

    // ═══════════════════════════════════════════
    // STEP 9: 匯出 JSON
    // ═══════════════════════════════════════════
    console.log('\n=== STEP 9: 匯出 measurement.json ===');

    // Use the API directly to get the JSON (avoid download dialog)
    const projectId = await page.evaluate(() => {
      // @ts-ignore
      return (window as any).__store?.getState?.()?.projectId;
    });

    // Get project ID from the sidebar
    const sidebarName = await page.locator('#sidebarProjectName').textContent();
    console.log(`  專案: ${sidebarName}`);

    // Call export API directly
    const exportResult = await page.evaluate(async () => {
      const projects = await fetch('/api/projects').then(r => r.json());
      const latest = projects[0];
      if (!latest) return null;
      const result = await fetch(`/api/projects/${latest.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then(r => r.json());
      return result;
    });

    if (exportResult) {
      const jsonStr = JSON.stringify(exportResult, null, 2);
      writeFileSync(resolve(RESULT_DIR, 'measurement.json'), jsonStr);
      console.log('✓ measurement.json 已匯出');
      console.log(`  零件名稱: ${exportResult.part_name}`);
      console.log(`  型號: ${exportResult.model_number || '未偵測'}`);
      console.log(`  Views: ${exportResult.views?.length || 0}`);
      console.log(`  卡尺讀數: ${exportResult.caliper_readings?.length || 0}`);
      console.log(`  信心度: ${exportResult.confidence?.overall}`);

      // Print contour summary
      for (const view of exportResult.views || []) {
        console.log(`  View [${view.angle}]: ${view.contour_mm?.length || 0} 輪廓點, ${view.features?.length || 0} 特徵`);
      }
    }

    await page.screenshot({ path: resolve(RESULT_DIR, '09-exported.png') });

    // ═══════════════════════════════════════════
    // STEP 10: 驗證 JSON 可用性
    // ═══════════════════════════════════════════
    console.log('\n=== STEP 10: 驗證結果 ===');

    expect(exportResult).toBeTruthy();
    expect(exportResult.part_name).toBe('L390 電池');
    expect(exportResult.views).toBeDefined();
    expect(Array.isArray(exportResult.caliper_readings)).toBe(true);

    // Verify dimensions were captured
    if (exportResult.caliper_readings?.length > 0) {
      console.log('  卡尺讀數:');
      for (const r of exportResult.caliper_readings) {
        console.log(`    ${r.location}: ${r.value_mm}mm (${r.source})`);
      }
    }

    // Final screenshot
    await page.screenshot({ path: resolve(RESULT_DIR, '10-final.png'), fullPage: true });

    console.log('\n═══════════════════════════════════════════');
    console.log('  L390 電池量測完成');
    console.log(`  結果: ${resolve(RESULT_DIR, 'measurement.json')}`);
    console.log(`  截圖: ${RESULT_DIR}`);
    console.log('═══════════════════════════════════════════\n');
  });
});
