/* ============================================================================
   Vakil Saab Agra — single place to change business details.
   Edit this file to update the phone number, email and address that appear
   across every page (header, footer, contact page and structured data).
   ========================================================================= */
window.VS_CONFIG = {
  name: 'Vakil Saab Agra',
  tagline: 'Agra’s advocate directory',
  url: 'https://vakilsaabagra.in',

  /* The number advocates call to get listed, and users call for help.
     TODO(subroto): +919876543210 is the stock example number and is NOT real.
     It appears in the header, the footer, the mobile drawer, the contact page,
     the FAQ answers, the WhatsApp prefill links and the JSON-LD — grep the repo
     for 9876543210 to catch every one, since some are written into the HTML
     rather than read from here. Nothing dials until this is replaced. */
  phone: '+919876543210',
  phoneDisplay: '+91 98765 43210',
  whatsapp: '919876543210',
  /* TODO(subroto): confirm this mailbox exists and forwards somewhere you
     read. It is printed on the contact page and in the JSON-LD. */
  email: 'hello@vakilsaabagra.in',

  /* advocate microsites are served at <slug>.<micrositeDomain> */
  micrositeDomain: 'vakilsaabagra.in',

  address: {
    street: 'Sanjay Place',
    locality: 'Agra',
    region: 'Uttar Pradesh',
    postalCode: '282002',
    country: 'IN'
  },
  geo: { lat: 27.1767, lng: 78.0081 },
  hours: 'Mon–Sat, 10:00 AM – 7:00 PM',

  /* Real profile URLs only. These are published as schema.org `sameAs`, which
     is a claim about who we are — pointing it at facebook.com's own home page
     told Google our brand's profile *is* Facebook. Empty values are skipped.
     TODO(subroto): fill in the profiles that actually exist, delete the rest. */
  social: {
    facebook: '',
    instagram: '',
    linkedin: '',
    youtube: ''
  },

  /* Shows a small "sample listings" line in the footer.
     Set to false once you have replaced data/lawyers.json with real,
     consented advocate details. */
  demoNotice: true
};
