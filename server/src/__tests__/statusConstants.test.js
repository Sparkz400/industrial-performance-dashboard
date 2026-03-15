import StatusConstants from "../utils/statusConstants.js";

describe("StatusConstants", () => {
  describe("status values", () => {
    it("should define all expected status constants", () => {
      expect(StatusConstants.CONNECTED).toBe("CONNECTED");
      expect(StatusConstants.CONNECTING).toBe("CONNECTING");
      expect(StatusConstants.DISCONNECTED).toBe("DISCONNECTED");
      expect(StatusConstants.ERROR).toBe("ERROR");
      expect(StatusConstants.WARNING).toBe("WARNING");
      expect(StatusConstants.UNKNOWN).toBe("UNKNOWN");
    });

    it("should define service name constants", () => {
      expect(StatusConstants.DATABASE).toBe("DATABASE");
      expect(StatusConstants.OPCUA).toBe("OPCUA");
    });
  });

  describe("getStatusLabel", () => {
    it.each([
      ["CONNECTED", "Connected"],
      ["CONNECTING", "Connecting..."],
      ["DISCONNECTED", "Disconnected"],
      ["ERROR", "Error"],
      ["WARNING", "Warning"],
      ["UNKNOWN", "Unknown"],
    ])('should return "%s" label as "%s"', (status, expectedLabel) => {
      expect(StatusConstants.getStatusLabel(status)).toBe(expectedLabel);
    });

    it('should return "Unknown" for unrecognized status', () => {
      expect(StatusConstants.getStatusLabel("NONEXISTENT")).toBe("Unknown");
      expect(StatusConstants.getStatusLabel(undefined)).toBe("Unknown");
      expect(StatusConstants.getStatusLabel(null)).toBe("Unknown");
    });
  });

  describe("getStatusColor", () => {
    it.each([
      ["CONNECTED", "success"],
      ["CONNECTING", "info"],
      ["WARNING", "warning"],
      ["ERROR", "error"],
      ["DISCONNECTED", "error"],
      ["UNKNOWN", "default"],
    ])('should return color "%s" as "%s"', (status, expectedColor) => {
      expect(StatusConstants.getStatusColor(status)).toBe(expectedColor);
    });

    it('should return "default" for unrecognized status', () => {
      expect(StatusConstants.getStatusColor("NONEXISTENT")).toBe("default");
      expect(StatusConstants.getStatusColor(undefined)).toBe("default");
    });
  });
});
