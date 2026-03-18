import { test } from "@playwright/test";
import { getHealedLocator } from "../../modules/locator-recovery/healer/healingExecutor";


test("Healing executor demo", async ({ page }) => {

  await page.goto("https://www.saucedemo.com");

  // intentionally wrong selector
  const healed = await getHealedLocator(
    page,
    "#login-button",
    "login_button"
  );

  if (healed) {
    await healed.click();
    console.log("Healing worked, clicked recovered element");
  } else {
    console.log("Healing failed");
  }
});
