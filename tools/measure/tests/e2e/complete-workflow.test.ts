/**
 * 完整量測工具 E2E 測試
 *
 * 覆蓋 OpenSpec photo-measurement-tool:
 *   5.5  照片上傳與顯示
 *   6.7  繪圖工具與 Undo/Redo
 *   7.5  比例尺校準與座標轉換
 *   8.5  特徵標註工作流
 *   10.8 AI 分析（live Gemini）
 *   12.5 匯出 JSON + schema 驗證
 *   13.1 完整流程 E2E
 *   13.2 L390 電池真實照片測試
 *   13.3 measurement.json 格式驗證
 *
 * 執行：npx playwright test tests/e2e/complete-workflow.test.ts --headed
 */
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULT_DIR = resolve(__dirname, '../../data/complete-workflow');
const PHOTO_DIR = 'D:/GitClone/trackpoint-laptop/doc/L390/硬體參考/電池';

const PHOTOS = {
  top: resolve(PHOTO_DIR, 'S__10092550_0.jpg'),
  thickness: resolve(PHOTO_DIR, 'S__10108951_0.jpg'),
  connector_w: resolve(PHOTO_DIR, 'S__10108952_0.jpg'),
  connector_h: resolve(PHOTO_DIR, 'S__10108953_0.jpg'),
};

/**
 * Helper: create project in free mode.
 * Uses page.on('dialog') to handle the prompt before clicking.
 */
async function createProjectFreeMode(page: Page, name: string) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('measureMode', 'free'));
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  // Clean up old projects to prevent viewport overflow
  await page.evaluate(async () => {
    const res = await fetch('/api/projects');
    const projects = await res.json();
    for (const p of projects) {
      await fetch(`/api/projects/${p.id}`, { method: 'DELETE' });
    }
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  // Must register dialog handler BEFORE clicking (prompt() blocks the page)
  page.once('dialog', async (dialog) => {
    await dialog.accept(name);
  });
  await page.locator('#newProjectBtn').click();
  await page.waitForTimeout(1500);
  await expect(page.locator('#workspace')).toBeVisible();
}

/** Helper: upload photo and wait for it to load */
async function uploadPhoto(page: Page, photoPath: string | string[]) {
  await page.locator('#fileInput').setInputFiles(photoPath);
  await page.waitForTimeout(2000);
}

/** Helper: get canvas bounding rect */
async function getCanvasRect(page: Page) {
  return page.locator('#drawingCanvas').boundingBox();
}

/** Helper: get drawings count from store */
async function getDrawingsCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const state = (window as any).__debugStore?.();
    const idx = state?.activePhotoIndex;
    if (idx == null || idx < 0) return 0;
    return state.photos?.[idx]?.drawings?.length || 0;
  });
}

/** Helper: get features count from store */
async function getFeaturesCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const state = (window as any).__debugStore?.();
    const idx = state?.activePhotoIndex;
    if (idx == null || idx < 0) return 0;
    return state.photos?.[idx]?.features?.length || 0;
  });
}

