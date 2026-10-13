/**
 * Better Auth instance (spec §2): email+password + organization + admin plugins.
 *
 * - Binds to our Neon/Drizzle Postgres via the drizzleAdapter.
 * - organization plugin = firms (members, invitations).
 * - admin plugin = platform admins (user.role = 'platform_admin').
 * - Email verification is OFF for now (Postmark sender not yet verified); the
 *   send function is wired and ready — flip requireEmailVerification to true
 *   once the Postmark signature is confirmed.
 * - twoFactor plugin is added in the next sub-step.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, admin as adminPlugin, twoFactor } from 'better-auth/plugins';
import { db, schema } from '@nsights/db';
import { sendEmail } from './email';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

export const auth = betterAuth({
  baseURL: APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Flip to true once Postmark sender signature is verified.
    requireEmailVerification: false,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: 'Reset your nSights password',
        text: `Reset your password: ${url}`,
      });
    },
  },
  emailVerification: {
    async sendVerificationEmail({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: 'Verify your nSights email',
        text: `Verify your email: ${url}`,
      });
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  rateLimit: { enabled: true, window: 60, max: 20 },
  plugins: [
    organization({
      // We allow up to 2 firm admins; enforced in firm routes (spec §1).
      async sendInvitationEmail({ email, invitation, organization: org }) {
        const url = `${APP_URL}/accept-invite/${invitation.id}`;
        await sendEmail({
          to: email,
          subject: `You've been invited to ${org.name} on nSights`,
          text: `Accept your invitation: ${url}`,
        });
      },
    }),
    adminPlugin(),
    twoFactor({
      issuer: 'nSights',
    }),
  ],
});

export type Auth = typeof auth;