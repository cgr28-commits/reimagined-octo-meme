/** Set a passenger or bag count using the controls available at this viewport. */
export async function setQuoteCount(page, field, target) {
  const control = page.locator(`#quote-section-${field}:visible`).first();
  await control.waitFor();
  if (await control.evaluate(el => el.tagName === "SELECT")) {
    await control.selectOption(String(target));
    return;
  }
  const numericValue = () => control.innerText().then(text => Number.parseInt(text, 10));
  let current = await numericValue();
  while (Number.isFinite(current) && current !== target) {
    const direction = current < target ? "plus" : "minus";
    const row = control.locator("..");
    await row.locator(`[data-d2-stepper-btn="${direction}"]`).click();
    const next = await numericValue();
    if (next === current) throw Error(`${field} stayed at ${current} after ${direction}`);
    current = next;
  }
  if (current !== target) throw Error(`Could not set ${field} to ${target}`);
}
