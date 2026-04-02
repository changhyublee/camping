import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { AppError } from "./app-error";

export type AnalysisEmailRecipient = {
  companionId: string;
  name: string;
  email: string;
};

export type SendAnalysisResultEmailInput = {
  tripTitle: string;
  outputPath: string;
  markdown: string;
  recipients: AnalysisEmailRecipient[];
};

export type SendAnalysisResultEmailResult = {
  sentAt: string;
  sentCount: number;
  recipients: AnalysisEmailRecipient[];
};

export interface AnalysisEmailClient {
  sendAnalysisResultEmail(
    input: SendAnalysisResultEmailInput,
  ): Promise<SendAnalysisResultEmailResult>;
}

export class SmtpAnalysisEmailClient implements AnalysisEmailClient {
  constructor(
    private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>,
    private readonly from: string,
  ) {}

  async sendAnalysisResultEmail(
    input: SendAnalysisResultEmailInput,
  ): Promise<SendAnalysisResultEmailResult> {
    const sentAt = new Date().toISOString();

    await this.transporter.sendMail({
      from: this.from,
      to: this.from,
      bcc: input.recipients.map((recipient) =>
        formatAddress(recipient.name, recipient.email),
      ),
      subject: `[캠핑 계획] ${input.tripTitle}`,
      text: input.markdown,
      headers: {
        "X-Camping-Output-Path": input.outputPath,
      },
    });

    return {
      sentAt,
      sentCount: input.recipients.length,
      recipients: input.recipients,
    };
  }
}

export class MissingAnalysisEmailClient implements AnalysisEmailClient {
  constructor(private readonly message: string) {}

  async sendAnalysisResultEmail(): Promise<SendAnalysisResultEmailResult> {
    throw new AppError("DEPENDENCY_MISSING", this.message, 503);
  }
}

export function createSmtpTransporter(input: {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}) {
  return nodemailer.createTransport({
    host: input.host,
    port: input.port,
    secure: input.secure,
    auth:
      input.user || input.pass
        ? {
            user: input.user,
            pass: input.pass,
          }
        : undefined,
  });
}

function formatAddress(name: string, email: string) {
  const normalizedName = name.replace(/"/g, '\\"').trim();
  return normalizedName ? `"${normalizedName}" <${email}>` : email;
}
