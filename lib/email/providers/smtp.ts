import "server-only";

import net from "node:net";

import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

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

  const cleartextRelay = !secure && localRelay && allowInsecureAuth;
  // Hand Nodemailer the same socket only after verifying its actual peer.
  const getSocket: SMTPTransport.Options["getSocket"] = (_options, callback) => {
    const socket = net.connect({ host: env.SMTP_HOST!, port: env.SMTP_PORT! });
    const onError = (error: Error) => callback(error, {});
    socket.once("error", onError);
    socket.setTimeout(30_000, () => {
      socket.destroy(new Error("SMTP relay connection timed out."));
    });
    socket.once("connect", () => {
      socket.setTimeout(0);
      const loopback = new net.BlockList();
      loopback.addSubnet("127.0.0.0", 8, "ipv4");
      loopback.addAddress("::1", "ipv6");
      const address = socket.remoteAddress;
      if (
        !address ||
        !net.isIP(address) ||
        !loopback.check(address, net.isIP(address) === 6 ? "ipv6" : "ipv4")
      ) {
        socket.destroy(new Error("Cleartext SMTP requires a loopback peer."));
        return;
      }
      socket.removeListener("error", onError);
      callback(null, { connection: socket });
    });
  };

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure,
    requireTLS: !secure && !cleartextRelay,
    ...(cleartextRelay ? { getSocket } : {}),
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
