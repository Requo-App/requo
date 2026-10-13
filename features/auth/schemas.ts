import { z } from "zod";

const authEmailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(320, "Email address must be 320 characters or fewer.")
  .email("Enter a valid email address.");

const authPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Use 128 characters or fewer.");

export const loginSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema,
});

/** Email-only validation for requesting a Better Auth magic link. */
export const magicLinkEmailSchema = loginSchema.pick({ email: true });

const personFirstNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your first name.")
  .max(60, "Use 60 characters or fewer.");

const personLastNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your last name.")
  .max(60, "Use 60 characters or fewer.");

export const signupSchema = z.object({
  firstName: personFirstNameSchema,
  lastName: personLastNameSchema,
  email: authEmailSchema,
  password: authPasswordSchema,
});

export const forgotPasswordSchema = z.object({
  email: authEmailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required.").max(512, "Reset token is too long."),
  password: authPasswordSchema,
  confirmPassword: authPasswordSchema,
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords must match.",
  path: ["confirmPassword"],
});
