// ─────────────────────────────────────────────────────────────────────────────
// services/followup.js — Automatic Email Follow-Up Drip Sequence
// ─────────────────────────────────────────────────────────────────────────────
// Day 0 (instant)      → Welcome email with full property list
// Day 1 (24h)         → "Did you get a chance to look?"
// Day 2 (48h)         → Social proof + urgency
// Day 3 (72h)         → Final push + direct booking link
//
// Stops automatically when lead books a visit.
// All emails sent via Resend (services/email.js).
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { sendEmail } = require('./email');

const AGENT_NAME   = process.env.AGENT_NAME   || 'Sarah Al-Rashid';
const AGENT_EMAIL  = process.env.AGENT_EMAIL  || 'saishivaraju.m2002@gmail.com';
const AGENT_PHONE  = process.env.AGENT_PHONE  || '+971 50 123 4567';
const COMPANY_NAME = process.env.COMPANY_NAME || 'Zorvo Realty';
const BASE_URL     = process.env.BASE_URL     || 'https://anizorvo.vercel.app';

// ── MongoDB Schema Definition ─────────────────────────────────────────────────
const FollowUpSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  property_interest: { type: String, default: '' },
  budget: { type: String, default: '' },
  scheduled_at: { type: Date, default: Date.now },
  status: { type: String, default: 'active' }, // active | completed | cancelled
  last_sent_day: { type: Number, default: 0 },  // 0 = Day 0 sent, 1 = Day 1, etc.
  agent_name: { type: String, default: AGENT_NAME },
  agent_email: { type: String, default: AGENT_EMAIL },
  agent_phone: { type: String, default: AGENT_PHONE }
}, { timestamps: true });

const FollowUp = mongoose.models.FollowUp || mongoose.model('FollowUp', FollowUpSchema);

