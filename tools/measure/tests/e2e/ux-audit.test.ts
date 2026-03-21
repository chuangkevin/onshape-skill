import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = resolve(__dirname, '../../data/ux-audit');
const TEST_PHOTO = 'D:/GitClone/trackpoint-laptop/doc/L390/硬體參考/鍵盤/S__10092548_0.jpg';

const auditLog: Array<{ step: string; screenshot: string; observation: string }> = [];

function log(step: string, screenshot: string, observation: string) {
  auditLog.push({ step, screenshot, observation });
  console.log(`\n[AUDIT] ${step}: ${observation}`);
}

test.describe('UX 流程審計（新流程）', () => {
  test.beforeAll(() => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('完整流程：Landing → 新建專案 → 模式選擇 → 上傳 → AI 分析 → 確認', async ({ page }) => {
    // Clear state
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // ── Step 1: Landing Page ──
    const ss1 = resolve(SCREENSHOT_DIR, '01-landing.png');
    await page.screenshot({ path: ss1, fullPage: true });

    const landing = page.locator('#projectLanding');
    const landingVisible = await landing.isVisible().catch(() => false);
    log('01-Landing', ss1, landingVisible ? 'Landing Page 可見 ✓' : 'Landing Page 不可見 ✗');

    const newBtn = page.locator('#newProjectBtn');
    const newBtnVisible = await newBtn.isVisible().catch(() => false);
    log('01-新建按鈕', ss1, newBtnVisible ? '新建專案按鈕可見 ✓' : '新建專案按鈕不可見 ✗');

    // ── Step 2: 新建專案 ──
    // Handle the prompt dialog
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('E2E 測試專案');
      } else if (dialog.type() === 'confirm') {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });

    await newBtn.click();
    await page.waitForTimeout(1000);

    const ss2 = resolve(SCREENSHOT_DIR, '02-after-new-project.png');
    await page.screenshot({ path: ss2, fullPage: true });

    // Landing should be hidden now, workspace or mode selector visible
    const landingHidden = await landing.evaluate(el => el.classList.contains('hidden')).catch(() => false);
    log('02-專案建立', ss2, landingHidden ? 'Landing 已隱藏 ✓' : 'Landing 仍然可見 ✗');

    // ── Step 3: 模式選擇 ──
    const modeSelector = page.locator('#modeSelector');
    const modeVisible = await modeSelector.isVisible().catch(() => false);
    log('03-模式選擇', ss2, modeVisible ? '模式選擇器可見 ✓' : '模式選擇器不可見（可能已有偏好）');

    if (modeVisible) {
      const wizardCard = page.locator('[data-mode="wizard"]');
      if (await wizardCard.isVisible().catch(() => false)) {
        await wizardCard.click();
        await page.waitForTimeout(500);
      }
    }

    const ss3 = resolve(SCREENSHOT_DIR, '03-mode-selected.png');
    await page.screenshot({ path: ss3, fullPage: true });

    // ── Step 4: Workspace 可見 ──
    const workspace = page.locator('#workspace');
    const workspaceVisible = await workspace.isVisible().catch(() => false);
    log('04-Workspace', ss3, workspaceVisible ? 'Workspace 可見 ✓' : 'Workspace 不可見 ✗');

    const wizard = page.locator('#wizardOverlay');
    const wizardVisible = await wizard.isVisible().catch(() => false);
    log('04-Wizard', ss3, wizardVisible ? 'Wizard 可見 ✓' : 'Wizard 不可見 ✗');

    // ── Step 5: 上傳照片 ──
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(TEST_PHOTO);
    await page.waitForTimeout(3000); // Wait for upload + auto-analysis start

    const ss5 = resolve(SCREENSHOT_DIR, '05-after-upload.png');
    await page.screenshot({ path: ss5, fullPage: true });

    const photoThumb = page.locator('.photo-thumb');
    const thumbCount = await photoThumb.count();
    log('05-上傳照片', ss5, thumbCount > 0 ? `照片縮圖 (${thumbCount}張) ✓` : '無照片 ✗');

    // Check wizard step
    const activeWizStep = await page.locator('.wiz-step.active').textContent().catch(() => '');
    log('05-Wizard步驟', ss5, `當前步驟: "${activeWizStep}"`);

    // Check wizard body for auto-analysis progress
    const wizBody = await page.locator('#wizardBody').textContent().catch(() => '');
    log('05-Wizard內容', ss5, `內容: "${wizBody?.substring(0, 80)}..."`);

    // ── Step 6: 等待 AI 分析完成 ──
    // Wait up to 20 seconds for analysis to complete
    await page.waitForTimeout(15000);

    const ss6 = resolve(SCREENSHOT_DIR, '06-after-analysis.png');
    await page.screenshot({ path: ss6, fullPage: true });

    const activeWizStep6 = await page.locator('.wiz-step.active').textContent().catch(() => '');
    log('06-分析後步驟', ss6, `當前步驟: "${activeWizStep6}"`);

    const wizBody6 = await page.locator('#wizardBody').textContent().catch(() => '');
    log('06-分析結果', ss6, `內容: "${wizBody6?.substring(0, 100)}..."`);

    // Check for scale detection
    const hasScaleConfirm = wizBody6?.includes('偵測到') || wizBody6?.includes('確認') || false;
    const hasManualFallback = wizBody6?.includes('手動') || wizBody6?.includes('未偵測') || false;
    log('06-比例尺偵測', ss6,
      hasScaleConfirm ? '偵測到比例尺，顯示確認 ✓' :
      hasManualFallback ? '未偵測到，顯示手動模式 ✓' :
      '無比例尺相關內容 ✗');

    // ── Step 7: 檢查右側面板 ──
    const guideSection = page.locator('#guideSection');
    const guideHidden = await guideSection.evaluate(
      el => el.style.display === 'none' || !el.offsetParent
    ).catch(() => false);
    log('07-右側面板', ss6, guideHidden ? 'Wizard模式下操作流程已隱藏 ✓' : '操作流程仍然可見');

    // ── Step 8: Sidebar 專案名稱 ──
    const sidebarName = await page.locator('#sidebarProjectName').textContent().catch(() => '');
    log('08-Sidebar', ss6, sidebarName ? `專案名稱: "${sidebarName}" ✓` : '無專案名稱 ✗');

    const backBtn = page.locator('#backToLanding');
    const backVisible = await backBtn.isVisible().catch(() => false);
    log('08-返回按鈕', ss6, backVisible ? '← 返回按鈕可見 ✓' : '返回按鈕不可見 ✗');

    // ── Final: 寫入報告 ──
    const report = [
      '# UX 審計報告（新流程）',
      `日期: ${new Date().toISOString()}`,
      '',
      '## 審計結果',
      '',
      ...auditLog.map((item) => [
        `### ${item.step}`,
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
  });
});
