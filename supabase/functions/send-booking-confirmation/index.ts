const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function readDefaultKey(jsonValue: string | undefined) {
  if (!jsonValue) return null;
  try {
    const parsed = JSON.parse(jsonValue);
    return parsed?.default ?? Object.values(parsed ?? {})[0] ?? null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const dateFormatter = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const secretKey =
    readDefaultKey(Deno.env.get('SUPABASE_SECRET_KEYS')) ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');

  if (!supabaseUrl || !secretKey) {
    return json({ ok: false, message: 'Supabase server credentials are unavailable.' }, 500);
  }

  if (!resendApiKey || !fromEmail) {
    return json({ ok: false, message: 'Email service is not configured.' }, 503);
  }

  let body: { booking_id?: string; student_email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: 'Invalid request body.' }, 400);
  }

  const bookingId = String(body.booking_id ?? '').trim();
  const submittedEmail = String(body.student_email ?? '').trim().toLowerCase();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(bookingId) || !submittedEmail) {
    return json({ ok: false, message: 'Invalid booking request.' }, 400);
  }

  const dbHeaders = {
    apikey: secretKey,
    'Content-Type': 'application/json',
  };

  const bookingRes = await fetch(
    `${supabaseUrl}/rest/v1/presentation_bookings?id=eq.${encodeURIComponent(bookingId)}&select=id,slot_id,group_no,student_name,student_email,email_sent_at`,
    { headers: dbHeaders },
  );

  if (!bookingRes.ok) {
    return json({ ok: false, message: 'Could not read the booking.' }, 500);
  }

  const bookingRows = await bookingRes.json();
  const booking = bookingRows?.[0];

  if (!booking) {
    return json({ ok: false, message: 'Booking not found.' }, 404);
  }

  if (String(booking.student_email ?? '').toLowerCase() !== submittedEmail) {
    return json({ ok: false, message: 'Booking email does not match.' }, 403);
  }

  if (booking.email_sent_at) {
    return json({ ok: true, already_sent: true });
  }

  const slotRes = await fetch(
    `${supabaseUrl}/rest/v1/presentation_slots?id=eq.${encodeURIComponent(String(booking.slot_id))}&select=start_at,end_at`,
    { headers: dbHeaders },
  );

  if (!slotRes.ok) {
    return json({ ok: false, message: 'Could not read the presentation slot.' }, 500);
  }

  const slotRows = await slotRes.json();
  const slot = slotRows?.[0];

  if (!slot) {
    return json({ ok: false, message: 'Presentation slot not found.' }, 404);
  }

  const start = new Date(slot.start_at);
  const end = new Date(slot.end_at);
  const date = dateFormatter.format(start);
  const time = `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
  const safeName = escapeHtml(String(booking.student_name));
  const safeEmail = escapeHtml(String(booking.student_email));

  const subject = 'Presentation slot confirmed';
  const text = [
    `Hi ${booking.student_name},`,
    '',
    'Your presentation slot has been confirmed.',
    `Group: ${booking.group_no}`,
    `Date: ${date}`,
    `Time: ${time}`,
    '',
    'Please arrive a few minutes before your scheduled time.',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#172033;line-height:1.6">
      <h2 style="margin-bottom:8px">Presentation slot confirmed</h2>
      <p>Hi ${safeName},</p>
      <p>Your presentation slot has been successfully booked.</p>
      <div style="background:#f5f7fb;border-radius:12px;padding:18px 20px;margin:20px 0">
        <div><strong>Group:</strong> ${booking.group_no}</div>
        <div><strong>Date:</strong> ${escapeHtml(date)}</div>
        <div><strong>Time:</strong> ${escapeHtml(time)}</div>
      </div>
      <p>Please arrive a few minutes before your scheduled time.</p>
      <p style="font-size:13px;color:#6b7280">This confirmation was sent to ${safeEmail}.</p>
    </div>`;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [booking.student_email],
      subject,
      text,
      html,
    }),
  });

  const emailData = await emailRes.json().catch(() => ({}));

  if (!emailRes.ok) {
    console.error('Resend error', emailData);
    return json({ ok: false, message: 'Booking is confirmed, but the email could not be sent.' }, 502);
  }

  const updateRes = await fetch(
    `${supabaseUrl}/rest/v1/presentation_bookings?id=eq.${encodeURIComponent(bookingId)}`,
    {
      method: 'PATCH',
      headers: {
        ...dbHeaders,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        email_sent_at: new Date().toISOString(),
        email_message_id: emailData?.id ?? null,
      }),
    },
  );

  if (!updateRes.ok) {
    console.error('Email sent but booking email status could not be updated.');
  }

  return json({ ok: true, message_id: emailData?.id ?? null });
});
