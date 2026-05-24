import type { NextConfig } from "next";

// Security headers applied to every response.
// Notes:
//   • HSTS — forces browsers to use HTTPS for ~2 years (only safe on a domain
//     that will always be HTTPS-only, which Vercel guarantees).
//   • CSP — restricts where scripts/images/connections can come from.
//     'unsafe-inline' is needed in script-src for Next.js inline runtime hydration.
//     connect-src allows the Supabase project. Add custom domains as needed.
//   • frame-ancestors 'none' + X-Frame-Options DENY — prevent clickjacking.
//   • Referrer-Policy — don't leak full URL to third parties.
const SUPABASE_HOST = "https://*.supabase.co";
const SUPABASE_WS = "wss://*.supabase.co";

const cspParts = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${SUPABASE_HOST} ${SUPABASE_WS}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
];

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspParts.join("; ") },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
