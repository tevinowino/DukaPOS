import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/schema";
import { getShopProfile } from "@/lib/identity/shopIdentity";
import { OnboardingScreen } from "./OnboardingScreen";

const messages = {
  onboarding: {
    title: "Set up your shop",
    shopNameLabel: "Shop name",
    phoneLabel: "Phone number",
    shopNameRequired: "Enter your shop name",
    invalidPhone: "Enter a valid Kenyan phone number",
    continueButton: "Continue",
    setPinTitle: "Choose a 4-digit PIN",
    pinMismatch: "PINs didn't match — try again",
    confirmPinTitle: "Confirm your PIN",
    saving: "Setting up your shop…",
  },
};

function renderOnboarding(onComplete: () => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OnboardingScreen onComplete={onComplete} />
    </NextIntlClientProvider>,
  );
}

async function enterPin(user: ReturnType<typeof userEvent.setup>, pin: string) {
  for (const digit of pin) {
    await user.click(screen.getByRole("button", { name: digit }));
  }
}

describe("OnboardingScreen", () => {
  beforeEach(async () => {
    await db.shopProfile.clear();
  });

  it("completes onboarding and persists the shop profile when PINs match", async () => {
    const user = userEvent.setup();
    let completed = false;
    renderOnboarding(() => {
      completed = true;
    });

    await user.type(screen.getByLabelText("Shop name"), "Mama Njeri's Shop");
    await user.type(screen.getByLabelText("Phone number"), "0712345678");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await enterPin(user, "1234");
    await enterPin(user, "1234");

    await waitFor(() => expect(completed).toBe(true));

    const profile = await getShopProfile();
    expect(profile?.shopName).toBe("Mama Njeri's Shop");
    expect(profile?.phoneE164).toBe("+254712345678");
  });

  it("shows an error and persists nothing when the confirm PIN doesn't match", async () => {
    const user = userEvent.setup();
    renderOnboarding(() => {});

    await user.type(screen.getByLabelText("Shop name"), "Duka");
    await user.type(screen.getByLabelText("Phone number"), "0712345678");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await enterPin(user, "1234");
    await enterPin(user, "4321");

    expect(await screen.findByRole("alert")).toHaveTextContent("PINs didn't match");
    expect(await getShopProfile()).toBeUndefined();
  });

  it("blocks submission with an invalid phone number and stays on the details step", async () => {
    const user = userEvent.setup();
    renderOnboarding(() => {});

    await user.type(screen.getByLabelText("Shop name"), "Duka");
    await user.type(screen.getByLabelText("Phone number"), "12345");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "valid Kenyan phone number",
    );
    expect(screen.getByLabelText("Shop name")).toBeInTheDocument();
  });
});
