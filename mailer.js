// Emails through Mailgun: a thank-you to the visitor, and an alert to the founder.
// The API key comes only from the MAILGUN_API_KEY variable (.env.local or Railway). Never from the code.
//
// Variables:
//   MAILGUN_API_KEY  secret key from Mailgun (required to send)
//   MAILGUN_DOMAIN   for example sandbox123.mailgun.org (required to send)
//   MAILGUN_REGION   "eu" or "us". If empty, US is tried first, then EU.
//   MAILGUN_FROM     optional sender, default "The Mexican Cola <postmaster@MAILGUN_DOMAIN>"
//   NOTIFY_EMAIL     who gets the new-enquiry alert, default ADMIN_EMAIL
//   REPLY_TO         where replies go, default hello.themexicancola@gmail.com

const BASES = { us: 'https://api.mailgun.net', eu: 'https://api.eu.mailgun.net' };
const TIMEOUT_MS = 10000;
const CONTACT_EMAIL = 'hello.themexicancola@gmail.com';
const CONTACT_PHONE = '+66 81 600 3343';

function isConfigured() {
  return Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
}

function bases() {
  if (process.env.MAILGUN_API_BASE) return [process.env.MAILGUN_API_BASE]; // for local tests only
  const region = String(process.env.MAILGUN_REGION || '').trim().toLowerCase();
  if (BASES[region]) return [BASES[region]];
  return [BASES.us, BASES.eu];
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Keeps names and other visitor text from breaking email headers.
function oneLine(value, max = 120) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function prettyDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(v || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}${m[4] ? ' ' + m[4] : ''}` : '';
}

// Sends one email. Returns { ok, status, error }. Never throws.
async function send({ to, subject, text, html, replyTo }) {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  const domain = process.env.MAILGUN_DOMAIN.trim();
  const from = process.env.MAILGUN_FROM || `The Mexican Cola <postmaster@${domain}>`;
  const body = new URLSearchParams({ from, to, subject, text, html });
  if (replyTo) body.set('h:Reply-To', replyTo);
  const auth = 'Basic ' + Buffer.from(`api:${process.env.MAILGUN_API_KEY.trim()}`).toString('base64');

  let last = { ok: false, error: 'no_attempt' };
  for (const base of bases()) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/v3/${encodeURIComponent(domain)}/messages`, {
        method: 'POST', headers: { Authorization: auth }, body, signal: ctrl.signal,
      });
      if (res.ok) return { ok: true, status: res.status };
      // Short error text, with any email address removed, so no personal data reaches the logs.
      const detail = (await res.text().catch(() => '')).replace(/[^\s@"'<>]+@[^\s@"'<>]+/g, '[email]').slice(0, 200).replace(/[\r\n]+/g, ' ');
      last = { ok: false, status: res.status, error: detail || `http_${res.status}` };
      // A wrong region answers 401 or 404: then try the other region. Anything else: stop.
      if (res.status !== 401 && res.status !== 404) return last;
    } catch (err) {
      last = { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
      return last;
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

// ---------- The thank-you email to the visitor ----------
function thankYou(e) {
  const th = e.language === 'th';
  const name = oneLine(e.name, 80);
  const when = prettyDate(e.preferred_date);
  if (th) {
    const subject = 'ขอบคุณที่จองชิมฟรี | The Mexican Cola';
    const steps = [
      `เราจะติดต่อกลับภายใน 1 วันทำการ เพื่อนัดวันและเวลา${when ? ` (คุณเลือกไว้ ${when})` : ''}`,
      `เรานำโคล่าไปที่${e.venue ? ` ${oneLine(e.venue, 80)}` : 'ร้านของคุณ'} ให้ทีมของคุณชิมแบบเพียวๆ และในบาตังกา เพื่อดูว่าเราเหมาะกันและสามารถร่วมงานกันได้หรือไม่`,
    ];
    const text = `สวัสดีคุณ${name}\n\nขอบคุณที่จองชิม The Mexican Cola ฟรี\n\nขั้นตอนต่อไป:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nมีคำถาม? ตอบกลับอีเมลนี้ หรือโทร ${CONTACT_PHONE}\n\nAnsh\nผู้ก่อตั้ง The Mexican Cola\nHappiness without Guilt`;
    return { subject, text, html: htmlEmail({ lang: 'th', hello: `สวัสดีคุณ${name}`, intro: 'ขอบคุณที่จองชิม The Mexican Cola ฟรี', nextTitle: 'ขั้นตอนต่อไป', steps, questions: `มีคำถาม? ตอบกลับอีเมลนี้ หรือโทร ${CONTACT_PHONE}`, sign: 'ผู้ก่อตั้ง The Mexican Cola' }) };
  }
  const subject = 'Thanks for booking a free tasting | The Mexican Cola';
  const steps = [
    `We contact you within 1 working day to set a day and time${when ? ` (you suggested ${when})` : ''}.`,
    `We bring the cola to ${e.venue ? oneLine(e.venue, 80) : 'your venue'}. Your team tastes it on its own and in a Batanga, to see if we are a good fit and can potentially work together.`,
  ];
  const text = `Hi ${name},\n\nThanks for booking a free tasting of The Mexican Cola.\n\nWhat happens next:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nQuestions? Reply to this email, or call ${CONTACT_PHONE}.\n\nAnsh\nFounder, The Mexican Cola\nHappiness without Guilt`;
  return { subject, text, html: htmlEmail({ lang: 'en', hello: `Hi ${name},`, intro: 'Thanks for booking a free tasting of The Mexican Cola.', nextTitle: 'What happens next', steps, questions: `Questions? Reply to this email, or call ${CONTACT_PHONE}.`, sign: 'Founder, The Mexican Cola' }) };
}

// Simple HTML in the brand colours. Plain tables, so every email app shows it the same.
function htmlEmail({ lang, hello, intro, nextTitle, steps, questions, sign }) {
  const font = lang === 'th' ? "'Anuphan','Leelawadee UI',Tahoma,sans-serif" : "'Work Sans',Arial,sans-serif";
  return `<!doctype html><html lang="${lang}"><body style="margin:0;padding:0;background:#FFF7EC">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7EC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #EADFD3;border-radius:16px">
<tr><td style="background:#1B1236;border-radius:16px 16px 0 0;padding:20px 28px;font:800 22px Arial,sans-serif;color:#FFF7EC">The Mexican Cola</td></tr>
<tr><td style="padding:28px;font:16px/1.6 ${font};color:#1B1236">
<p style="margin:0 0 12px">${esc(hello)}</p>
<p style="margin:0 0 20px">${esc(intro)}</p>
<p style="margin:0 0 8px;font-weight:700;color:#B0174F">${esc(nextTitle)}</p>
<ol style="margin:0 0 20px;padding-left:20px">${steps.map((s) => `<li style="margin:0 0 8px">${esc(s)}</li>`).join('')}</ol>
<p style="margin:0 0 20px">${esc(questions)}</p>
<p style="margin:0">Ansh<br><span style="color:#5E5873">${esc(sign)}</span></p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #EADFD3;font:13px Arial,sans-serif;color:#5E5873">Happiness without Guilt · ${CONTACT_EMAIL} · ${CONTACT_PHONE}</td></tr>
</table></td></tr></table></body></html>`;
}

// ---------- The alert to the founder ----------
function founderAlert(e, adminUrl) {
  const rows = [
    ['Name', e.name], ['Email', e.email], ['Phone or LINE', e.phone], ['Venue', e.venue], ['City', e.city],
    ['Current cola', e.current_cola], ['Preferred tasting', prettyDate(e.preferred_date)],
    ['Language', String(e.language || '').toUpperCase()], ['Source', e.source],
  ];
  const subject = `New tasting request: ${oneLine(e.name, 60)}${e.venue ? ` (${oneLine(e.venue, 60)})` : ''}`;
  const text = `Someone booked a free tasting. Reply within 1 working day.\n\n${rows.map(([k, v]) => `${k}: ${oneLine(v, 200) || '-'}`).join('\n')}\n\nOpen it: ${adminUrl}`;
  const html = `<!doctype html><html><body style="font:15px/1.5 Arial,sans-serif;color:#1B1236">
<p><b>Someone booked a free tasting.</b> Reply within 1 working day.</p>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#5E5873">${esc(k)}</td><td>${esc(v) || '-'}</td></tr>`).join('')}</table>
<p><a href="${esc(adminUrl)}" style="color:#B0174F;font-weight:700">Open the enquiry in the admin</a></p></body></html>`;
  return { subject, text, html };
}

// Sends both emails for a saved enquiry. Never throws. Returns a short result for the log and the database.
async function sendEnquiryEmails(e, { adminUrl }) {
  if (!isConfigured()) return { thankYou: 'off', alert: 'off' };
  const replyTo = process.env.REPLY_TO || CONTACT_EMAIL;
  const ty = thankYou(e);
  const thank = await send({ to: e.email, ...ty, replyTo });
  const notifyTo = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || CONTACT_EMAIL;
  const alert = await send({ to: notifyTo, ...founderAlert(e, adminUrl), replyTo: e.email });
  return {
    thankYou: thank.ok ? 'sent' : 'failed',
    thankYouError: thank.ok ? '' : `${thank.status || ''} ${thank.error || ''}`.trim(),
    alert: alert.ok ? 'sent' : 'failed',
    alertError: alert.ok ? '' : `${alert.status || ''} ${alert.error || ''}`.trim(),
  };
}

module.exports = { isConfigured, sendEnquiryEmails, thankYou, founderAlert };
