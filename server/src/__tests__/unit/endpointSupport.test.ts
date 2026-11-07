import { describe, expect, it } from "vitest";
import {
  endpointSupport,
  validateProfile,
} from "../../services/productionProfile.js";

const build = {
  manufacturerName: "Owned simulator",
  productName: "Factory replay",
  softwareVersion: "1.2.3",
};
const profile = {
  version: 1,
  name: "Fixture",
  endpointModel: "Owned",
  signals: {},
  idealCycleMs: 1000,
  maxGapSeconds: 20,
  counterPolicy: "reject-decrease",
};

describe("endpoint build declarations", () => {
  it("matches only a fully reported, declared build", () => {
    expect(endpointSupport([build], { ...build })).toBe("matches-declaration");
    expect(
      endpointSupport([build], { ...build, softwareVersion: " 1.2.3 " }),
    ).toBe("matches-declaration");
    expect(
      endpointSupport([build], { ...build, softwareVersion: "1.2.4" }),
    ).toBe("mismatch");
  });

  it("keeps missing reports unknown and absent declarations undeclared", () => {
    expect(endpointSupport([build], null)).toBe("unknown");
    expect(endpointSupport([build], { ...build, productName: null })).toBe(
      "unknown",
    );
    expect(endpointSupport([build], { ...build, softwareVersion: " " })).toBe(
      "unknown",
    );
    expect(endpointSupport(undefined, build)).toBe("not-declared");
    expect(endpointSupport([], null)).toBe("not-declared");
  });

  it("validates declared builds in profiles", () => {
    expect(
      validateProfile({ ...profile, supportedEndpoints: [build] })
        .supportedEndpoints,
    ).toEqual([build]);
    expect(validateProfile(profile).supportedEndpoints).toBeUndefined();
    expect(() =>
      validateProfile({
        ...profile,
        supportedEndpoints: [{ ...build, softwareVersion: "" }],
      }),
    ).toThrow();
    expect(() =>
      validateProfile({
        ...profile,
        supportedEndpoints: Array(21).fill(build),
      }),
    ).toThrow();
  });
});
