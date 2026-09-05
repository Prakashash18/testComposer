# Presentation Slot Booking

Static GitHub Pages frontend backed by Supabase. Each group can reserve one 20-minute presentation slot. Booked slots disappear from the public page and a Supabase Edge Function sends the student a confirmation email.

## Current presentation schedule

- 7 September 2026: 1:00 PM onward
- 8 September 2026: 1:00 PM onward
- 11 total bookable slots
- 20 minutes per group

## 1. Initialise / upgrade the Supabase database

Open the **DJI** Supabase project (`qobfgevzgnluctagsybj`) and run the complete contents of:

`supabase_setup.sql`

in **Supabase → SQL Editor**.

The script is safe to run over the earlier version. It adds the email columns, keeps the 11 active slots, updates the booking RPC to accept email, and returns a booking UUID for the email function.

## 2. Configure Resend

The Edge Function uses Resend for transactional email.

1. Create/sign in to a Resend account.
2. Add and verify a domain you control. The default `resend.dev` sender can only send test messages to the email address attached to your own Resend account; a verified domain is required to email students.
3. Create a Resend API key with permission to send email.
4. Choose a sender on your verified domain, for example:

`Presentation Booking <bookings@yourdomain.com>`

## 3. Add Supabase Edge Function secrets

In **Supabase → Edge Functions → Secrets**, add:

- `RESEND_API_KEY` = your Resend API key
- `RESEND_FROM_EMAIL` = your sender, e.g. `Presentation Booking <bookings@yourdomain.com>`

Do **not** place the Resend API key in GitHub Pages or `app.js`.

Supabase provides the project URL and server-side project secret/service role to Edge Functions automatically.

## 4. Deploy the Edge Function

Function source:

`supabase/functions/send-booking-confirmation/index.ts`

The function must be deployed with JWT verification disabled because the public GitHub Pages app is not using Supabase Auth. The function protects the send by requiring a valid random booking UUID, matching the submitted email to the saved booking, and refusing to send again once `email_sent_at` is recorded.

CLI example:

```bash
supabase functions deploy send-booking-confirmation \
  --project-ref qobfgevzgnluctagsybj \
  --no-verify-jwt
```

The repo also includes:

`supabase/config.toml`

with `verify_jwt = false` for this function.

## 5. Test safely

Use your own email to make one temporary booking through the GitHub Pages page. Confirm:

1. the slot disappears,
2. the booking row contains name, email and group number,
3. the confirmation email arrives,
4. `email_sent_at` becomes populated.

After testing, delete the temporary booking row in Supabase so that the group and slot become available again.

## Architecture

```text
GitHub Pages
    |
    | booking RPC (publishable Supabase key)
    v
Supabase Postgres
    |
    | successful booking UUID
    v
Supabase Edge Function
    |
    | Resend API (secret stays server-side)
    v
Student confirmation email
```

The booking remains confirmed even if Resend is temporarily unavailable; email failure never rolls the booking back.
