import { describe, expect, it } from "vitest";
import { userErrorMessage } from "../src/userError";

describe("userErrorMessage", () => {
  it("never exposes an unknown technical error message", () => {
    expect(
      userErrorMessage(
        new Error("SQLITE_CONSTRAINT: FOREIGN KEY failed"),
        "We could not save the item.",
      ),
    ).toBe("We could not save the item.");
  });

  it("uses friendly messages for known operation errors", () => {
    const error = Object.assign(new Error("internal service details"), {
      code: "ONLINE_REQUIRED",
    });

    expect(userErrorMessage(error, "Fallback")).toBe(
      "Connect to the internet and try again.",
    );
  });

  it("supports context-specific authentication messages", () => {
    const error = Object.assign(new Error("AUTH_REQUIRED"), {
      code: "AUTH_REQUIRED",
    });

    expect(
      userErrorMessage(error, "Fallback", {
        AUTH_REQUIRED: "The employee ID or password is incorrect.",
      }),
    ).toBe("The employee ID or password is incorrect.");
  });
});
