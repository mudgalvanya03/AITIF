import { test } from "@playwright/test";
import { getHealedLocator } from "../../modules/locator-recovery/healer/healingExecutor";

test("Generate healing dataset - edge cases", async ({ page }) => {

  await page.goto("https://www.saucedemo.com");

  // wrong attribute selectors
  await getHealedLocator(page, "[name='user_wrong']", "username_input");
  await getHealedLocator(page, "[name='pass_wrong']", "password_input");

  // wrong tag
  await getHealedLocator(page, "div.login_button", "login_button");

  // generic selector
  await getHealedLocator(page, "button", "login_button");

  await page.locator("#user-name").fill("standard_user");
  await page.locator("#password").fill("secret_sauce");
  await page.locator("#login-button").click();

  // wrong class
  await getHealedLocator(page, ".cart_wrong", "shopping_cart_link");

  // wrong data attribute
  await getHealedLocator(page, "[data-test='menu_wrong']", "menu_button");

  // overly generic
  await getHealedLocator(page, "select", "filter_dropdown");

  // partial attribute
  await getHealedLocator(page, "[data-test='add']", "add_backpack");

  // wrong tag again
  await getHealedLocator(page, "div.inventory_item", "add_bike_light");

});