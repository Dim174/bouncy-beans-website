// ============================================================================
//  CONFIG — fill these in after deploying your Cloudflare Worker and setting
//  up your EmailJS account. Everything else in the app reads from here.
// ============================================================================

export const CONFIG = {
  // Your Cloudflare Worker URL (e.g., https://bouncy-beans-api.yourname.workers.dev
  // OR a custom route like https://api.bouncybeanswpg.ca)
  WORKER_URL: "https://bouncy-beans-api.dim174.workers.dev",

  // Public site URL (used to build the shareable link for the client)
  SITE_URL: "https://bouncybeanswpg.ca",

  // EmailJS public key (safe to expose in frontend — used only for fallback
  // direct-send from client. The Worker sends the real email using a private
  // access token stored as a secret).
  EMAILJS_PUBLIC_KEY: "TiWJWCflzGbpUfzeF",

  // Business info (used in PDF header and emails)
  BUSINESS: {
    name: "Bouncy Beans Soft Play",
    email: "bouncybeanssoftplay@gmail.com",
    phone: "",                       // add phone if you want it on the PDF
    website: "bouncybeanswpg.ca",
    city: "Winnipeg",
    currency: "CAD",
    depositAmount: 150,              // $150 deposit (locked)
  },
};
