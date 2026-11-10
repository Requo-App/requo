import "server-only";

import type { EmailProvider } from "@/lib/email/types";
import { env } from "@/lib/env";
import { brevoEmailProvider } from "./brevo";
import { mailtrapEmailProvider } from "./mailtrap";
import { resendEmailProvider } from "./resend";
import { smtpEmailProvider } from "./smtp";

const allProviders: EmailProvider[] = [
  resendEmailProvider,
  mailtrapEmailProvider,
  brevoEmailProvider,
  smtpEmailProvider,
];

const providersByName = {
  resend: resendEmailProvider,
  mailtrap: mailtrapEmailProvider,
  brevo: brevoEmailProvider,
  smtp: smtpEmailProvider,
} as const;

const requestedDriver = env.REQUO_EMAIL_DRIVER;

/**
 * Auto keeps the historical fallback chain and adds SMTP last. A named driver
 * is tried first, then the remaining configured providers stay as a fallback.
 */
export const emailProviders: EmailProvider[] =
  requestedDriver && requestedDriver !== "auto"
    ? [
        providersByName[requestedDriver],
        ...allProviders.filter(
          (provider) => provider.name !== requestedDriver,
        ),
      ]
    : allProviders;
