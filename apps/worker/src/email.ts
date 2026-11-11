import nodemailer from 'nodemailer';

export interface SendResult {
  ok: boolean;
  detail: string;
}

/**
 * Send one email from the operator's own Gmail via SMTP. Uses a Google
 * **app password** (stored encrypted in the vault), which is Google's supported
 * programmatic-send method — far less likely to be blocked than automating the
 * Gmail web UI. The approval gate + rate limit upstream keep volume sane.
 */
export async function sendGmail(opts: {
  user: string;
  pass: string;
  to: string;
  subject: string;
  body: string;
}): Promise<SendResult> {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: opts.user, pass: opts.pass },
  });
  const info = await transporter.sendMail({
    from: opts.user,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
  });
  return { ok: true, detail: `sent (${info.messageId})` };
}
