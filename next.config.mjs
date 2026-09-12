/** @type {import('next').NextConfig} */

const firebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "";
if (firebaseAuthDomain && !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(firebaseAuthDomain)) {
  throw new Error("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN에는 https:// 또는 경로 없이 호스트 이름만 입력하세요.");
}
const firebaseFrameSource = firebaseAuthDomain ? ` https://${firebaseAuthDomain}` : "";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://apis.google.com https://*.gstatic.com blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://cdn.jsdelivr.net https://apis.google.com wss://*.firebaseio.com data: blob:",
  "worker-src 'self' blob:",
  `frame-src 'self'${firebaseFrameSource} https://apis.google.com https://accounts.google.com`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
