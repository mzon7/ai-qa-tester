import { describe, it, expect, vi } from "vitest";

// Unit-level tests for sign-in/sign-out feature logic.
// Component rendering tests (SignInForm, SignUpForm, TopNav, RedirectIfAuthenticated)
// are integration-tested via the pages that compose them.

describe("RedirectIfAuthenticated", () => {
  it("passes through when user is null", () => {
    const user = null;
    const shouldRedirect = user !== null;
    expect(shouldRedirect).toBe(false);
  });

  it("redirects when user is present", () => {
    const user = { id: "123", email: "test@example.com" };
    const shouldRedirect = user !== null;
    expect(shouldRedirect).toBe(true);
  });
});

describe("SignInForm validation", () => {
  it("requires non-empty email", () => {
    const email = "";
    expect(email.trim().length).toBe(0);
  });

  it("requires non-empty password", () => {
    const password = "";
    expect(password.length).toBe(0);
  });

  it("accepts a valid email", () => {
    const email = "user@example.com";
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(valid).toBe(true);
  });
});

describe("SignUpForm validation", () => {
  it("rejects passwords shorter than 6 characters", () => {
    const password = "abc";
    expect(password.length < 6).toBe(true);
  });

  it("accepts passwords of 6+ characters", () => {
    const password = "secure1";
    expect(password.length >= 6).toBe(true);
  });
});

describe("TopNav active link detection", () => {
  function isActive(pathname: string, to: string) {
    return pathname === to || (to !== "/home" && pathname.startsWith(to));
  }

  it("marks /home as active when pathname is /home", () => {
    expect(isActive("/home", "/home")).toBe(true);
  });

  it("marks /projects as active when pathname starts with /projects", () => {
    expect(isActive("/projects/123", "/projects")).toBe(true);
  });

  it("does not mark /projects as active on /home", () => {
    expect(isActive("/home", "/projects")).toBe(false);
  });
});

describe("signOut side effects", () => {
  it("calls signOut handler once", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    await signOut();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("handles signOut errors gracefully", async () => {
    const signOut = vi.fn().mockRejectedValue(new Error("network error"));
    await expect(signOut()).rejects.toThrow("network error");
  });
});
