import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock("./repositories/settingsRepository", () => ({
  getSetting: settings.getSetting,
  setSetting: settings.setSetting,
}));

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("ensureDeviceId", () => {
  beforeEach(() => {
    vi.resetModules();
    settings.getSetting.mockReset();
    settings.setSetting.mockReset().mockResolvedValue(undefined);
  });

  it("generates and persists a device ID on first launch", async () => {
    settings.getSetting.mockResolvedValue(null);
    const { ensureDeviceId, DEVICE_ID_SETTING_KEY } = await import(
      "./deviceId"
    );

    const deviceId = await ensureDeviceId();

    expect(deviceId).toMatch(UUID_V7);
    expect(settings.setSetting).toHaveBeenCalledOnce();
    expect(settings.setSetting).toHaveBeenCalledWith(
      DEVICE_ID_SETTING_KEY,
      deviceId,
    );
  });

  it("reuses the stored device ID on later launches", async () => {
    settings.getSetting.mockResolvedValue("stored-device-id");
    const { ensureDeviceId } = await import("./deviceId");

    await expect(ensureDeviceId()).resolves.toBe("stored-device-id");
    expect(settings.setSetting).not.toHaveBeenCalled();
  });

  it("resolves the identity only once per session", async () => {
    settings.getSetting.mockResolvedValue(null);
    const { ensureDeviceId } = await import("./deviceId");

    const [first, second] = await Promise.all([
      ensureDeviceId(),
      ensureDeviceId(),
    ]);

    expect(first).toBe(second);
    expect(settings.getSetting).toHaveBeenCalledOnce();
  });

  it("allows a retry after a failure", async () => {
    settings.getSetting
      .mockRejectedValueOnce(new Error("database offline"))
      .mockResolvedValueOnce("recovered-device-id");
    const { ensureDeviceId } = await import("./deviceId");
    const { DatabaseError } = await import("../lib/errors/DatabaseError");

    await expect(ensureDeviceId()).rejects.toBeInstanceOf(DatabaseError);
    await expect(ensureDeviceId()).resolves.toBe("recovered-device-id");
    expect(settings.getSetting).toHaveBeenCalledTimes(2);
  });
});
