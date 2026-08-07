// ACT-SO Lafayette sign-up relay.
// Emails each submission to the program team and stores nothing anywhere —
// the email is the record, which keeps a minor's information out of
// third-party databases entirely.

const DESTINATION = 'josiah@creativereach.art';
// checkcalltime.art is the SendGrid-authenticated sending domain today.
// Swap once actsolafayette.org is authenticated in SendGrid.
const FROM = { email: 'calls@checkcalltime.art', name: 'ACT-SO Lafayette Sign-ups' };

const cap = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

// ---------------------------------------------------------------- credentials
// ACT-SO seats three degreed or working professionals on every judging panel and
// pairs each student with a mentor who works in their field, so those two roles
// have to be checkable. A resume is the easy path; someone without one to hand
// can point us at their work instead. One or the other — never neither.
//
// The browser checks all of this too, for a decent error message. This is the
// check that counts: a form post is just an HTTP request, and anyone can send one.
const CREDS_ROLES = ['Judge', 'Mentor / Coach'];
const MIN_PROOF = 30;
const MAX_RESUME_BYTES = 3 * 1024 * 1024;   // ~4MB base64, under Vercel's 4.5MB body cap

// Extension -> the bytes a real file of that type starts with. Checked because
// the extension and the declared MIME type are both just strings the caller
// chose, and this attachment gets forwarded to a human who will open it.
const RESUME_KINDS = {
  pdf:  { mime: 'application/pdf', magic: [[0x25, 0x50, 0x44, 0x46]] },                       // %PDF
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          magic: [[0x50, 0x4b, 0x03, 0x04]] },                                               // PK.. (zip)
  doc:  { mime: 'application/msword', magic: [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]] }, // OLE2
};

// Never reuse the caller's filename as given: it lands in an email header and
// could be a path, a control character, or 300 characters of nonsense.
function safeFilename(raw, ext) {
  const base = String(raw || '')
    .replace(/[\\/]/g, ' ')             // no path separators
    .replace(/[\x00-\x1f\x7f]/g, '')     // no control characters
    .replace(/\.[^.]*$/, '')             // drop the extension; we re-add a known one
    .replace(/[^\w .'-]/g, ' ')
    .replace(/\.+/g, ' ')               // "../.." sanitizes safely but reads alarmingly
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return (base || 'resume') + '.' + ext;
}

/**
 * Validate the posted resume. Returns { file } to attach, { error } to refuse,
 * or {} when none was sent.
 */
function checkResume(r) {
  if (!r || typeof r !== 'object') return {};

  const ext = String(r.filename || '').split('.').pop().toLowerCase();
  const kind = RESUME_KINDS[ext];
  if (!kind) return { error: 'A resume must be a PDF or a Word document.' };

  const b64 = typeof r.content === 'string' ? r.content : '';
  if (!b64) return { error: 'That resume arrived empty.' };

  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return { error: 'That resume could not be read.' };
  }
  if (buf.length === 0) return { error: 'That resume arrived empty.' };
  if (buf.length > MAX_RESUME_BYTES) return { error: 'That resume is over the 3 MB limit.' };

  const matches = kind.magic.some((sig) => sig.every((byte, i) => buf[i] === byte));
  if (!matches) {
    // Renaming a .exe to .pdf is the oldest trick there is, and this file gets
    // forwarded to a person who will double-click it.
    return { error: 'That file does not look like a ' + ext.toUpperCase() + '. Try re-saving it, or send a link instead.' };
  }

  return {
    file: {
      content: buf.toString('base64'),
      filename: safeFilename(r.filename, ext),
      type: kind.mime,
      disposition: 'attachment',
    },
  };
}

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

  let subject, lines, replyTo, attachments;

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
    const role = cap(b.role, 60);
    const proofLink = cap(b.proof_link, 500);
    const proofNote = cap(b.proof_note, 2000);

    const resume = checkResume(b.resume);
    if (resume.error) {
      res.status(400).json({ ok: false, error: resume.error });
      return;
    }

    // Judges and mentors must be checkable. Re-checked here because the browser's
    // version of this is a courtesy, not a gate.
    if (CREDS_ROLES.includes(role)) {
      const hasProof = !!resume.file || !!proofLink || proofNote.length >= MIN_PROOF;
      if (!hasProof) {
        res.status(400).json({
          ok: false,
          error: 'Judges and mentors need to be checkable. Attach a resume, or give us a link to your work — or a few sentences about your background.',
        });
        return;
      }
    }

    subject = `ACT-SO volunteer — ${name} (${role || 'unspecified'})`;
    lines = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${cap(b.phone, 40) || '—'}`,
      `Role: ${role || '—'}`,
      `Field / category: ${cap(b.expertise, 300) || '—'}`,
      ``,
      // Spelled out so the credential is readable at a glance in the inbox,
      // rather than something to go hunting for.
      `Resume: ${resume.file ? `attached (${resume.file.filename})` : 'none sent'}`,
      `Work can be seen at: ${proofLink || '—'}`,
      proofNote ? `Background:\n${proofNote}` : `Background: —`,
      ``,
      cap(b.note, 2000) ? `Note:\n${cap(b.note, 2000)}` : '',
    ];
    replyTo = email;
    if (resume.file) attachments = [resume.file];
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
      ...(attachments ? { attachments } : {}),
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

// Hand Calltime the same bytes the email got. It re-validates them from scratch
// — extension, size, and the leading bytes — because a shared secret is not a
// reason to trust a payload, and it stores the result where only the show's
// leadership can read it.
function resumeForCalltime(b) {
  const r = b.resume;
  if (!r || typeof r !== 'object' || !r.content) return undefined;
  return { filename: cap(r.filename, 160) || 'resume.pdf', content: r.content };
}

// Fold the credential into the note Calltime stores, since intake has no field
// for it. Ordered so the reviewer reads the proof first and the applicant's own
// message second — the question in front of them is "is this person qualified".
function credsNote(b) {
  const parts = [];
  const link = cap(b.proof_link, 500);
  const proof = cap(b.proof_note, 2000);
  const hasResume = !!(b.resume && typeof b.resume === 'object' && b.resume.content);

  // Not "attached to the email" any more — Calltime stores it now and shows an
  // "open resume" link on the application, so saying otherwise sends the
  // reviewer to their inbox for a file that is already in front of them.
  if (hasResume) parts.push(`Resume attached (${cap(b.resume.filename, 120) || 'file'}) — open it from this application.`);
  if (link) parts.push(`Work: ${link}`);
  if (proof) parts.push(`Background: ${proof}`);
  const note = cap(b.note, 2000);
  if (note) parts.push(`Note: ${note}`);
  return parts.join('\n\n').slice(0, 2000);
}

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
        // Calltime's review room is where a judge is actually accepted, so the
        // credential travels with them: the link and the written background in
        // the note, and the file itself as an attachment Calltime stores in a
        // private bucket. A reviewer opening the application gets the proof
        // without going hunting through an inbox for it.
        note: credsNote(b),
        resume: resumeForCalltime(b),
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
