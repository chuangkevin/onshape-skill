import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = resolve(__dirname, '../../data/ux-audit');
const TEST_PHOTO = 'D:/Projects/trackpoint-laptop/doc/L390/硬體參考/鍵盤/S__10092548_0.jpg';

// Collect all screenshots + findings for final AI audit
const auditLog: Array<{ step: string; screenshot: string; observation: string }> = [];

function log(step: string, screenshot: string, observation: string) {
  auditLog.push({ step, screenshot, observation });
  console.log(`\n[AUDIT] ${step}: ${observation}`);
}

test.describe('UX 流程審計', () => {
  test.beforeAll(() => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('完整流程：首次開啟 → 上傳 → 校準 → 描繪 → 分析 → 匯出', async ({ page }) => {
    // Clear localStorage to simulate first visit
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');

    // ── Step 1: 首次開啟 — 應該看到模式選擇器 ──
    await page.waitForTimeout(1000);
    const ss1 = resolve(SCREENSHOT_DIR, '01-首次開啟.png');
    await page.screenshot({ path: ss1, fullPage: true });

    const modeSelector = page.locator('#modeSelector');
    const modeSelectorVisible = await modeSelector.isVisible().catch(() => false);
    log('01-首次開啟', ss1,
      modeSelectorVisible
        ? '模式選擇器可見 ✓'
        : '模式選擇器不可見 ✗ — 使用者不知道有引導模式');

    // ── Step 2: 選擇引導模式 ──
    if (modeSelectorVisible) {
      const wizardCard = page.locator('[data-mode="wizard"]');
      if (await wizardCard.isVisible().catch(() => false)) {
        await wizardCard.click();
        await page.waitForTimeout(500);
      }
    }
    const ss2 = resolve(SCREENSHOT_DIR, '02-選擇引導模式後.png');
    await page.screenshot({ path: ss2, fullPage: true });

    const wizardOverlay = page.locator('#wizardOverlay');
    const wizardVisible = await wizardOverlay.isVisible().catch(() => false);
    log('02-選擇引導模式', ss2,
      wizardVisible
        ? 'Wizard 可見 ✓'
        : 'Wizard 不可見 ✗ — 選了引導模式但沒出現精靈');

    // Check wizard step
    const activeStep = await page.locator('.wiz-step.active').textContent().catch(() => '');
    log('02-Wizard步驟', ss2, `當前步驟: "${activeStep}"`);

    // ── Step 3: 上傳照片 ──
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(TEST_PHOTO);
    await page.waitForTimeout(2000); // Wait for upload + render

    const ss3 = resolve(SCREENSHOT_DIR, '03-上傳照片後.png');
    await page.screenshot({ path: ss3, fullPage: true });

    // Check: photo visible in canvas?
    const photoThumb = page.locator('.photo-thumb');
    const thumbCount = await photoThumb.count();
    log('03-上傳照片', ss3,
      thumbCount > 0
        ? `照片縮圖出現 (${thumbCount}張) ✓`
        : '沒有照片縮圖 ✗');

    // Check: wizard advanced to step 2?
    const activeStep3 = await page.locator('.wiz-step.active').textContent().catch(() => '');
    log('03-Wizard步驟', ss3, `上傳後步驟: "${activeStep3}"`);

    // Check: scale tool activated?
    const activeToolBtn = await page.locator('.tool-btn.active').textContent().catch(() => '');
    log('03-工具狀態', ss3, `當前工具: "${activeToolBtn}"`);

    // Check: dropzone hidden?
    const dropzoneHidden = await page.locator('#dropzone').evaluate(el => el.classList.contains('hidden'));
    log('03-Dropzone', ss3, dropzoneHidden ? 'Dropzone 已隱藏 ✓' : 'Dropzone 仍然可見 ✗');

    // ── Step 4: 檢查右側面板和 Wizard 是否同步 ──
    const ss4 = resolve(SCREENSHOT_DIR, '04-面板同步檢查.png');
    await page.screenshot({ path: ss4, fullPage: true });

    // Right panel guide step
    const guideActiveStep = await page.locator('.guide-step.active .step-text').first().textContent().catch(() => '');
    const wizActiveStep = await page.locator('.wiz-step.active').textContent().catch(() => '');
    log('04-同步檢查', ss4,
      `右側面板步驟: "${guideActiveStep?.trim()}" / Wizard步驟: "${wizActiveStep?.trim()}"`);

    // ── Step 5: 比例尺工具提示 ──
    const toolHint = page.locator('#toolHint');
    const hintVisible = await toolHint.isVisible().catch(() => false);
    const hintText = hintVisible ? await toolHint.textContent() : '';
    log('05-工具提示', ss4,
      hintVisible
        ? `提示可見: "${hintText}" ✓`
        : '工具提示不可見 ✗ — 使用者不知道下一步');

    // ── Step 6: 嘗試在照片上點擊（模擬比例尺校準） ──
    // Click two points on the ruler area
    const canvas = page.locator('#drawingCanvas');
    const canvasBox = await canvas.boundingBox();
    if (canvasBox) {
      // Click approximately where ruler starts (left side)
      await canvas.click({ position: { x: canvasBox.width * 0.18, y: canvasBox.height * 0.62 } });
      await page.waitForTimeout(300);
      // Click approximately where ruler ends (right side)
      await canvas.click({ position: { x: canvasBox.width * 0.85, y: canvasBox.height * 0.62 } });
      await page.waitForTimeout(300);
    }

    const ss6 = resolve(SCREENSHOT_DIR, '06-點擊比例尺後.png');
    await page.screenshot({ path: ss6, fullPage: true });

    // Check if dialog appeared (scale tool should prompt for distance)
    // Note: prompt() is blocking in Playwright, we need to handle it
    log('06-比例尺互動', ss6, '嘗試點擊兩點（prompt dialog 可能出現）');

    // ── Step 7: 檢查所有按鈕是否可用 ──
    const buttons = await page.locator('.tool-btn').all();
    const buttonStates: string[] = [];
    for (const btn of buttons) {
      const text = await btn.textContent();
      const disabled = await btn.isDisabled();
      buttonStates.push(`${text}(${disabled ? '禁用' : '可用'})`);
    }
    log('07-按鈕狀態', ss6, `所有按鈕: ${buttonStates.join(', ')}`);

    // ── Step 8: 檢查 AI 分析按鈕 ──
    const analyzeBtn = page.locator('#analyzeBtn');
    const analyzeBtnVisible = await analyzeBtn.isVisible().catch(() => false);
    const analyzeBtnText = await analyzeBtn.textContent().catch(() => '');
    log('08-AI分析按鈕', ss6,
      analyzeBtnVisible
        ? `可見: "${analyzeBtnText}" ✓`
        : 'AI分析按鈕不可見 ✗');

    // ── Step 9: 檢查匯出按鈕 ──
    const exportBtn = page.locator('#exportBtn');
    const exportVisible = await exportBtn.isVisible().catch(() => false);
    log('09-匯出按鈕', ss6, exportVisible ? '匯出按鈕可見 ✓' : '匯出按鈕不可見 ✗');

    // ── Step 10: 嘗試切換到自由模式 ──
    const modeToggle = page.locator('#modeToggle, #modeToggleBtn').first();
    if (await modeToggle.isVisible().catch(() => false)) {
      await modeToggle.click();
      await page.waitForTimeout(500);
    }

    const ss10 = resolve(SCREENSHOT_DIR, '10-自由模式.png');
    await page.screenshot({ path: ss10, fullPage: true });

    const wizardAfterToggle = await page.locator('#wizardOverlay').isVisible().catch(() => false);
    log('10-模式切換', ss10,
      !wizardAfterToggle
        ? '切到自由模式，Wizard 隱藏 ✓'
        : 'Wizard 仍然可見 ✗');

    // ── Final: 寫入審計報告 ──
    const report = [
      '# UX 審計報告',
      `日期: ${new Date().toISOString()}`,
      `測試照片: ${TEST_PHOTO}`,
      '',
      '## 審計結果',
      '',
      ...auditLog.map((item, i) => [
        `### ${item.step}`,
        `截圖: ${item.screenshot}`,
        `結果: ${item.observation}`,
        '',
      ].join('\n')),
    ].join('\n');

    writeFileSync(resolve(SCREENSHOT_DIR, 'audit-report.md'), report);
    console.log('\n\n========== UX 審計摘要 ==========');
    for (const item of auditLog) {
      const icon = item.observation.includes('✗') ? '❌' : item.observation.includes('✓') ? '✅' : 'ℹ️';
      console.log(`${icon} ${item.step}: ${item.observation}`);
    }
    console.log('=================================\n');
    console.log(`報告已寫入: ${resolve(SCREENSHOT_DIR, 'audit-report.md')}`);
    console.log(`截圖目錄: ${SCREENSHOT_DIR}`);
  });
});
