import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expect, test } from "vitest";
import PainAccordion from "../../src/components/landing/PainAccordion";

test("opening the second card closes the first", async () => {
  render(<PainAccordion />);

  const stateToggle = page.getByRole("button", { name: /according to my state/i });
  const clockToggle = page.getByRole("button", { name: /two clocks/i });

  await stateToggle.click();
  await expect.element(page.getByText(/State ends up owned twice/i)).toBeVisible();

  await clockToggle.click();
  await expect.element(page.getByText(/Scheduling gets reinvented/i)).toBeVisible();
  await expect.element(page.getByText(/State ends up owned twice/i)).not.toBeInTheDocument();
});
