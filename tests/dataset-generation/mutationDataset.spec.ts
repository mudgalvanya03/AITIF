import { test } from "@playwright/test";
import { getHealedLocator } from "../../modules/locator-recovery/healer/healingExecutor";

const mutations = [
  "id",
  "class",
  "placeholder",
  "structure",
  "siblingNoise"
];

test("Generate diverse healing dataset", async ({ page }) => {

  await page.goto("https://www.saucedemo.com/");

  for (let i = 0; i < 50; i++) {

    const mutation = mutations[Math.floor(Math.random() * mutations.length)];

    await page.evaluate((mutationType) => {

      const input = document.querySelector('input[data-test="username"]');

      if (!input) return;

      if (mutationType === "id") {
        input.id = "user_login_" + Math.floor(Math.random() * 1000);
      }

      if (mutationType === "class") {
        input.className = "input_field_" + Math.floor(Math.random() * 10);
      }

      if (mutationType === "placeholder") {
        input.setAttribute("placeholder", "Login ID");
      }

      if (mutationType === "structure") {

        const wrapper = document.createElement("div");
        wrapper.className = "wrapper";

        input.parentElement?.appendChild(wrapper);
        wrapper.appendChild(input);

      }

      if (mutationType === "siblingNoise") {

        for (let j = 0; j < 3; j++) {

          const fake = document.createElement("input");
          fake.placeholder = ["Email", "Phone", "User ID"][j];

          input.parentElement?.appendChild(fake);

        }

      }

    }, mutation);

    const locator = await getHealedLocator(
      page,
      "#username_broken",
      "username_input"
    );

    await locator?.fill("standard_user");

  }

});