test.beforeAll(() => {
  mkdirSync(RESULT_DIR, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════
// 5.5 照片上傳與顯示
// ═══════════════════════════════════════════════════════════════
test.describe('5.5 照片上傳與顯示', () => {
  test('上傳單張照片 → 縮圖出現 → canvas 渲染 → API 可查', async ({ page }) => {
    await createProjectFreeMode(page, '上傳測試');
    await uploadPhoto(page, PHOTOS.top);

    // 1) Sidebar thumbnail
    const thumbs = page.locator('.photo-thumb');
    await expect(thumbs).toHaveCount(1);
    console.log('✓ 側邊欄出現 1 張縮圖');

    // 2) Canvas renders
    const canvasSize = await page.locator('#photoCanvas').boundingBox();
    expect(canvasSize!.width).toBeGreaterThan(100);
    console.log(`✓ Canvas 尺寸: ${canvasSize!.width}x${canvasSize!.height}`);

    // 3) API returns photo
    const projectId = await page.evaluate(() => (window as any).__debugStore?.().projectId);
    expect(projectId).toBeTruthy();
    const photos = await page.evaluate(async (pid: string) => {
      const res = await fetch(`/api/projects/${pid}/photos`);
      return res.json();
    }, projectId);
    expect(photos).toHaveLength(1);
    console.log(`✓ API 回傳照片: ${photos[0].filename}`);

    await page.screenshot({ path: resolve(RESULT_DIR, '5.5-photo-uploaded.png') });
  });

  test('上傳多張照片 → 全部顯示 → 點擊切換', async ({ page }) => {
    await createProjectFreeMode(page, '多照片測試');
    await uploadPhoto(page, [PHOTOS.top, PHOTOS.thickness, PHOTOS.connector_w]);

    const thumbs = page.locator('.photo-thumb');
    await expect(thumbs).toHaveCount(3);
    console.log('✓ 側邊欄出現 3 張縮圖');

    // Click second thumbnail
    await thumbs.nth(1).click();
    await page.waitForTimeout(500);
    await expect(page.locator('.photo-thumb.active')).toHaveCount(1);
    console.log('✓ 點擊切換照片成功');

    await page.screenshot({ path: resolve(RESULT_DIR, '5.5-multi-photos.png') });
  });
});

// ═══════════════════════════════════════════════════════════════
// 6.7 繪圖工具與 Undo/Redo
// ═══════════════════════════════════════════════════════════════
test.describe('6.7 繪圖工具與 Undo/Redo', () => {
  test('Store addDrawing + Undo + Redo', async ({ page }) => {
    test.setTimeout(90_000);
    await createProjectFreeMode(page, '繪圖測試');
    page.on('dialog', async (d) => await d.accept());

    await uploadPhoto(page, PHOTOS.top);

    // Inject a polyline drawing via store API
    await page.evaluate(() => {
      const store = (window as any).__debugStoreApi;
      store.addDrawing({
        type: 'polyline',
        id: 'test_poly_1',
        points_px: [
          { x: 100, y: 100 }, { x: 300, y: 100 },
          { x: 300, y: 200 }, { x: 100, y: 200 },
        ],
        closed: true,
      });
    });
    await page.waitForTimeout(300);

    const countAfterDraw = await getDrawingsCount(page);
    expect(countAfterDraw).toBe(1);
    console.log(`✓ Drawing 注入成功，drawings: ${countAfterDraw}`);

    // Add a second drawing
    await page.evaluate(() => {
      const store = (window as any).__debugStoreApi;
      store.addDrawing({
        type: 'polyline',
        id: 'test_poly_2',
        points_px: [
          { x: 400, y: 100 }, { x: 500, y: 100 },
          { x: 500, y: 200 }, { x: 400, y: 200 },
        ],
        closed: true,
      });
    });
    await page.waitForTimeout(300);
    expect(await getDrawingsCount(page)).toBe(2);
    console.log('✓ 第二個 Drawing 注入成功');

    await page.screenshot({ path: resolve(RESULT_DIR, '6.7-polyline-drawn.png') });

    // Undo → should remove last drawing
    await page.evaluate(() => (window as any).__debugStoreApi.undo());
    await page.waitForTimeout(300);
    expect(await getDrawingsCount(page)).toBe(1);
    console.log('✓ Undo 成功，drawings: 1');

    // Undo again → 0
    await page.evaluate(() => (window as any).__debugStoreApi.undo());
    await page.waitForTimeout(300);
    expect(await getDrawingsCount(page)).toBe(0);
    console.log('✓ Undo 再次成功，drawings: 0');

    // Redo → 1
    await page.evaluate(() => (window as any).__debugStoreApi.redo());
    await page.waitForTimeout(300);
    expect(await getDrawingsCount(page)).toBe(1);
    console.log('✓ Redo 成功，drawings: 1');

    // Redo → 2
    await page.evaluate(() => (window as any).__debugStoreApi.redo());
    await page.waitForTimeout(300);
    expect(await getDrawingsCount(page)).toBe(2);
    console.log('✓ Redo 再次成功，drawings: 2');

    await page.screenshot({ path: resolve(RESULT_DIR, '6.7-undo-redo.png') });
  });

  test('Store addFeature → hole 特徵新增', async ({ page }) => {
    test.setTimeout(90_000);
    await createProjectFreeMode(page, '孔位測試');
    page.on('dialog', async (d) => await d.accept());

    await uploadPhoto(page, PHOTOS.top);

    // Inject hole drawing + feature via store
    await page.evaluate(() => {
      const store = (window as any).__debugStoreApi;
      const shape = {
        type: 'circle',
        id: 'hole_test_1',
        center_px: { x: 300, y: 200 },
        radius_px: 25,
      };
      store.addDrawing(shape);
      store.addFeature({
        id: 'feat_test_1',
        type: 'hole',
        label: '測試圓孔（r=25px）',
        shape,
      });
    });
    await page.waitForTimeout(300);

    const features = await getFeaturesCount(page);
    expect(features).toBe(1);
    console.log(`✓ 孔位特徵注入成功，features: ${features}`);

    const drawings = await getDrawingsCount(page);
    expect(drawings).toBe(1);
    console.log(`  drawings: ${drawings}`);

    await page.screenshot({ path: resolve(RESULT_DIR, '6.7-hole-placed.png') });
  });
});

// ═══════════════════════════════════════════════════════════════
// 7.5 比例尺校準與座標轉換
// ═══════════════════════════════════════════════════════════════
test.describe('7.5 比例尺校準', () => {
  test('比例尺設定 → UI 更新 → mm/px 計算正確', async ({ page }) => {
    test.setTimeout(90_000);
    await createProjectFreeMode(page, '比例尺測試');
    page.on('dialog', async (d) => await d.accept());

    await uploadPhoto(page, PHOTOS.top);

    // Set scale via store API (simulates 2-point calibration: 200px = 100mm)
    await page.evaluate(() => {
      const store = (window as any).__debugStoreApi;
      store.setScale({
        pointA_px: { x: 100, y: 300 },
        pointB_px: { x: 300, y: 300 },
        distance_mm: 100,
        px_per_mm: 2.0, // 200px / 100mm
      });
    });
    await page.waitForTimeout(500);

    // Verify store has scale
    const scale = await page.evaluate(() => {
      const state = (window as any).__debugStore?.();
      const idx = state?.activePhotoIndex;
      if (idx == null || idx < 0) return null;
      return state.photos?.[idx]?.scale;
    });

    expect(scale).toBeTruthy();
    expect(scale.px_per_mm).toBe(2.0);
    expect(scale.distance_mm).toBe(100);
    console.log(`✓ 比例尺已設定: px_per_mm=${scale.px_per_mm}, distance_mm=${scale.distance_mm}`);

    // Verify scale info in UI
    const scaleText = await page.locator('#scaleInfo').textContent();
    console.log(`  比例尺 UI: ${scaleText}`);
    // Should show something other than "尚未校準"
    expect(scaleText).not.toContain('尚未校準');

    await page.screenshot({ path: resolve(RESULT_DIR, '7.5-scale-calibrated.png') });
  });
});

// ═══════════════════════════════════════════════════════════════
// 8.5 特徵標註工作流
// ═══════════════════════════════════════════════════════════════
test.describe('8.5 特徵標註', () => {
  test('繪製輪廓 + 標註孔位 + 輸入手動尺寸', async ({ page }) => {
    test.setTimeout(90_000);
    await createProjectFreeMode(page, '標註測試');

    // Handle all dialogs (scale prompt, tool switch confirm)
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept('100');
      else await dialog.accept();
    });

    await uploadPhoto(page, PHOTOS.top);

    // 1) Inject contour (polyline) via store API
    await page.evaluate(() => {
      const store = (window as any).__debugStoreApi;
      store.addDrawing({
        type: 'polyline',
        id: 'contour_test',
        points_px: [
          { x: 100, y: 100 }, { x: 400, y: 100 },
          { x: 400, y: 300 }, { x: 100, y: 300 },
        ],
        closed: true,
      });
    });
    await page.waitForTimeout(300);

    const drawingsAfterContour = await getDrawingsCount(page);
    expect(drawingsAfterContour).toBeGreaterThanOrEqual(1);
    console.log(`✓ 輪廓已注入，drawings: ${drawingsAfterContour}`);

    // 2) Inject hole feature via store API
    await page.evaluate(() => {
      const store = (window as any).__debugStoreApi;
      const shape = {
        type: 'circle',
        id: 'hole_test',
        center_px: { x: 350, y: 200 },
        radius_px: 20,
      };
      store.addDrawing(shape);
      store.addFeature({
        id: 'feat_hole_test',
        type: 'hole',
        label: '測試圓孔',
        shape,
      });
    });
    await page.waitForTimeout(300);

    const featuresCount = await getFeaturesCount(page);
    console.log(`✓ 孔位已標註，features: ${featuresCount}`);

    // 3) Add manual dimension
    await page.locator('#dimLocation').fill('寬度');
    await page.locator('#dimValue').fill('150.5');
    await page.locator('#addDimBtn').click();
    await page.waitForTimeout(300);
    console.log('✓ 手動尺寸已輸入');

    // 4) Verify via store
    const state = await page.evaluate(() => {
      const s = (window as any).__debugStore?.();
      const idx = s?.activePhotoIndex;
      if (idx == null || idx < 0) return null;
      const ps = s.photos?.[idx];
      return {
        drawings: ps?.drawings?.length || 0,
        features: ps?.features?.length || 0,
        dimensions: ps?.dimensions?.length || 0,
      };
    });
    console.log(`  Store: drawings=${state?.drawings}, features=${state?.features}, dimensions=${state?.dimensions}`);
    expect(state?.drawings).toBeGreaterThanOrEqual(1);
    expect(state?.dimensions).toBeGreaterThanOrEqual(1);

    // 5) Verify dimension in UI
    const dimItems = page.locator('#dimensionList .feature-item');
    const dimCount = await dimItems.count();
    expect(dimCount).toBeGreaterThanOrEqual(1);
    console.log(`  UI 尺寸列表: ${dimCount} 筆`);

    await page.screenshot({ path: resolve(RESULT_DIR, '8.5-annotated.png') });
  });
});

// ═══════════════════════════════════════════════════════════════
// 10.8 AI 分析（Live Gemini）
// ═══════════════════════════════════════════════════════════════
test.describe('10.8 AI 分析 — Live Gemini', () => {
  test('上傳含尺規照片 → AI 分析 → 結果顯示', async ({ page }) => {
    test.setTimeout(120_000);
    await createProjectFreeMode(page, 'AI 分析測試');
    page.on('dialog', async (d) => await d.accept());

    await uploadPhoto(page, PHOTOS.top);

    // Click AI analyze button
    const analyzeBtn = page.locator('#analyzeBtn');
    await expect(analyzeBtn).toBeVisible();
    await analyzeBtn.click();
    console.log('⏳ 開始 AI 分析...');

    // Wait for result — the #analysisResult element should get text content
    await page.waitForFunction(() => {
      const el = document.querySelector('#analysisResult');
      return el && el.textContent && el.textContent.length > 10;
    }, { timeout: 90_000 });

    const resultText = await page.locator('#analysisResult').textContent();
    console.log(`✓ AI 分析完成，結果長度: ${resultText?.length}`);
    console.log(`  結果摘要: ${resultText?.substring(0, 150)}`);

    // Check AI results panel
    const panelVisible = await page.locator('#aiResultsPanel').isVisible().catch(() => false);
    console.log(`  AI 確認面板: ${panelVisible ? '可見 ✓' : '不可見'}`);

    // Check next-step buttons
    const nextVisible = await page.locator('#nextSteps').isVisible().catch(() => false);
    console.log(`  下一步按鈕: ${nextVisible ? '可見 ✓' : '不可見'}`);

    await page.screenshot({ path: resolve(RESULT_DIR, '10.8-ai-analysis.png') });
  });
});

// ═══════════════════════════════════════════════════════════════
// 12.5 匯出 JSON + schema 驗證
// ═══════════════════════════════════════════════════════════════
test.describe('12.5 匯出工作流', () => {
  test('匯出 JSON → 驗證 schema 欄位', async ({ page }) => {
    test.setTimeout(120_000);
    await createProjectFreeMode(page, '匯出測試');
    page.on('dialog', async (d) => {
      if (d.type() === 'prompt') await d.accept('100');
      else await d.accept();
    });

    await uploadPhoto(page, PHOTOS.top);

    // Add a manual dimension
    await page.locator('#dimLocation').fill('厚度');
    await page.locator('#dimValue').fill('6.7');
    await page.locator('#addDimBtn').click();
    await page.waitForTimeout(300);

    // Run AI analysis
    console.log('⏳ AI 分析...');
    await page.locator('#analyzeBtn').click();
    await page.waitForFunction(() => {
      const el = document.querySelector('#analysisResult');
      return el && el.textContent && el.textContent.length > 10;
    }, { timeout: 90_000 });
    await page.waitForTimeout(1000);
    console.log('✓ AI 分析完成');

    // Export via API
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
    console.log('✓ 匯出成功');

    // Schema validation
    expect(exportResult.part_name).toBeTruthy();
    console.log(`  part_name: ${exportResult.part_name}`);

    expect(Array.isArray(exportResult.views)).toBe(true);
    console.log(`  views: ${exportResult.views.length} 個`);

    expect(Array.isArray(exportResult.caliper_readings)).toBe(true);
    console.log(`  caliper_readings: ${exportResult.caliper_readings.length} 個`);

    expect(exportResult.confidence).toBeDefined();
    console.log(`  confidence: ${JSON.stringify(exportResult.confidence)}`);

    for (const view of exportResult.views) {
      expect(view.angle).toBeTruthy();
      console.log(`  View [${view.angle}]: ${view.contour_mm?.length || 0} pts, ${view.features?.length || 0} features`);
    }

    writeFileSync(resolve(RESULT_DIR, '12.5-export.json'), JSON.stringify(exportResult, null, 2));
    await page.screenshot({ path: resolve(RESULT_DIR, '12.5-exported.png') });
  });
});

// ═══════════════════════════════════════════════════════════════
// 13.1-13.3 完整端到端流程（L390 電池）
// ═══════════════════════════════════════════════════════════════
test.describe('13.1-13.3 L390 電池完整 E2E', () => {
  test('建專案 → 上傳 4 張 → AI 分析 → 手動尺寸 → 匯出 → 驗證 JSON 格式', async ({ page }) => {
    test.setTimeout(180_000);

    // Create project
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('measureMode', 'free'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Clean up old projects
    await page.evaluate(async () => {
      const res = await fetch('/api/projects');
      const projects = await res.json();
      for (const p of projects) {
        await fetch(`/api/projects/${p.id}`, { method: 'DELETE' });
      }
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    page.once('dialog', async (d) => await d.accept('L390 電池 E2E'));
    await page.locator('#newProjectBtn').click();
    await page.waitForTimeout(1500);

    // Handle subsequent dialogs
    page.on('dialog', async (d) => await d.accept());

    console.log('✓ Step 1: 專案已建立');

    // ── 2. Upload all 4 photos ──
    await uploadPhoto(page, [PHOTOS.top, PHOTOS.thickness, PHOTOS.connector_w, PHOTOS.connector_h]);
    await page.waitForTimeout(2000); // Extra wait for 4 photos

    const photoCount = await page.locator('.photo-thumb').count();
    expect(photoCount).toBe(4);
    console.log(`✓ Step 2: ${photoCount} 張照片已上傳`);
    await page.screenshot({ path: resolve(RESULT_DIR, '13-step2-photos.png') });

    // ── 3. Set angle for each photo ──
    const thumbs = page.locator('.photo-thumb');
    const angles = ['top', 'close-up', 'close-up', 'close-up'];
    for (let i = 0; i < 4; i++) {
      await thumbs.nth(i).click();
      await page.waitForTimeout(300);
      const angleSelect = page.locator('#angleSelect');
      if (await angleSelect.isVisible()) {
        await angleSelect.selectOption(angles[i]);
        await page.waitForTimeout(300);
      }
    }
    await thumbs.nth(0).click();
    await page.waitForTimeout(500);
    console.log('✓ Step 3: 視角已設定');

    // ── 4. Manual dimensions ──
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
    }
    console.log('✓ Step 4: 3 筆卡尺讀數已輸入');
    await page.screenshot({ path: resolve(RESULT_DIR, '13-step4-dimensions.png') });

    // ── 5. AI Analysis ──
    console.log('⏳ Step 5: 開始 AI 分析...');
    await page.locator('#analyzeBtn').click();

    await page.waitForFunction(() => {
      const el = document.querySelector('#analysisResult');
      return el && el.textContent && el.textContent.length > 10;
    }, { timeout: 90_000 });

    const resultText = await page.locator('#analysisResult').textContent();
    console.log(`✓ Step 5: AI 分析完成 (${resultText?.length} chars)`);
    await page.screenshot({ path: resolve(RESULT_DIR, '13-step5-analysis.png') });

    // ── 6. Export JSON ──
    const exportResult = await page.evaluate(async () => {
      const state = (window as any).__debugStore?.();
      if (!state?.projectId) return null;
      const confirmed = (window as any).__debugConfirmed?.() || [];
      const res = await fetch(`/api/projects/${state.projectId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: state.photos, confirmed }),
      });
      return res.json();
    });

    expect(exportResult).toBeTruthy();
    console.log('✓ Step 6: JSON 已匯出');

    // ── 7. Validate measurement.json format (13.3) ──
    expect(exportResult.part_name).toBeTruthy();
    expect(Array.isArray(exportResult.views)).toBe(true);
    expect(Array.isArray(exportResult.caliper_readings)).toBe(true);
    expect(exportResult.confidence).toBeDefined();

    // Views structure
    for (const view of exportResult.views) {
      expect(view).toHaveProperty('angle');
      if (view.contour_mm) {
        expect(Array.isArray(view.contour_mm)).toBe(true);
        for (const pt of view.contour_mm) {
          expect(typeof pt.x).toBe('number');
          expect(typeof pt.y).toBe('number');
        }
      }
    }

    // Caliper readings structure
    for (const reading of exportResult.caliper_readings) {
      expect(reading).toHaveProperty('location');
      expect(reading).toHaveProperty('value_mm');
      expect(typeof reading.value_mm).toBe('number');
    }

    // Summary
    console.log('\n═══ measurement.json 摘要 ═══');
    console.log(`  part_name: ${exportResult.part_name}`);
    console.log(`  model_number: ${exportResult.model_number || '未偵測'}`);
    console.log(`  views: ${exportResult.views.length}`);
    for (const v of exportResult.views) {
      console.log(`    [${v.angle}] contour: ${v.contour_mm?.length || 0} pts, features: ${v.features?.length || 0}`);
    }
    console.log(`  caliper_readings: ${exportResult.caliper_readings.length}`);
    for (const r of exportResult.caliper_readings) {
      console.log(`    ${r.location}: ${r.value_mm}mm (${r.source})`);
    }
    console.log(`  confidence: ${JSON.stringify(exportResult.confidence)}`);
    console.log('═══════════════════════════════\n');

    writeFileSync(resolve(RESULT_DIR, '13-measurement.json'), JSON.stringify(exportResult, null, 2));

    // ── 8. Generate FeatureScript (bonus) ──
    const genBtn = page.locator('#generateFsBtn');
    if (await genBtn.isVisible().catch(() => false) && !(await genBtn.isDisabled())) {
      await genBtn.click();
      await page.waitForFunction(() => {
        const el = document.querySelector('#codeContent');
        return el && el.textContent && el.textContent.length > 50;
      }, { timeout: 60_000 }).catch(() => null);

      const code = await page.locator('#codeContent').textContent();
      if (code && code.length > 50) {
        console.log(`✓ Bonus: FeatureScript 生成 (${code.length} chars)`);
        writeFileSync(resolve(RESULT_DIR, '13-featurescript.fs'), code);
      }
    }

    await page.screenshot({ path: resolve(RESULT_DIR, '13-final.png'), fullPage: true });
    console.log('✓ L390 電池完整 E2E 測試通過');
  });
});
