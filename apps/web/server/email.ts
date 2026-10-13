/**
 * Transactional email via Postmark (spec §2). Until the Postmark sender
 * signature is verified, this logs the email to the console instead of sending,
 * so auth flows work in dev without a configured Postmark server.
 *
 * Set EMAIL_ENABLED=true in .env once your Postmark sender signature + token
 * are confirmed to switch on real sending.
 */
interface SendEmailArgs {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }
  
  const ENABLED = process.env.EMAIL_ENABLED === 'true';
  const TOKEN = process.env.POSTMARK_TOKEN;
  const FROM = process.env.EMAIL_FROM ?? 'noreply@example.com';
  
  export async function sendEmail(args: SendEmailArgs): Promise<void> {
    if (!ENABLED || !TOKEN) {
      console.log(
        `[email:dev] (not sent — EMAIL_ENABLED!=true)\n  to: ${args.to}\n  subj: ${args.subject}\n  ${args.text}`,
      );
      return;
    }
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': TOKEN,
      },
      body: JSON.stringify({
        From: FROM,
        To: args.to,
        Subject: args.subject,
        TextBody: args.text,
        HtmlBody: args.html,
        MessageStream: 'outbound',
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Postmark send failed (${res.status}): ${body}`);
    }
  }