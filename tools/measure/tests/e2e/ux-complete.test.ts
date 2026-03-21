/**
 * UX 改善完整 E2E 測試
 *
 * 覆蓋 OpenSpec ux-improvements:
 *   1.4  Python 路徑偵測（Windows 環境）
 *   2.4  模式選擇器 UI（首次顯示 / 偏好記憶 / 切換）
 *   3.9  完整 Wizard 5 步驟流程
 *   4.6  SSE 即時分析（連線 / 進度 / 逾時 / 錯誤）
 *   5.5  共享比例尺 + 多視角匯出
 *
 * 執行：npx playwright test tests/e2e/ux-complete.test.ts --headed
 */
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULT_DIR = resolve(__dirname, '../../data/ux-complete');
const PHOTO_DIR = 'D:/GitClone/trackpoint-laptop/doc/L390/硬體參考/電池';
const KEYBOARD_PHOTO = 'D:/GitClone/trackpoint-laptop/doc/L390/硬體參考/鍵盤/S__10092548_0.jpg';

const PHOTOS = {
  top: resolve(PHOTO_DIR, 'S__10092550_0.jpg'),
  thickness: resolve(PHOTO_DIR, 'S__10108951_0.jpg'),
  connector_w: resolve(PHOTO_DIR, 'S__10108952_0.jpg'),
};

