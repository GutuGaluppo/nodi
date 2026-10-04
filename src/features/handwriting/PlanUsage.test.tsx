import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HandwritingClient } from "./client";
import PlanUsage from "./PlanUsage";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));
vi.mock("@tauri-apps/api/core", () => tauri);

function service(): HandwritingClient {
  return {
    available: true,
    usage: vi.fn().mockResolvedValue({
      plan: "plus",
      monthlyRemaining: 24,
      trialRemaining: 0,
      additional: [{ remaining: 10, expiresAt: "2027-10-02T10:00:00Z" }],
      renewalAt: "2026-11-02T10:00:00Z",
      deleteAfterSeconds: 3600,
      paymentsAvailable: true,
      restoreAvailable: true,
    }),
    quote: vi.fn(),
    submit: vi.fn(),
    status: vi.fn(),
    jobs: vi.fn(),
    lookup: vi.fn(),
    checkout: vi
      .fn()
      .mockResolvedValue({ url: "https://checkout.example/session" }),
    restore: vi.fn().mockResolvedValue({}),
  };
}
function show(client: HandwritingClient) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PlanUsage client={client} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}
describe("Plan and usage", () => {
  it("shows verified balances and opens checkout without granting benefits", async () => {
    const client = service();
    show(client);
    expect(await screen.findByText("24")).toBeInTheDocument();
    expect(screen.getByText(/10 pages · expires/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Buy pages" }));
    expect(
      await screen.findByRole("link", {
        name: "Continue in your purchase channel",
      }),
    ).toHaveAttribute("href", "https://checkout.example/session");
    expect(client.checkout).toHaveBeenCalledWith("pack");
    expect(screen.getByText("24")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore purchases" }));
    expect(client.restore).toHaveBeenCalledTimes(1);
    expect(client.usage).toHaveBeenCalledTimes(2);
  });
  it("opens the purchase channel in the browser from the app", async () => {
    tauri.isTauri.mockReturnValue(true);
    const client = service();
    show(client);
    await screen.findByText("24");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Change plan to Pro" }));
    expect(
      await screen.findByText(/purchase page opened in your browser/),
    ).toBeInTheDocument();
    expect(tauri.invoke).toHaveBeenCalledWith("open_handwriting_checkout", {
      url: "https://checkout.example/session",
    });
    expect(client.checkout).toHaveBeenCalledWith("pro");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    tauri.isTauri.mockReturnValue(false);
  });
  it("disables purchases and omits unverified balances without a service", () => {
    const client = service();
    client.available = false;
    show(client);
    expect(screen.getByRole("button", { name: "Buy pages" })).toBeDisabled();
    expect(screen.queryByText("24")).not.toBeInTheDocument();
    expect(client.usage).not.toHaveBeenCalled();
  });
});
