/**
 * LinkedIn Profile Finder — Content Script
 * 
 * Scans the DOM for person names on academic/profile pages and injects
 * small LinkedIn search buttons beside each detected name.
 */

(() => {
  "use strict";

  // ── Constants ──────────────────────────────────────────────────────────

  const PROCESSED_ATTR = "data-lpf-processed";
  const BUTTON_CLASS = "lpf-linkedin-btn";
  const WRAPPER_CLASS = "lpf-name-wrapper";

  const LINKEDIN_SEARCH_URL =
    "https://www.linkedin.com/search/results/people/?keywords=";

  // LinkedIn "in" logo as inline SVG
  const LINKEDIN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>`;

  // ── Selectors for name elements ────────────────────────────────────────

  // CSS selectors commonly used on academic / faculty / profile pages
  const NAME_SELECTORS = [
    // IIT Kanpur / Web Team Kanpur specific links
    ".wtk-links",
    // Specific class-based selectors (high confidence)
    ".faculty-name",
    ".profile-name",
    ".professor-name",
    ".staff-name",
    ".researcher-name",
    ".author-name",
    ".member-name",
    ".person-name",
    ".team-member-name",
    ".people-name",
    ".card-title.name",
    ".faculty_name",
    ".prof-name",
    ".name-title",
    '[class*="faculty"][class*="name"]',
    '[class*="professor"][class*="name"]',
    '[class*="profile"][class*="name"]',
    '[class*="people"][class*="name"]',
    '[class*="staff"][class*="name"]',
    '[class*="team"][class*="name"]',
    '[class*="member"][class*="name"]',
    '[class*="author"][class*="name"]',
    '[class*="person"][class*="name"]',
    // Structured data — only when the element is inside a profile-like container
    // (bare [itemprop="name"] and [data-name] are too broad — removed)
    // Common academic page structures  
    ".views-field-title .field-content",
    ".faculty-listing .name",
    ".people-listing .name",
    ".directory-listing .name",
    // Heading elements inside profile-like containers
    ".faculty-card h2",
    ".faculty-card h3",
    ".profile-card h2",
    ".profile-card h3",
    ".people-card h2",
    ".people-card h3",
    ".team-card h2",
    ".team-card h3",
    ".member-card h2",
    ".member-card h3",
    ".staff-card h2",
    ".staff-card h3",
    ".card.person h3",
    ".card.person h2",
  ];

  // ── Heuristic name validation ──────────────────────────────────────────

  /**
   * Regex for a plausible human name. Supports:
   *  - 2–5 words, each capitalised
   *  - Prefixes like Dr., Prof., Mr., Mrs., etc.
   *  - Hyphenated and apostrophed surnames (O'Brien, Levy-Smith)
   *  - Middle initials (J.)
   */
  // Requires 2–5 words, each starting with a capital letter.
  // Supports full words (Singh, Kumar) AND single-letter initials (A., K., S.).
  // The first word may optionally be a title prefix (Dr., Prof., etc.).
  //
  // Each name-part matches either:
  //   • A full word:  Capital + 1–20 lowercase chars  (optionally hyphenated/apostrophed)
  //   • An initial:   Single capital letter, optionally followed by a period
  const NAME_PART = String.raw`(?:[A-Z\u00C0-\u024F](?:[a-z\u00C0-\u024F]{1,20}(?:['\-][A-Z\u00C0-\u024F]?[a-z\u00C0-\u024F]+)?|\.))`;
  const NAME_REGEX = new RegExp(
    String.raw`^(?:(?:Dr|Prof|Mr|Mrs|Ms|Sri|Smt|Shri)\.?\s+)?` +
    NAME_PART +
    String.raw`(?:\.?\s+` + NAME_PART + String.raw`\.?){1,4}$`
  );

  /**
   * Words that disqualify a string from being a name.
   */
  const STOP_WORDS = new Set([
    // Institution / structural words
    "department", "university", "college", "institute", "school",
    "faculty", "professor", "contact", "email", "phone", "address",
    "page", "home", "about", "research", "publication", "publications",
    "teaching", "course", "courses", "office", "lab", "laboratory",
    "group", "center", "centre", "division", "section", "welcome",
    "news", "events", "menu", "search", "login", "sign", "register",
    "copyright", "privacy", "terms", "sitemap", "navigation", "skip",
    "submit", "download", "upload", "view", "read", "more", "click",
    "loading", "error", "undefined", "null",
    // Common generic English verbs / words that look capitalised in headings
    "learn", "explore", "discover", "connect", "follow", "share",
    "join", "start", "get", "find", "open", "close", "save", "send",
    "edit", "delete", "update", "create", "add", "remove", "show",
    "hide", "next", "previous", "back", "continue", "cancel", "done",
    "apply", "reset", "filter", "sort", "list", "table", "grid",
    "all", "see", "visit", "watch", "play", "stop", "help", "support",
    "buy", "shop", "order", "checkout", "details", "info", "information",
    "overview", "summary", "introduction", "description", "title",
    "heading", "header", "footer", "sidebar", "banner", "image", "video",
    "link", "button", "form", "input", "select", "option", "label",
    "category", "tag", "type", "status", "date", "time", "year",
    "month", "day", "hour", "minute", "second", "total", "count",
  ]);

  /**
   * Returns true if `text` looks like a plausible person name.
   */
  function isLikelyName(text) {
    if (!text) return false;

    const trimmed = text.trim().replace(/\s+/g, " ");

    // Length checks: too short or too long
    if (trimmed.length < 4 || trimmed.length > 60) return false;

    // Must pass the regex
    if (!NAME_REGEX.test(trimmed)) return false;

    // Reject if any whole word in the text is a stop word
    const lower = trimmed.toLowerCase();
    for (const word of STOP_WORDS) {
      // Use word-boundary check: the stop word must appear as a standalone token
      if (new RegExp(`(?:^|\\s)${word}(?:\\s|$)`).test(lower)) return false;
    }

    // Must have at least 2 "words" (first + last name)
    const words = trimmed.split(/\s+/);
    if (words.length < 2) return false;

    return true;
  }

  // ── Institution detection ──────────────────────────────────────────────

  /**
   * Attempts to extract an institution name from the page for
   * better LinkedIn search accuracy.
   */
  function detectInstitution() {
    // Try the <title> tag
    const title = document.title || "";

    // Try meta tags
    const metaDesc =
      document.querySelector('meta[name="description"]')?.content || "";
    const metaOg =
      document.querySelector('meta[property="og:site_name"]')?.content || "";

    // Common institution indicators
    const patterns = [
      /(?:Indian\s+Institute\s+of\s+Technology[\s,]*\w+)/i,
      /(?:Indian\s+Institute\s+of\s+Management[\s,]*\w+)/i,
      /(?:IIT\s+\w*)/i,
      /(?:NIT\s+\w*)/i,
      /(?:IIIT\s+\w*)/i,
      /(?:IIM\s+\w*)/i,
      /(?:IISER\s+\w*)/i,
      /(?:BITS\s+\w*)/i,
      /(?:University\s+of\s+[\w\s]+)/i,
      /(?:[\w\s]+University)/i,
      /(?:[\w\s]+Institute\s+of\s+(?:Technology|Science|Management))/i,
      /(?:[\w\s]+College)/i,
      /(?:MIT|Stanford|Harvard|Caltech|CMU|Berkeley|Oxford|Cambridge)/i,
    ];

    const sources = [title, metaDesc, metaOg];

    for (const source of sources) {
      for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match) {
          return match[0].trim();
        }
      }
    }

    // Fallback: use the site hostname to guess the institution
    const host = location.hostname.replace(/^www\./, "");
    const parts = host.split(".");
    
    // Reverse iterate to find the first part that is likely the institution name,
    // thereby skipping department subdomains (like eco.iitk.ac.in -> iitk)
    const genericTLDs = new Set(["ac", "edu", "in", "uk", "com", "org", "net", "gov", "co", "se", "lu", "ernet"]);
    
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].toLowerCase();
      if (!genericTLDs.has(part) && part.length > 2) {
        return parts[i].toUpperCase();
      }
    }
    
    // Absolute fallback if all else fails
    if (parts.length >= 2) {
      return parts[parts.length - 2].toUpperCase();
    }

    return "";
  }

  let cachedInstitution = null;

  function getInstitution() {
    if (cachedInstitution === null) {
      cachedInstitution = detectInstitution();
    }
    return cachedInstitution;
  }

  // ── Button creation & injection ────────────────────────────────────────

  /**
   * Creates the LinkedIn search button element.
   */
  function createLinkedInButton(name) {
    const btn = document.createElement("button");
    btn.className = BUTTON_CLASS;
    btn.type = "button";
    btn.setAttribute("aria-label", `Search LinkedIn for ${name}`);
    btn.innerHTML = LINKEDIN_ICON_SVG;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const institution = getInstitution();
      const query = institution ? `${name} ${institution}` : name;
      const url = LINKEDIN_SEARCH_URL + encodeURIComponent(query);
      window.open(url, "_blank", "noopener,noreferrer");
    });

    return btn;
  }

  /**
   * Injects a LinkedIn button next to a name element.
   */
  function injectButton(el) {
    // Guard: already processed, or overlapping with a processed ancestor/descendant
    if (
      el.hasAttribute(PROCESSED_ATTR) ||
      el.closest(`[${PROCESSED_ATTR}]`) ||
      el.querySelector(`[${PROCESSED_ATTR}]`)
    ) {
      return;
    }

    const text = el.textContent.trim().replace(/\s+/g, " ");

    if (!isLikelyName(text)) return;

    // Mark as processed BEFORE inject to prevent races
    el.setAttribute(PROCESSED_ATTR, "true");

    const btn = createLinkedInButton(text);

    // If the element is block-level (heading, div, p), append inside it.
    // If inline (span, a, strong), insert after it.
    const display = window.getComputedStyle(el).display;

    if (display === "inline" || display === "inline-block") {
      el.parentNode.insertBefore(btn, el.nextSibling);
    } else {
      el.appendChild(btn);
    }
  }

  // ── DOM scanning ───────────────────────────────────────────────────────

  /**
   * Scans a root element for name elements and injects buttons.
   */
  function scanForNames(root = document.body) {
    if (!root) return;

    const selector = NAME_SELECTORS.join(", ");

    // Query all matching elements inside root
    let elements;
    try {
      elements = root.querySelectorAll(selector);
    } catch {
      elements = [];
    }

    for (const el of elements) {
      injectButton(el);
    }

    // Also run a heuristic scan on elements that might contain names
    // but don't match any specific selector
    const nameElements = root.querySelectorAll("h1, h2, h3, h4, h5, h6, strong, b, span, p, td, div");
    for (const h of nameElements) {
      if (h.hasAttribute(PROCESSED_ATTR)) continue;

      // Only process if it's inside a container that looks profile-like
      // Only containers that are strongly indicative of a people/profile listing.
      // Removed overly broad ones like [class*="contact"], [class*="user"] that
      // appear on generic pages and cause false positives.
      const parent = h.closest(
        '[class*="faculty"], [id*="faculty"], [class*="profile"], [id*="profile"], [class*="people"], [id*="people"], ' +
        '[class*="staff"], [id*="staff"], [class*="team"], [id*="team"], [class*="member"], [id*="member"], ' +
        '[class*="directory"], [id*="directory"], [class*="person"], [id*="person"], ' +
        '[class*="author"], [id*="author"], [class*="researcher"], [id*="researcher"], [class*="professor"], [id*="professor"], ' +
        '[class*="instructor"], [id*="instructor"], [class*="speaker"], [id*="speaker"], [class*="presenter"], [id*="presenter"]'
      );
      if (parent) {
        // Prevent false positives on repositories, articles, or products
        const skipParent = h.closest('[class*="repo"], [id*="repo"], [class*="article"], [id*="article"], [class*="product"], [id*="product"], [class*="post"], [id*="post"]');
        if (!skipParent) {
          injectButton(h);
        }
      }
    }
  }

  // ── MutationObserver for dynamic content ───────────────────────────────

  let scanTimeout = null;

  function debouncedScan(target) {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      scanForNames(target || document.body);
      scanTimeout = null;
    }, 300);
  }

  function setupObserver() {
    const observer = new MutationObserver((mutations) => {
      let needsScan = false;

      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              needsScan = true;
              break;
            }
          }
        }
        if (needsScan) break;
      }

      if (needsScan) {
        debouncedScan(document.body);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ── Initialization ─────────────────────────────────────────────────────

  function isExcludedSite() {
    // EXCLUDED_HOSTS is defined in excluded-sites.js (loaded before this script).
    const hosts = (typeof EXCLUDED_HOSTS !== "undefined") ? EXCLUDED_HOSTS : [];
    const host = location.hostname.replace(/^www\./, "");
    return hosts.some((excluded) => host === excluded || host.endsWith("." + excluded));
  }

  function init() {
    // Do not run on excluded sites
    if (isExcludedSite()) return;

    // Initial scan
    scanForNames();

    // Watch for dynamic content
    setupObserver();

    console.log(
      "%c[LinkedIn Profile Finder]%c Extension loaded.",
      "color: #0A66C2; font-weight: bold;",
      "color: inherit;"
    );
  }

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
