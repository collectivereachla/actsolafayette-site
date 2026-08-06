// ACT-SO Lafayette sign-up relay.
// Emails each submission to the program team and stores nothing anywhere —
// the email is the record, which keeps a minor's information out of
// third-party databases entirely.

const DESTINATION = 'josiah@creativereach.art';
// checkcalltime.art is the SendGrid-authenticated sending domain today.
// Swap once actsolafayette.org is authenticated in SendGrid.
const FROM = { email: 'calls@checkcalltime.art', name: 'ACT-SO Lafayette Sign-ups' };

const cap = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }

  const b = req.body || {};

  // Honeypot: real people never fill this in.
  if (b.website) {
    res.status(200).json({ ok: true });
    return;
  }

  let subject, lines, replyTo;

  if (b.form === 'student') {
    const student = cap(b.student_name, 120);
    const guardian = cap(b.guardian_name, 120);
    const email = cap(b.guardian_email, 200);
    if (!student || !guardian || !email) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }
    subject = `ACT-SO student sign-up — ${student}`;
    lines = [
      `Student: ${student}`,
      `Grade: ${cap(b.grade, 20)}`,
      `School: ${cap(b.school, 160) || '—'}`,
      `Categories: ${cap(Array.isArray(b.categories) ? b.categories.join(', ') : b.categories, 500) || '—'}`,
      ``,
      `Parent/guardian: ${guardian}`,
      `Email: ${email}`,
      `Phone: ${cap(b.guardian_phone, 40) || '—'}`,
    ];
    replyTo = email;
  } else if (b.form === 'volunteer') {
    const name = cap(b.name, 120);
    const email = cap(b.email, 200);
    if (!name || !email) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }
    subject = `ACT-SO volunteer — ${name} (${cap(b.role, 60) || 'unspecified'})`;
    lines = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${cap(b.phone, 40) || '—'}`,
      `Role: ${cap(b.role, 60) || '—'}`,
      `Field / category: ${cap(b.expertise, 300) || '—'}`,
      ``,
      cap(b.note, 2000) ? `Note:\n${cap(b.note, 2000)}` : '',
    ];
    replyTo = email;
  } else {
    res.status(400).json({ ok: false, error: 'Unknown form' });
    return;
  }

  const key = process.env.SENDGRID_API_KEY;
  if (!key) {
    // Never log the submission itself — see the note at the top of this file.
    // The form type is enough to know something was lost and what kind.
    console.error(`[signup] SENDGRID_API_KEY is not set — a ${b.form} submission was dropped`);
    res.status(500).json({ ok: false, error: 'Mailer not configured yet' });
    return;
  }

  const sg = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: DESTINATION }] }],
      from: FROM,
      reply_to: { email: replyTo },
      subject,
      content: [{ type: 'text/plain', value: lines.filter(Boolean).join('\n') }],
    }),
  });

  if (!sg.ok) {
    const detail = await sg.text().catch(() => '');
    console.error(`[signup] SendGrid refused a ${b.form} submission: ${sg.status} ${detail.slice(0, 300)}`);
    res.status(502).json({ ok: false, error: 'Mail send failed' });
    return;
  }

  // The email above is the record and has already succeeded. Calltime is an
  // ADDITION to it, never a replacement, so a Calltime outage must not turn a
  // good submission into an error for the person who filled in the form.
  // Volunteers only: students stay out of Calltime by design (see header).
  await relayToCalltime(b);

  res.status(200).json({ ok: true });
};

// The site's role labels are prose; the intake API wants stable keys.
const INTAKE_ROLES = {
  'Judge': 'judge',
  'Mentor / Coach': 'mentor',
  'Committee / day-of volunteer': 'committee',
  'Sponsor': 'sponsor',
};

async function relayToCalltime(b) {
  if (b.form !== 'volunteer') return;

  const url = process.env.CALLTIME_INTAKE_URL;
  const secret = process.env.CALLTIME_INTAKE_SECRET;
  if (!url || !secret) return; // not wired up yet — silently skip, email already sent

  const role = INTAKE_ROLES[cap(b.role, 60)];
  if (!role) {
    console.error(`[signup] no Calltime role mapping for "${cap(b.role, 60)}" — emailed only`);
    return;
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-intake-secret': secret },
      body: JSON.stringify({
        name: cap(b.name, 120),
        email: cap(b.email, 200),
        phone: cap(b.phone, 40),
        role,
        expertise: cap(b.expertise, 300),
        note: cap(b.note, 2000),
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error(`[signup] Calltime intake refused a ${role}: ${r.status} ${detail.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`[signup] Calltime intake unreachable for a ${role}: ${err.message}`);
  }
}
