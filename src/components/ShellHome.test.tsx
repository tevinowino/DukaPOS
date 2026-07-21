import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { ShellHome } from "./ShellHome";

describe("ShellHome", () => {
  it("renders the app name from the en message catalog", () => {
    render(
      <NextIntlClientProvider
        locale="en"
        messages={{
          shell: {
            appName: "DukaPOS",
            tagline: "Track stock and sales from your phone",
            viewStockButton: "View stock",
          },
        }}
      >
        <ShellHome />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("DukaPOS")).toBeInTheDocument();
  });
});