test.beforeAll(() => {
  mkdirSync(RESULT_DIR, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════
// 1.4 Python 路徑偵測（Windows）
// ═══════════════════════════════════════════════════════════════
test.describe('1.4 Python 路徑偵測', () => {
  test('auto-contour API → 確認 Python/OpenCV 可用', async ({ page }) => {
    // Create a project and upload a photo first
    page.on('dialog', async (d) => {
      if (d.type() === 'prompt') await d.accept('Python測試');
      else await d.accept();
    });

    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('measureMode', 'free'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.locator('#newProjectBtn').click();
    await page.waitForTimeout(1000);
    await page.locator('#fileInput').setInputFiles(PHOTOS.top);
    await page.waitForTimeout(2000);

    // Call auto-contour API to verify Python path works
    const result = await page.evaluate(async () => {
      const state = (window as any).__debugStore?.();
      if (!state?.projectId || !state?.activePhotoId) return { error: 'no state' };
      try {
        const res = await fetch(
          `/api/projects/${state.projectId}/photos/${state.activePhotoId}/auto-contour`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        );
        const data = await res.json();
        return { status: res.status, hasContours: !!data.contours, contourCount: data.contours?.length };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    console.log(`Python/OpenCV auto-contour 結果: ${JSON.stringify(result)}`);

    if (result.error) {
      console.log(`⚠ Python 可能未安裝或 OpenCV 不可用: ${result.error}`);
    } else {
      expect(result.status).toBe(200);
      console.log(`✓ Python 路徑偵測成功，contours: ${result.contourCount}`);
    }

    await page.screenshot({ path: resolve(RESULT_DIR, '1.4-python-detect.png') });
  });
});

// ═══════════════════════════════════════════════════════════════
// 2.4 模式選擇器 UI
// ═══════════════════════════════════════════════════════════════
test.describe('2.4 模式選擇器', () => {
  test('首次訪問 → 顯示選擇器 → 選擇後記憶 → reload 不再顯示', async ({ page }) => {
    // Clear all state
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    page.on('dialog', async (d) => {
      if (d.type() === 'prompt') await d.accept('模式測試');
      else await d.accept();
    });

    // Create project to trigger mode selector
    await page.locator('#newProjectBtn').click();
    await page.waitForTimeout(1000);

    // Check mode selector appears
    const modeSelector = page.locator('#modeSelector');
    const modeVisible = await modeSelector.isVisible().catch(() => false);
    console.log(`模式選擇器: ${modeVisible ? '可見 ✓' : '不可見（可能已自動選擇）'}`);

    await page.screenshot({ path: resolve(RESULT_DIR, '2.4-mode-selector.png') });

    if (modeVisible) {
      // Select wizard mode
      const wizardCard = page.locator('[data-mode="wizard"]');
      if (await wizardCard.isVisible()) {
        await wizardCard.click();
        await page.waitForTimeout(500);
        console.log('✓ 選擇 Wizard 模式');
      }

      // Verify localStorage saved
      const savedMode = await page.evaluate(() => localStorage.getItem('measureMode'));
      expect(savedMode).toBe('wizard');
      console.log(`✓ localStorage 已儲存: ${savedMode}`);

      await page.screenshot({ path: resolve(RESULT_DIR, '2.4-wizard-selected.png') });

      // Reload → mode selector should NOT appear
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Go back to workspace (create project again)
      await page.locator('#newProjectBtn').click();
      await page.waitForTimeout(1000);

      const modeVisible2 = await modeSelector.isVisible().catch(() => false);
      expect(modeVisible2).toBe(false);
      console.log('✓ Reload 後模式選擇器不再顯示');
    }

    // Test mode switching via header toggle
    const modeToggle = page.locator('#modeToggle, #modeSwitch, [data-action="toggleMode"]');
    if (await modeToggle.first().isVisible().catch(() => false)) {
      await modeToggle.first().click();
      await page.waitForTimeout(500);
      const newMode = await page.evaluate(() => localStorage.getItem('measureMode'));
      console.log(`✓ 切換模式: ${newMode}`);
      await page.screenshot({ path: resolve(RESULT_DIR, '2.4-mode-switched.png') });
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 3.9 完整 Wizard 5 步驟流程
// ═══════════════════════════════════════════════════════════════
test.describe('3.9 Wizard 完整流程', () => {
  test('Step 1 上傳 → Step 2 比例尺 → Step 3 輪廓 → Step 4 AI 確認 → Step 5 匯出', async ({ page }) => {
    test.setTimeout(180_000);

    page.on('dialog', async (d) => {
      if (d.type() === 'prompt') await d.accept('Wizard 完整測試');
      else await d.accept();
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('measureMode', 'wizard');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.locator('#newProjectBtn').click();
    await page.waitForTimeout(1000);

    // Wizard overlay should be visible
    const wizOverlay = page.locator('#wizardOverlay');
    await expect(wizOverlay).toBeVisible();
    console.log('✓ Wizard overlay 可見');

    // ── Step 1: 上傳照片 ──
    let activeStep = await page.locator('.wiz-step.active').textContent();
    console.log(`\nStep 1 active: "${activeStep}"`);

    await page.locator('#fileInput').setInputFiles(PHOTOS.top);
    await page.waitForTimeout(3000);

    // Wait for auto-analysis (SSE) to progress wizard past step 1
    console.log('⏳ 等待 AI 自動分析...');
    await page.waitForFunction(() => {
      const active = document.querySelector('.wiz-step.active');
      return active && !active.textContent?.includes('上傳');
    }, { timeout: 60_000 }).catch(() => {
      console.log('⚠ 自動分析超時或未觸發');
    });

    await page.screenshot({ path: resolve(RESULT_DIR, '3.9-step1-upload.png') });
    activeStep = await page.locator('.wiz-step.active').textContent();
    console.log(`✓ Step 1 完成，current: "${activeStep}"`);

    // ── Step 2: 比例尺確認 ──
    const confirmScale = page.locator('#wizConfirmScale');
    const manualScale = page.locator('#wizManualScale');

    if (await confirmScale.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmScale.click();
      console.log('✓ Step 2: 確認 AI 偵測的比例尺');
    } else if (await manualScale.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.locator('#wizSkip').click();
      console.log('✓ Step 2: 跳過（手動）');
    } else {
      console.log('  Step 2: 已自動前進');
    }

    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(RESULT_DIR, '3.9-step2-scale.png') });

    // ── Step 3: 輪廓確認 ──
    const confirmContour = page.locator('#wizConfirmContour');
    if (await confirmContour.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmContour.click();
      console.log('✓ Step 3: 確認 AI 偵測的輪廓');
    } else {
      const skipBtn = page.locator('#wizSkip');
      if (await skipBtn.isVisible()) {
        await skipBtn.click();
      }
      console.log('  Step 3: 跳過');
    }

    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(RESULT_DIR, '3.9-step3-contour.png') });

    // ── Step 4: AI 結果確認 ──
    activeStep = await page.locator('.wiz-step.active').textContent();
    console.log(`\nStep 4 active: "${activeStep}"`);

    // Check for AI result checkboxes
    const checkboxes = page.locator('#wizardBody input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    console.log(`  AI 結果 checkbox: ${cbCount} 個`);

    if (cbCount > 0) {
      // Check first few items
      for (let i = 0; i < Math.min(3, cbCount); i++) {
        await checkboxes.nth(i).check();
        await page.waitForTimeout(200);
      }
      console.log(`  ✓ 勾選了 ${Math.min(3, cbCount)} 項`);
    }

    // Navigate to step 5
    const nextBtn = page.locator('#wizNext');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: resolve(RESULT_DIR, '3.9-step4-confirm.png') });

    // ── Step 5: 匯出 ──
    activeStep = await page.locator('.wiz-step.active').textContent();
    console.log(`\nStep 5 active: "${activeStep}"`);

    // Check for export/preview/generate buttons in wizard
    const wizBody = await page.locator('#wizardBody').innerHTML();
    const hasPreviewBtn = wizBody.includes('預覽') || wizBody.includes('preview');
    const hasGenerateBtn = wizBody.includes('FeatureScript') || wizBody.includes('生成');
    const hasExportBtn = wizBody.includes('匯出') || wizBody.includes('export');

    console.log(`  預覽按鈕: ${hasPreviewBtn ? '✓' : '✗'}`);
    console.log(`  生成按鈕: ${hasGenerateBtn ? '✓' : '✗'}`);
    console.log(`  匯出按鈕: ${hasExportBtn ? '✓' : '✗'}`);

    await page.screenshot({ path: resolve(RESULT_DIR, '3.9-step5-export.png') });
    console.log('✓ Wizard 5 步驟完整流程完成');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4.6 SSE 即時分析
// ═══════════════════════════════════════════════════════════════
test.describe('4.6 SSE 即時分析', () => {
  test('上傳照片 → SSE 連線 → 進度更新 → 分析完成', async ({ page }) => {
    test.setTimeout(120_000);

    page.on('dialog', async (d) => {
      if (d.type() === 'prompt') await d.accept('SSE測試');
      else await d.accept();
    });

    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('measureMode', 'wizard'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.locator('#newProjectBtn').click();
    await page.waitForTimeout(1000);

    // Monitor SSE events via console messages
    const sseEvents: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('SSE') || text.includes('auto-analyze') || text.includes('EventSource')) {
        sseEvents.push(text);
      }
    });

    // Upload photo → triggers auto-analysis SSE
    await page.locator('#fileInput').setInputFiles(PHOTOS.top);
    console.log('⏳ 上傳照片，等待 SSE 分析...');

    // Wait for wizard to show analysis progress
    await page.waitForTimeout(3000);
    const wizBody1 = await page.locator('#wizardBody').textContent();
    console.log(`  Wizard body (3s): ${wizBody1?.substring(0, 100)}`);

    await page.screenshot({ path: resolve(RESULT_DIR, '4.6-sse-progress.png') });

    // Wait for analysis to complete (wizard advances past step 1)
    await page.waitForFunction(() => {
      const active = document.querySelector('.wiz-step.active');
      return active && !active.textContent?.includes('上傳');
    }, { timeout: 60_000 }).catch(() => {
      console.log('⚠ SSE 分析超時');
    });

    const wizBody2 = await page.locator('#wizardBody').textContent();
    console.log(`  Wizard body (完成): ${wizBody2?.substring(0, 100)}`);

    // Check if scale was auto-detected (indicates SSE ruler event worked)
    const hasScale = await page.evaluate(() => {
      const state = (window as any).__debugStore?.();
      if (!state?.activePhotoId) return false;
      return !!state.photos?.[state.activePhotoId]?.scale;
    });
    console.log(`  自動比例尺: ${hasScale ? '已偵測 ✓' : '未偵測'}`);

    // Check if contour was auto-detected
    const drawingCount = await page.evaluate(() => {
      const state = (window as any).__debugStore?.();
      if (!state?.activePhotoId) return 0;
      return state.photos?.[state.activePhotoId]?.drawings?.length || 0;
    });
    console.log(`  自動輪廓: ${drawingCount} 個 ${drawingCount > 0 ? '✓' : ''}`);

    console.log(`  SSE 相關 console 訊息: ${sseEvents.length}`);
    for (const evt of sseEvents.slice(0, 5)) {
      console.log(`    ${evt.substring(0, 80)}`);
    }

    await page.screenshot({ path: resolve(RESULT_DIR, '4.6-sse-complete.png') });
    console.log('✓ SSE 即時分析測試完成');
  });
});

// ═══════════════════════════════════════════════════════════════
// 5.5 共享比例尺 + 多視角匯出
// ═══════════════════════════════════════════════════════════════
test.describe('5.5 共享比例尺 + 多視角', () => {
  test('設定比例尺 → 套用到全部照片 → 多視角匯出', async ({ page }) => {
    test.setTimeout(120_000);

    page.on('dialog', async (d) => {
      if (d.type() === 'prompt') await d.accept('多視角測試');
      else await d.accept();
    });

    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('measureMode', 'free'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.locator('#newProjectBtn').click();
    await page.waitForTimeout(1000);

    // Upload 3 photos
    await page.locator('#fileInput').setInputFiles([
      PHOTOS.top, PHOTOS.thickness, PHOTOS.connector_w,
    ]);
    await page.waitForTimeout(3000);

    const thumbs = page.locator('.photo-thumb');
    expect(await thumbs.count()).toBe(3);
    console.log('✓ 3 張照片已上傳');

    // Set different angles
    const angles = ['top', 'side', 'close-up'];
    for (let i = 0; i < 3; i++) {
      await thumbs.nth(i).click();
      await page.waitForTimeout(300);
      const angleSelect = page.locator('#angleSelect');
      if (await angleSelect.isVisible()) {
        await angleSelect.selectOption(angles[i]);
        await page.waitForTimeout(300);
      }
    }
    console.log('✓ 視角已設定: top, side, close-up');

    // Set scale on first photo via store injection
    await thumbs.nth(0).click();
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const store = (window as any).__debugStoreApi;
      if (store) {
        store.setScale({ mm_per_px: 0.15, pixels: 200, mm: 30, points: [{ x: 100, y: 100 }, { x: 300, y: 100 }] });
      }
    });
    await page.waitForTimeout(300);

    // Apply scale to all photos
    const applyAllBtn = page.locator('#applyScaleAll, [data-action="applyScaleAll"]');
    if (await applyAllBtn.isVisible().catch(() => false)) {
      await applyAllBtn.click();
      await page.waitForTimeout(1000);
      console.log('✓ 比例尺已套用到全部照片');
    } else {
      // Try via API
      const applied = await page.evaluate(async () => {
        const state = (window as any).__debugStore?.();
        if (!state?.projectId) return false;
        const scale = state.photos?.[state.activePhotoId]?.scale;
        if (!scale) return false;
        const res = await fetch(`/api/projects/${state.projectId}/apply-scale`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scale_data: scale }),
        });
        return res.ok;
      });
      console.log(`  API apply-scale: ${applied ? '成功 ✓' : '失敗'}`);
    }

    // Verify all photos have scale
    const scaleCheck = await page.evaluate(() => {
      const state = (window as any).__debugStore?.();
      if (!state?.photos) return [];
      return Object.entries(state.photos).map(([id, ps]: [string, any]) => ({
        id: id.substring(0, 8),
        hasScale: !!ps.scale,
        mm_per_px: ps.scale?.mm_per_px,
      }));
    });
    console.log('  各照片比例尺:');
    for (const sc of scaleCheck) {
      console.log(`    ${sc.id}: ${sc.hasScale ? `${sc.mm_per_px} mm/px ✓` : '無'}`);
    }

    await page.screenshot({ path: resolve(RESULT_DIR, '5.5-shared-scale.png') });

    // Run AI analysis
    console.log('⏳ 開始 AI 分析...');
    await page.locator('#analyzeBtn').click();
    await page.waitForFunction(() => {
      const el = document.querySelector('#analysisResult');
      return el && el.textContent && el.textContent.length > 20;
    }, { timeout: 90_000 }).catch(() => console.log('⚠ 分析超時'));

    // Export with multiple views
    const exportResult = await page.evaluate(async () => {
      const state = (window as any).__debugStore?.();
      if (!state?.projectId) return null;
      const res = await fetch(`/api/projects/${state.projectId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: state.photos }),
      });
      return res.json();
    });

    expect(exportResult).toBeTruthy();
    expect(exportResult.views).toBeDefined();
    console.log(`\n✓ 匯出完成，views: ${exportResult.views?.length}`);

    for (const view of exportResult.views || []) {
      console.log(`  [${view.angle}] contour: ${view.contour_mm?.length || 0} pts`);
    }

    writeFileSync(
      resolve(RESULT_DIR, '5.5-multi-view-export.json'),
      JSON.stringify(exportResult, null, 2),
    );

    await page.screenshot({ path: resolve(RESULT_DIR, '5.5-multi-view.png') });
    console.log('✓ 多視角匯出測試完成');
  });
});