// ── Shared HTML wrapper ───────────────────────────────────────────────────────
function wrapEmail(headerTitle, headerSub, bodyHtml, agentName = AGENT_NAME, agentPhone = AGENT_PHONE, agentEmail = AGENT_EMAIL) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${headerTitle} — ${COMPANY_NAME}</title></head>
<body style="margin:0;padding:0;background:#0a0e14;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e14;padding:24px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#111520;border-radius:16px;overflow:hidden;border:1px solid rgba(197,160,89,0.25)">
      <!-- HEADER -->
      <tr><td style="background:linear-gradient(135deg,#1a1a18,#0f2044);padding:32px 40px 24px;border-bottom:2px solid #c5a059;text-align:center">
        <p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:3px;text-transform:uppercase">${COMPANY_NAME}</p>
        <h1 style="margin:8px 0 0;color:#c5a059;font-size:24px;font-weight:300;letter-spacing:1px">${headerTitle}</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.45);font-size:13px">${headerSub}</p>
      </td></tr>
      <!-- BODY -->
      <tr><td style="padding:32px 40px">${bodyHtml}</td></tr>
      <!-- AGENT FOOTER -->
      <tr><td style="padding:0 40px 28px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(197,160,89,0.15);padding-top:20px">
          <tr><td>
            <p style="margin:0 0 3px;font-size:10px;color:rgba(255,255,255,0.28);letter-spacing:2px;text-transform:uppercase">Your Personal Agent</p>
            <p style="margin:0 0 3px;font-size:16px;font-weight:700;color:#faf8f4">👤 ${agentName}</p>
            <p style="margin:0 0 3px;font-size:13px;color:rgba(255,255,255,0.45)">📞 <a href="tel:${agentPhone}" style="color:#c5a059;text-decoration:none">${agentPhone}</a></p>
            <p style="margin:0 0 3px;font-size:13px;color:rgba(255,255,255,0.45)">📧 <a href="mailto:${agentEmail}" style="color:#c5a059;text-decoration:none">${agentEmail}</a></p>
            <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.45)">🏢 ${COMPANY_NAME}</p>
            <p style="margin:12px 0 0">
              <a href="${BASE_URL}" style="font-size:12px;color:#c5a059;text-decoration:underline;margin-right:16px">🌐 Website</a>
              <a href="mailto:${agentEmail}" style="font-size:12px;color:#c5a059;text-decoration:underline">✉️ Email Us</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
      <!-- BOTTOM BAR -->
      <tr><td style="background:rgba(0,0,0,0.35);padding:14px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.05)">
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.18)">© ${new Date().getFullYear()} ${COMPANY_NAME} · <a href="${BASE_URL}" style="color:rgba(255,255,255,0.28);text-decoration:none">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Build property cards HTML ─────────────────────────────────────────────────
function buildPropertyCards(properties = []) {
  const available = properties.filter(p =>
    ['available', 'Available', 'active', 'Active'].includes(p.status) || !p.status
  ).slice(0, 8); // cap at 8 in emails

  if (!available.length) {
    return `<p style="color:rgba(255,255,255,0.4);font-size:14px;margin:0">
      We have a curated selection of premium properties. <a href="${BASE_URL}" style="color:#c5a059">Browse all listings →</a>
    </p>`;
  }

  return available.map((p, i) => {
    const name     = p.name || p.title || `Property ${i + 1}`;
    const type     = p.property_type || p.type || 'Property';
    const location = p.location || 'Prime Location';
    const price    = p.price_label || p.price || 'Contact for Price';
    const bhk      = p.bhk || p.bedrooms ? `${p.bhk || p.bedrooms} BHK · ` : '';
    const features = Array.isArray(p.features)
      ? p.features.slice(0, 3).join(' · ')
      : (typeof p.features === 'string' ? p.features.split(',').slice(0, 3).join(' · ') : '');
    const propId   = p.id || (i + 1);
    const viewLink = `${BASE_URL}/index.html#property-${propId}`;
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + location)}`;

    return `<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid rgba(197,160,89,0.12);padding:14px 0;margin-bottom:4px">
      <tr><td>
        <p style="margin:0 0 3px;font-size:15px;font-weight:700;color:#faf8f4">${name}</p>
        <p style="margin:0 0 5px;font-size:12px;color:rgba(255,255,255,0.45)">${bhk}${type} · 📍 ${location}</p>
        ${features ? `<p style="margin:0 0 7px;font-size:11px;color:rgba(255,255,255,0.32)">${features}</p>` : ''}
        <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#c5a059">${price}</p>
        <a href="${viewLink}" style="display:inline-block;background:#c5a059;color:#0a0e14;padding:6px 16px;border-radius:5px;text-decoration:none;font-size:12px;font-weight:700;margin-right:8px">View Property →</a>
        <a href="${mapsLink}" style="display:inline-block;border:1px solid rgba(197,160,89,0.4);color:#c5a059;padding:6px 14px;border-radius:5px;text-decoration:none;font-size:12px">📍 Map</a>
      </td></tr>
    </table>`;
  }).join('');
}

// ── CTA Button ────────────────────────────────────────────────────────────────
function ctaButton(text = 'Browse All Properties →') {
  return `<div style="text-align:center;margin:24px 0">
    <a href="${BASE_URL}" style="display:inline-block;background:linear-gradient(135deg,#c5a059,#b8965a);color:#0a0e14;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:1px">${text}</a>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// Day 0 — Instant welcome + full property list
function buildDay0Email(lead, properties, agentName = AGENT_NAME, agentPhone = AGENT_PHONE, agentEmail = AGENT_EMAIL) {
  const interestLine = lead.property_interest
    ? `matching your interest in <strong style="color:#c5a059">${lead.property_interest}</strong>`
    : 'that we think you\'ll love';
  const budgetLine = lead.budget
    ? ` within your budget of <strong style="color:#c5a059">${lead.budget}</strong>` : '';

  const body = `
    <div style="background:rgba(197,160,89,0.07);border:1px solid rgba(197,160,89,0.2);border-radius:10px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#faf8f4">Hi ${lead.name || 'there'}! 👋</p>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.8">
        Thank you for your interest in ${COMPANY_NAME}! I'm <strong style="color:#faf8f4">${agentName}</strong>, your personal property consultant.<br><br>
        I've handpicked our best listings ${interestLine}${budgetLine}. Take a look below — I'd love to hear which one catches your eye! 🏡
      </p>
    </div>
    <p style="margin:0 0 16px;font-size:10px;color:rgba(255,255,255,0.28);letter-spacing:2px;text-transform:uppercase">✨ Handpicked For You</p>
    ${buildPropertyCards(properties)}
    ${ctaButton('Browse All Properties →')}
    <div style="background:rgba(46,204,138,0.06);border:1px solid rgba(46,204,138,0.2);border-radius:8px;padding:16px;margin-top:8px">
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.55);line-height:1.7">
        💬 Simply reply to this email to ask any questions, or click <strong style="color:#2ecc8a">Book a Free Visit</strong> on our website — zero pressure, zero obligation.
      </p>
    </div>`;

  return {
    subject: `🏡 Welcome, ${lead.name || 'there'}! Here are your handpicked properties — ${COMPANY_NAME}`,
    html: wrapEmail('🏡 Welcome to ' + COMPANY_NAME, 'Your handpicked property selection is ready', body, agentName, agentPhone, agentEmail),
    plain: `Hi ${lead.name || 'there'},\n\nThank you for your interest! I'm ${agentName} from ${COMPANY_NAME}.\n\nI've selected properties ${interestLine}${budgetLine}.\n\nBrowse listings: ${BASE_URL}\n\nReply to this email with any questions!\n\n${agentName}\n${agentPhone}\n${agentEmail}`
  };
}

// Day 1 — 24h follow-up
function buildDay1Email(lead, properties, agentName = AGENT_NAME, agentPhone = AGENT_PHONE, agentEmail = AGENT_EMAIL) {
  const body = `
    <p style="margin:0 0 18px;font-size:15px;color:#faf8f4;line-height:1.8">
      Hi ${lead.name || 'there'}, just checking in! 🙂<br><br>
      I shared some property details yesterday — did you get a chance to take a look?
    </p>
    <div style="background:rgba(197,160,89,0.07);border:1px solid rgba(197,160,89,0.2);border-radius:10px;padding:18px;margin-bottom:24px">
      <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#faf8f4">What makes our listings special:</p>
      <p style="margin:4px 0;font-size:13px;color:rgba(255,255,255,0.6)">✅ Prime, verified locations</p>
      <p style="margin:4px 0;font-size:13px;color:rgba(255,255,255,0.6)">✅ Ready to move in</p>
      <p style="margin:4px 0;font-size:13px;color:rgba(255,255,255,0.6)">✅ Flexible payment options</p>
      <p style="margin:4px 0;font-size:13px;color:rgba(255,255,255,0.6)">✅ Trusted developers</p>
      ${lead.budget ? `<p style="margin:8px 0 0;font-size:13px;color:#c5a059">💰 Options available within your <strong>${lead.budget}</strong> budget</p>` : ''}
    </div>
    <p style="margin:0 0 16px;font-size:10px;color:rgba(255,255,255,0.28);letter-spacing:2px;text-transform:uppercase">🏠 Available Properties</p>
    ${buildPropertyCards(properties)}
    ${ctaButton('Book a Free Visit →')}
    <p style="margin:16px 0 0;font-size:13px;color:rgba(255,255,255,0.4);text-align:center">
      A quick 20-minute visit is all it takes. No pressure at all!
    </p>`;

  return {
    subject: `👋 ${lead.name ? lead.name + ', did' : 'Did'} you see our property listings? — ${COMPANY_NAME}`,
    html: wrapEmail('Still Interested?', 'Our properties are waiting for you', body, agentName, agentPhone, agentEmail),
    plain: `Hi ${lead.name || 'there'},\n\nJust checking in! Did you get a chance to look at the properties I sent yesterday?\n\nWe have great options${lead.budget ? ` within your ${lead.budget} budget` : ''}.\n\nBook a free visit: ${BASE_URL}\n\n${agentName}\n${agentPhone}\n${agentEmail}`
  };
}

// Day 2 — 48h follow-up with social proof + urgency
function buildDay2Email(lead, properties, agentName = AGENT_NAME, agentPhone = AGENT_PHONE, agentEmail = AGENT_EMAIL) {
  const interest = lead.property_interest || 'properties';
  const body = `
    <p style="margin:0 0 18px;font-size:15px;color:#faf8f4;line-height:1.8">Hi ${lead.name || 'there'}! 🎉</p>
    <div style="background:rgba(197,160,89,0.07);border:1px solid rgba(197,160,89,0.2);border-radius:10px;padding:18px;margin-bottom:24px">
      <p style="margin:0 0 10px;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.8">
        I wanted to share something exciting — one of our clients who had <em>very similar requirements to yours</em> visited last week and 
        <strong style="color:#faf8f4">fell in love with a property they almost didn't go see</strong>. They signed within 2 days! 🏡
      </p>
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.5);line-height:1.7">
        Our <strong style="color:#c5a059">${interest}</strong> listings are getting a lot of interest this week. I'd hate for you to miss the best ones before they're gone.
      </p>
    </div>
    <p style="margin:0 0 16px;font-size:10px;color:rgba(255,255,255,0.28);letter-spacing:2px;text-transform:uppercase">🔥 High-Demand Listings</p>
    ${buildPropertyCards(properties)}
    ${ctaButton('Claim Your Free Visit →')}
    <p style="margin:16px 0 0;font-size:13px;color:rgba(255,255,255,0.4);text-align:center">
      Completely free · No obligation · Just reply to this email to confirm a time
    </p>`;

  return {
    subject: `🔥 These properties are moving fast, ${lead.name || 'there'} — don't miss out`,
    html: wrapEmail('Properties Moving Fast!', 'High demand this week — secure your visit now', body, agentName, agentPhone, agentEmail),
    plain: `Hi ${lead.name || 'there'},\n\nOur ${interest} listings are getting a lot of interest this week. Don't miss out!\n\nBook your free visit now: ${BASE_URL}\n\n${agentName}\n${agentPhone}\n${agentEmail}`
  };
}

// Day 3 — 72h final follow-up
function buildDay3Email(lead, properties, agentName = AGENT_NAME, agentPhone = AGENT_PHONE, agentEmail = AGENT_EMAIL) {
  const interest = lead.property_interest || 'properties';
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#faf8f4;line-height:1.8">Hi ${lead.name || 'there'},</p>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.8">
      This is my last follow-up — I promise I won't keep emailing after this! 😊<br><br>
      I genuinely believe we have something <strong style="color:#faf8f4">perfect for you</strong>, and I don't want you to miss it.
      ${lead.property_interest ? `Our <strong style="color:#c5a059">${interest}</strong> listings are moving fast this month.` : ''}
      ${lead.budget ? `And within <strong style="color:#c5a059">${lead.budget}</strong>, the options are really strong right now.` : ''}
    </p>
    <p style="margin:0 0 16px;font-size:10px;color:rgba(255,255,255,0.28);letter-spacing:2px;text-transform:uppercase">📋 Final Property Selection</p>
    ${buildPropertyCards(properties)}
    <div style="background:rgba(197,160,89,0.06);border:1px solid rgba(197,160,89,0.2);border-radius:10px;padding:20px;text-align:center;margin-top:8px">
      <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#faf8f4">📅 Book a Free Property Visit</p>
      <p style="margin:0 0 16px;font-size:13px;color:rgba(255,255,255,0.45)">Choose any date & time that works for you — completely free, no obligation</p>
      ${ctaButton('Book My Free Visit Now →')}
      <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.3)">Or simply reply to this email and I'll arrange everything for you.</p>
    </div>
    <p style="margin:20px 0 0;font-size:13px;color:rgba(255,255,255,0.4);text-align:center">
      Thank you for your time, ${lead.name || 'there'}. I hope to help you find your dream home soon! 🏡
    </p>`;

  return {
    subject: `🏡 Last one from me, ${lead.name || 'there'} — your dream property is waiting`,
    html: wrapEmail('Final Note from ' + agentName, 'Your perfect property is still available', body, agentName, agentPhone, agentEmail),
    plain: `Hi ${lead.name || 'there'},\n\nThis is my last follow-up. I genuinely think we have something perfect for you.\n\nBook a free property visit: ${BASE_URL}\n\nOr just reply to this email and I'll set everything up.\n\nThank you for your time!\n${agentName}\n${agentPhone}\n${agentEmail}`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE EMAIL FOLLOW-UPS FOR A NEW LEAD
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} lead       - Lead object { name, email, phone, property_interest, budget }
 * @param {Array}  properties - Array of property objects from the agent's snapshot
 */
