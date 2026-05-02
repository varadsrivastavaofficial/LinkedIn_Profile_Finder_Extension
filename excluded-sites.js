/**
 * excluded-sites.js
 *
 * List of hostnames where the LinkedIn Profile Finder extension should NOT run.
 *
 * HOW TO EDIT:
 *  - Add or remove entries from the array below.
 *  - Use the root domain only (e.g. "example.com").
 *    The extension will also block all sub-domains automatically
 *    (e.g. "web.example.com", "app.example.com").
 *  - After editing, reload the extension at chrome://extensions
 *    for the changes to take effect.
 *
 * FORMAT:  "<root-domain>"
 * EXAMPLE: "twitter.com"  →  blocks twitter.com, mobile.twitter.com, etc.
 */

// ⚠️  Edit this list to control where the extension is disabled.
var EXCLUDED_HOSTS = [
  "linkedin.com",       // LinkedIn itself — no need to scan our own target
  "whatsapp.com",       // WhatsApp Web — not a professional directory
  "web.whatsapp.com",   // WhatsApp Web app subdomain (explicit, for clarity)
  // "twitter.com",     // ← example: uncomment to also block Twitter/X
  // "facebook.com",    // ← example: uncomment to also block Facebook
];
