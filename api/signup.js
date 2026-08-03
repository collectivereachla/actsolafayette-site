// ACT-SO Lafayette sign-up relay.
// Emails each submission to the program team and stores nothing anywhere —
// the email is the record, which keeps a minor's information out of
// third-party databases entirely.

const DESTINATION = 'josiah@actsolafayette.org';
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
    res.status(502).json({ ok: false, error: 'Mail send failed' });
    return;
  }

  res.status(200).json({ ok: true });
};