async function scheduleFollowUps(lead, properties = []) {
  const phone = lead.phone;
  if (!phone) return;

  // Need email to send follow-ups
  if (!lead.email) {
    console.log(`⚠️  No email for lead ${lead.name} (${phone}) — follow-up emails skipped`);
    return;
  }

  // Fetch listing agent details from lead payload
  const agentEmail = lead.agent_email || AGENT_EMAIL;
  const agentName = lead.agent_name || AGENT_NAME;
  const agentPhone = lead.agent_phone || AGENT_PHONE;

  // 1. Cancel any existing follow-ups for this number
  await cancelFollowUps(phone);

  // 2. Day 0 Welcome Email: Send INSTANTLY inside the active request context
  console.log(`📧 Dispatching Drip Day 0 (Welcome) instantly to ${lead.name} <${lead.email}> from ${agentName}...`);
  try {
    const { subject, html, plain } = buildDay0Email(lead, properties, agentName, agentPhone, agentEmail);
    const result = await sendEmail({ to: lead.email, subject, html, message: plain });
    if (result.success) {
      console.log(`✅ Day 0 Welcome email successfully delivered.`);
    } else {
      console.error(`❌ Day 0 Welcome email delivery failed:`, result.error);
    }
  } catch (e) {
    console.error('Day 0 welcome email exception:', e.message);
  }

  // 3. Register lead in MongoDB database
  try {
    await FollowUp.findOneAndUpdate(
      { phone },
      {
        name: lead.name || 'Client',
        email: lead.email,
        property_interest: lead.property_interest || '',
        budget: lead.budget || '',
        scheduled_at: new Date(),
        status: 'active',
        last_sent_day: 0,
        agent_name: agentName,
        agent_email: agentEmail,
        agent_phone: agentPhone
      },
      { upsert: true, new: true }
    );
    console.log(`📅 Database-backed email follow-ups registered for ${lead.name} <${lead.email}> under agent ${agentName}`);
  } catch (err) {
    console.error('Failed to save follow-up to MongoDB:', err.message);
  }
}

