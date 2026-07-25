import { describe, expect, it, vi } from "vitest";
import { sendTransaction, shortenAddress, shortenAddressInText } from "./wallet";

describe("wallet address utilities", () => {
  it("shortens standard 0x EVM addresses", () => {
    expect(shortenAddress("0x53b87eac409c46a2cfddb10e761dfd0f3d58a0cb")).toBe("0x53b8…a0cb");
  });

  it("handles short or empty strings safely in shortenAddress", () => {
    expect(shortenAddress("")).toBe("");
    expect(shortenAddress("0x123")).toBe("0x123");
  });

  it("shortens full 0x EVM addresses embedded inside label text", () => {
    const text = "Transfer 1.0 HBAR to 0x53b87eac409c46a2cfddb10e761dfd0f3d58a0cb";
    expect(shortenAddressInText(text)).toBe("Transfer 1.0 HBAR to 0x53b8…a0cb");
  });

  it("leaves text without 0x addresses intact", () => {
    expect(shortenAddressInText("Transfer 1.0 HBAR to 0.0.1234")).toBe("Transfer 1.0 HBAR to 0.0.1234");
  });

  it("sends EVM transactions with safe 500,000 (0x7a120) gas limit", async () => {
    const mockRequest = vi.fn().mockResolvedValue("0xhash123");
    const mockProvider = { request: mockRequest, on: vi.fn(), removeListener: vi.fn() };

    const hash = await sendTransaction(mockProvider, "0xsender", {
      to: "0xtarget",
      value: "0x0",
    });

    expect(hash).toBe("0xhash123");
    expect(mockRequest).toHaveBeenCalledWith({
      method: "eth_sendTransaction",
      params: [{ from: "0xsender", to: "0xtarget", data: "0x", value: "0x0", gas: "0x7a120" }],
    });
  });
});
