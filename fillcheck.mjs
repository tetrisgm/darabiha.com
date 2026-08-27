import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
function session(email) {
  const secret = execFileSync("security", ["find-generic-password", "-s", "darabiha-session-secret", "-w"]).toString().trim();
  const b64 = (i) => Buffer.from(i).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const p = b64(JSON.stringify({ subject: "fill-view-check", email, displayName: "Fill view check", exp: Math.floor(Date.now() / 1000) + 900 }));
  return `${p}.${b64(createHmac("sha256", secret).update(p).digest())}`;
}
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await context.addCookies([{ name: "darabiha_session", value: session("ramine@ramine.net"), url: "https://darabiha.com" }]);
const page = await context.newPage();
await page.goto("https://darabiha.com/", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "Fill in", exact: true }).click();
await page.waitForTimeout(2500);

const heads = page.locator(".fill-row-head");
const topOf = (i) => page.locator(".fill-row").nth(i).evaluate((el) => Math.round(el.getBoundingClientRect().top));

// bring a stretch of rows into view
await page.locator(".fill-row").nth(4).scrollIntoViewIfNeeded();
await page.waitForTimeout(400);

// 1. open an upper row, then click a lower one: the lower must not move
await heads.nth(2).click();
await page.waitForTimeout(700);
const before = await topOf(6);
const name6 = await page.locator(".fill-row").nth(6).locator(".fill-cell").first().innerText();
await heads.nth(6).click();
await page.waitForTimeout(800);
const after = await topOf(6);
console.log(`clicked row 6 (${name6}) while row 2 was open`);
console.log("  row 6 moved by:", after - before, "px");
console.log("  row 6 is open:", await page.locator(".fill-row").nth(6).evaluate((el) => el.classList.contains("is-open")));

// 2. what the open editor offers
const fields = await page.locator(".fill-row.is-open .fill-field label").allInnerTexts();
console.log("  editor fields:", fields.join(" | "));
console.log("  clear-death x present:", await page.locator(".fill-row.is-open .fact-clear").count());
await page.locator(".fill-row.is-open").screenshot({ path: "/private/tmp/claude-501/-Users-shokunin-dev-darabiha-com/611f9a2f-f9e0-41ad-bff4-3bcd74bb5c73/scratchpad/fill-open.png" });
await browser.close();