// ── CANCEL follow-ups (when lead books a visit) ───────────────────────────────
async function cancelFollowUps(phone) {
  try {
    await FollowUp.updateMany({ phone, status: 'active' }, { status: 'cancelled' });
    console.log(`✅ Email follow-ups cancelled for ${phone} in database`);
    return { success: true };
  } catch (e) {
    console.error(`Failed to cancel follow-ups for ${phone}:`, e.message);
    return { success: false, error: e.message };
  }
}

// ── GET status ────────────────────────────────────────────────────────────────
async function getFollowUpStatus(phone) {
  try {
    const entry = await FollowUp.findOne({ phone, status: 'active' });
    return {
      scheduled: !!entry,
      lead:      entry?.name || null,
      email:     entry?.email || null,
    };
  } catch (e) {
    return { scheduled: false, lead: null, email: null };
  }
}

// ── GET all active scheduled ──────────────────────────────────────────────────
async function getAllScheduled() {
  try {
    const list = await FollowUp.find({ status: 'active' });
    return list.map(entry => ({
      phone: entry.phone,
      name:     entry.name,
      email:    entry.email,
      interest: entry.property_interest,
    }));
  } catch (e) {
    console.error('Error in getAllScheduled:', e.message);
    return [];
  }
}

// ── AUTOMATED DRIP ENGINE (stateless & vercel-friendly) ──────────────────────
async function processFollowUpDrip(properties = []) {
  try {
    const actives = await FollowUp.find({ status: 'active' });
    if (actives.length === 0) return;

    // Load properties from MongoDB DataSnapshot if empty
    if (!properties || properties.length === 0) {
      try {
        const DataSnapshot = mongoose.models.DataSnapshot || mongoose.model('DataSnapshot');
        const snap = await DataSnapshot.findOne({ email: AGENT_EMAIL });
        if (snap?.data?.pe_properties) {
          properties = typeof snap.data.pe_properties === 'string'
            ? JSON.parse(snap.data.pe_properties)
            : snap.data.pe_properties;
        }
      } catch (peErr) {
        console.error('Drip Engine properties fetch error:', peErr.message);
      }
    }

    const now = new Date();
    console.log(`⏰ [Drip Engine] Processing ${actives.length} active follow-ups at ${now.toISOString()}...`);

    for (const f of actives) {
      const elapsedHours = (now - new Date(f.scheduled_at)) / (1000 * 60 * 60);
      const lead = {
        phone: f.phone,
        name: f.name,
        email: f.email,
        property_interest: f.property_interest,
        budget: f.budget
      };

      const agentName = f.agent_name || AGENT_NAME;
      const agentEmail = f.agent_email || AGENT_EMAIL;
      const agentPhone = f.agent_phone || AGENT_PHONE;

      console.log(`- Lead ${f.name} (${f.phone}) | Hours elapsed: ${elapsedHours.toFixed(2)} | Agent: ${agentName} | Last sent day: ${f.last_sent_day}`);

      // Day 1 (after 24 hours)
      if (elapsedHours >= 24 && f.last_sent_day < 1) {
        console.log(`📧 Sending Day 1 email to ${f.name} <${f.email}> from ${agentName}...`);
        const { subject, html, plain } = buildDay1Email(lead, properties, agentName, agentPhone, agentEmail);
        const res = await sendEmail({ to: f.email, subject, html, message: plain });
        if (res.success) {
          f.last_sent_day = 1;
          await f.save();
          console.log(`✅ Day 1 email delivered successfully.`);
        } else {
          console.error(`❌ Day 1 email failed:`, res.error);
        }
      }
      // Day 2 (after 48 hours)
      else if (elapsedHours >= 48 && f.last_sent_day < 2) {
        console.log(`📧 Sending Day 2 email to ${f.name} <${f.email}> from ${agentName}...`);
        const { subject, html, plain } = buildDay2Email(lead, properties, agentName, agentPhone, agentEmail);
        const res = await sendEmail({ to: f.email, subject, html, message: plain });
        if (res.success) {
          f.last_sent_day = 2;
          await f.save();
          console.log(`✅ Day 2 email delivered successfully.`);
        } else {
          console.error(`❌ Day 2 email failed:`, res.error);
        }
      }
      // Day 3 (after 72 hours)
      else if (elapsedHours >= 72 && f.last_sent_day < 3) {
        console.log(`📧 Sending Day 3 email to ${f.name} <${f.email}> from ${agentName}...`);
        const { subject, html, plain } = buildDay3Email(lead, properties, agentName, agentPhone, agentEmail);
        const res = await sendEmail({ to: f.email, subject, html, message: plain });
        if (res.success) {
          f.last_sent_day = 3;
          f.status = 'completed';
          await f.save();
          console.log(`✅ Day 3 email delivered successfully. Sequence completed.`);
        } else {
          console.error(`❌ Day 3 email failed:`, res.error);
        }
      }
    }
  } catch (err) {
    console.error('Error in processFollowUpDrip:', err.message);
  }
}

module.exports = {
  scheduleFollowUps,
  cancelFollowUps,
  getFollowUpStatus,
  getAllScheduled,
  processFollowUpDrip,
  buildDay0Email,
  buildDay1Email,
  buildDay2Email,
  buildDay3Email
};
