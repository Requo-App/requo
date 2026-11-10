import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { wrapEmailProviderError } from "@/lib/email/errors";
import type { EmailProvider } from "@/lib/email/types";
import { env, isSmtpConfigured } from "@/lib/env";

let transporter: Transporter | null = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (!env.SMTP_HOST || !env.SMTP_PORT) {
    throw new Error("SMTP_HOST and SMTP_PORT are required.");
  }

  const secure =
    env.SMTP_SECURE === "1" ||
    env.SMTP_SECURE === "true" ||
    env.SMTP_PORT === 465;
  const localRelay = ["localhost", "127.0.0.1", "::1"].includes(env.SMTP_HOST);
  const allowInsecureAuth =
    env.SMTP_ALLOW_INSECURE_AUTH === "1" ||
    env.SMTP_ALLOW_INSECURE_AUTH === "true";

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure,
    requireTLS: !secure && !(localRelay && allowInsecureAuth),
    ...(env.SMTP_USER && env.SMTP_PASSWORD
      ? {
          auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASSWORD,
          },
        }
      : {}),
  });

  return transporter;
}

export const smtpEmailProvider: EmailProvider = {
  name: "smtp",
  isConfigured: () => isSmtpConfigured,
  async send(input) {
    try {
      const info = await getTransporter().sendMail({
        from: input.from,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        replyTo: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: {
          "X-Requo-Idempotency-Key": input.idempotencyKey,
        },
      });

      const providerMessageId = info.messageId;

      if (!providerMessageId) {
        throw Object.assign(
          new Error("SMTP accepted the message without a message id."),
          { code: "missing_provider_message_id" },
        );
      }

      return {
        provider: "smtp",
        providerMessageId,
        status: "sent",
        raw: info,
      };
    } catch (error) {
      throw wrapEmailProviderError("smtp", error);
    }
  },
};
