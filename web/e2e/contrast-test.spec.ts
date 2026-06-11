import { test, expect } from "@playwright/test";

const TEXT = "其实我对已知历史也没有特别强烈个人看法，基本相信这个世界来历的真实性。";

test("bottom bar icons are dark on light themes, light on dark", async ({ page }) => {
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("book-companion:jiyuan:text", t), TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // theme cycle order: night -> paper -> white
  const expected = ["light", "dark", "dark"];

  for (let i = 0; i < 3; i++) {
    const data = await page.evaluate(() => {
      const bar = Array.from(document.querySelectorAll<HTMLElement>('[class*="fixed"]')).find(
        (el) => getComputedStyle(el).position === "fixed" && getComputedStyle(el).bottom === "0px",
      );
      const iconSpan = bar?.querySelector<HTMLElement>("button span");
      const headerBtn = Array.from(
        document.querySelectorAll<HTMLElement>('button[aria-label="目录"]'),
      ).find((el) => el.offsetParent !== null);
      return {
        icon: iconSpan ? getComputedStyle(iconSpan).color : "",
        header: headerBtn ? getComputedStyle(headerBtn).color : "",
      };
    });
    const rgb = data.icon.match(/(\d+), (\d+), (\d+)/);
    const brightness = rgb ? (Number(rgb[1]) + Number(rgb[2]) + Number(rgb[3])) / 3 : -1;
    const polarity = brightness > 128 ? "light" : "dark";
    console.log(`[contrast] theme ${i}: icon=${data.icon} (${polarity}) header=${data.header}`);
    expect(polarity).toBe(expected[i]);
    expect(data.header).toBe(data.icon);

    await page.screenshot({ path: `.observe/theme-${i}.png` });
    await page.locator("button:visible", { hasText: "背景" }).first().click();
    await page.waitForTimeout(400);
  }
});

test("drawer panel buttons are visible in all themes", async ({ page }) => {
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("book-companion:jiyuan:text", t), TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // open the settings drawer via header "A" button
  await page.locator('button[aria-label="设置"]:visible').first().click();
  await page.waitForTimeout(500);

  const expected = ["light", "dark", "dark"]; // night -> paper -> white

  for (let i = 0; i < 3; i++) {
    const data = await page.evaluate(() => {
      const sheet = document.querySelector<HTMLElement>("section.fixed.z-50, section[class*='z-50']");
      const tab = Array.from(document.querySelectorAll<HTMLElement>("button"))
        .find((b) => b.textContent === "听书" && b.offsetParent !== null);
      const fontBtn = Array.from(document.querySelectorAll<HTMLElement>("button"))
        .find((b) => b.textContent === "A-" && b.offsetParent !== null && b.closest("section"));
      const paperBtn = Array.from(document.querySelectorAll<HTMLElement>("button"))
        .find((b) => b.textContent === "纸页" && b.offsetParent !== null);
      return {
        tab: tab ? getComputedStyle(tab).color : "",
        fontBtn: fontBtn ? getComputedStyle(fontBtn).color : "",
        paperBtn: paperBtn ? getComputedStyle(paperBtn).color : "",
      };
    });
    const polarity = (c: string) => {
      const m = c.match(/(\d+), (\d+), (\d+)/);
      if (!m) return "?";
      return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 > 128 ? "light" : "dark";
    };
    console.log(
      `[drawer] theme ${i}: tab=${data.tab}(${polarity(data.tab)}) A-=${data.fontBtn}(${polarity(data.fontBtn)}) 纸页=${data.paperBtn}(${polarity(data.paperBtn)})`,
    );
    expect(polarity(data.tab)).toBe(expected[i]);
    expect(polarity(data.fontBtn)).toBe(expected[i]);
    // 纸页 preview button always shows paper theme's dark text
    expect(polarity(data.paperBtn)).toBe("dark");

    await page.screenshot({ path: `.observe/drawer-theme-${i}.png` });

    // switch theme via the in-drawer theme buttons: cycle night->paper->white
    const next = ["纸页", "白昼", "夜读"][i];
    await page.locator(`button:visible`, { hasText: next }).first().click();
    await page.waitForTimeout(400);
  }
});
