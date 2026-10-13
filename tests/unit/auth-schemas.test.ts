import { describe, expect, it } from "vitest";

import {
  forgotPasswordSchema,
  loginSchema,
  magicLinkEmailSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/features/auth/schemas";

describe("features/auth/schemas", () => {
  it("accepts a valid login", () => {
    const result = loginSchema.safeParse({
      email: "owner@example.com",
      password: "Password123!",
    });
    expect(result.success).toBe(true);
  });

  it("trims the email before validating", () => {
    const result = loginSchema.safeParse({
      email: "  owner@example.com  ",
      password: "Password123!",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("owner@example.com");
    }
  });

  it("rejects an invalid login with per-field messages", () => {
    const result = loginSchema.safeParse({ email: "bad", password: "short" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fields = result.error.flatten().fieldErrors;
    expect(fields.email?.[0]).toBe("Enter a valid email address.");
    expect(fields.password?.[0]).toBe("Use at least 8 characters.");
  });

  it("validates email-only input for magic links", () => {
    expect(
      magicLinkEmailSchema.safeParse({ email: "owner@example.com" }).success,
    ).toBe(true);
    expect(magicLinkEmailSchema.safeParse({ email: "bad" }).success).toBe(
      false,
    );
  });

  it("requires names on signup", () => {
    const result = signupSchema.safeParse({
      firstName: "",
      lastName: "Cruz",
      email: "alicia@example.com",
      password: "Password123!",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.firstName?.[0]).toBe(
      "Enter your first name.",
    );
  });

  it("accepts a matching password reset", () => {
    const result = resetPasswordSchema.safeParse({
      token: "tok-123",
      password: "Password123!",
      confirmPassword: "Password123!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched reset passwords on confirmPassword", () => {
    const result = resetPasswordSchema.safeParse({
      token: "tok-123",
      password: "Password123!",
      confirmPassword: "Password456!",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.confirmPassword?.[0]).toBe(
      "Passwords must match.",
    );
  });

  it("rejects an empty reset token", () => {
    const result = resetPasswordSchema.safeParse({
      token: "",
      password: "Password123!",
      confirmPassword: "Password123!",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.token?.[0]).toBe(
      "Reset token is required.",
    );
  });

  it("validates forgot-password email input", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "owner@example.com" }).success,
    ).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });
});
