import { beforeEach, describe, expect, it, vi } from "vitest";

const { listMock, createMock, warnMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock("../../repositories/auditLogRepository.js", () => ({
  auditLogRepository: {
    list: listMock,
    create: createMock,
  },
}));

vi.mock("../../utils/logger.js", () => ({
  default: {
    warn: warnMock,
  },
}));

import { auditLogService } from "../../services/auditLogService.js";

describe("auditLogService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([]);
    createMock.mockResolvedValue(undefined);
  });

  it("normalizes filters before listing audit logs", async () => {
    await auditLogService.listLogs({
      search: "  dashboard saved  ",
      entityType: "dashboard",
      limit: 25,
    });

    expect(listMock).toHaveBeenCalledWith({
      action: undefined,
      entityType: "dashboard",
      search: "dashboard saved",
      userId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      limit: 25,
    });
  });

  it("records audit events with actor context", async () => {
    await auditLogService.recordEvent(
      {
        action: "dashboard.saved",
        entityType: "dashboard",
        entityId: 42,
        entityName: "Overview",
        message: 'Saved dashboard "Overview"',
        metadata: { widgetCount: 3 },
      },
      {
        userId: 7,
        username: "alice",
        userRole: "admin",
        ipAddress: "127.0.0.1",
      },
    );

    expect(createMock).toHaveBeenCalledWith({
      action: "dashboard.saved",
      entityType: "dashboard",
      entityId: "42",
      entityName: "Overview",
      message: 'Saved dashboard "Overview"',
      metadata: { widgetCount: 3 },
      userId: 7,
      username: "alice",
      userRole: "admin",
      ipAddress: "127.0.0.1",
    });
  });

  it("does not throw if audit persistence fails", async () => {
    createMock.mockRejectedValueOnce(new Error("db unavailable"));

    await expect(
      auditLogService.recordEvent({
        action: "auth.login",
        entityType: "auth",
        message: "User logged in",
      }),
    ).resolves.toBeUndefined();

    expect(warnMock).toHaveBeenCalled();
  });
});
