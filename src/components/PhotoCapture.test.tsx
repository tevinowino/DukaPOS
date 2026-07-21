import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { PhotoCapture } from "./PhotoCapture";

const compressImageMock = vi.fn();

vi.mock("@/lib/media/compressImage", () => ({
  compressImage: (...args: unknown[]) => compressImageMock(...args),
}));

const messages = {
  photoCapture: {
    takePhotoLabel: "Take a photo of the product",
  },
};

describe("PhotoCapture", () => {
  it("compresses the selected file and calls onCapture with the compressed result", async () => {
    const compressedBlob = new Blob(["compressed"], { type: "image/jpeg" });
    compressImageMock.mockResolvedValue(compressedBlob);
    const onCapture = vi.fn();
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PhotoCapture onCapture={onCapture} />
      </NextIntlClientProvider>,
    );

    const file = new File(["original-photo-bytes"], "photo.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText("Take a photo of the product");
    await user.upload(input, file);

    expect(compressImageMock).toHaveBeenCalledWith(file);
    expect(onCapture).toHaveBeenCalledWith(compressedBlob);
  });
});
