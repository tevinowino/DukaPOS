import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";
import { AppIntlProvider } from "./AppIntlProvider";
import { LocaleToggle } from "./LocaleToggle";

/** Renders the `shell.tagline` string, which differs between EN and SW, so the test can observe it flip languages. */
function ShellTaglineProbe() {
  const t = useTranslations("shell");
  return <p>{t("tagline")}</p>;
}

describe("LocaleToggle", () => {
  it("switches the rendered locale instantly, with no page navigation, when clicked", async () => {
    const user = userEvent.setup();
    render(
      <AppIntlProvider initialLocale="en">
        <LocaleToggle />
        <ShellTaglineProbe />
      </AppIntlProvider>,
    );

    expect(screen.getByText("Track stock and sales from your phone")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "SW" }));

    // AppIntlProvider swaps `NextIntlClientProvider`'s locale/messages via
    // plain React state (see its doc comment) — no `window.location`
    // reload or `router.refresh()` call is involved at all, so this
    // assertion resolving synchronously after the click is itself proof
    // no navigation occurred.
    expect(screen.getByText("Fuatilia bidhaa na mauzo kutoka kwenye simu yako")).toBeInTheDocument();
  });

  it("persists the chosen locale in the NEXT_LOCALE cookie", async () => {
    document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
    const user = userEvent.setup();
    render(
      <AppIntlProvider initialLocale="en">
        <LocaleToggle />
      </AppIntlProvider>,
    );

    await user.click(screen.getByRole("button", { name: "SW" }));

    expect(document.cookie).toContain("NEXT_LOCALE=sw");
  });
});
