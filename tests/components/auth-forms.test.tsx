import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { LoginForm } from "@/features/auth/components/login-form";
import { SignupForm } from "@/features/auth/components/signup-form";

const {
  assignMock,
  searchParamsMock,
  signInEmailMock,
  signInSocialMock,
  signUpEmailMock,
  requestPasswordResetMock,
  routerPushMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  assignMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
  signInEmailMock: vi.fn(),
  signInSocialMock: vi.fn(),
  signUpEmailMock: vi.fn(),
  requestPasswordResetMock: vi.fn(),
  routerPushMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock(),
  useRouter: () => ({
    push: routerPushMock,
  }),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    signIn: {
      email: signInEmailMock,
      social: signInSocialMock,
    },
    signUp: {
      email: signUpEmailMock,
    },
    requestPasswordReset: requestPasswordResetMock,
  },
}));

vi.mock("@/components/shared/notify", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

describe("auth forms", () => {
  const originalLocation = window.location;

  beforeAll(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        assign: assignMock,
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  beforeEach(() => {
    assignMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
    signInEmailMock.mockResolvedValue({ error: null });
    signInSocialMock.mockResolvedValue({ error: null });
    signUpEmailMock.mockResolvedValue({ error: null });
    requestPasswordResetMock.mockResolvedValue({ error: null });
    routerPushMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it("submits the login form with a safe callback and redirects after success", async () => {
    searchParamsMock.mockReturnValue(
      new URLSearchParams("next=/demo/home&verified=success"),
    );

    const user = userEvent.setup();
    render(<LoginForm />);

    expect(
      screen.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/signup?next=%2Fdemo%2Fhome");
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Your email is verified. Sign in to continue.",
        { description: "Email verified" },
      ),
    );

    await user.type(screen.getByLabelText("Email address"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "Password123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(signInEmailMock).toHaveBeenCalledWith({
        email: "owner@example.com",
        password: "Password123!",
        callbackURL: "/demo/home",
      }),
    );
    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith("/demo/home"),
    );
  });

  it("submits signup with the verification callback and shows the inbox state", async () => {
    searchParamsMock.mockReturnValue(
      new URLSearchParams("next=/demo/home"),
    );

    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText("First name"), "Alicia");
    await user.type(screen.getByLabelText("Last name"), "Cruz");
    await user.type(screen.getByLabelText("Email address"), "alicia@example.com");
    await user.type(screen.getByLabelText("Password"), "Password123!");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(signUpEmailMock).toHaveBeenCalledWith({
        name: "Alicia Cruz",
        email: "alicia@example.com",
        password: "Password123!",
        callbackURL: "/login?verified=success&next=%2Fdemo%2Fhome",
      }),
    );
    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith(
        "/check-email?email=alicia%40example.com",
      ),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText("First name")).toHaveValue(""),
    );
  });

  it("requests a password reset with the reset-password redirect", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email address"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() =>
      expect(requestPasswordResetMock).toHaveBeenCalledWith({
        email: "owner@example.com",
        redirectTo: "/reset-password",
      }),
    );
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "If that email exists, we sent a reset link.",
        { description: "Check your inbox" },
      ),
    );
  });
});
