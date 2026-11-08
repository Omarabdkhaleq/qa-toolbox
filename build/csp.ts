import type { Plugin } from 'vite';

/** Must equal docker/security-headers.conf (enforced by csp.test.ts). */
export const CSP_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
];

export function metaCsp(): string {
  return CSP_DIRECTIVES.filter((d) => !d.startsWith('frame-ancestors')).join('; ');
}

/** GitHub Pages can't set headers, so the Pages build carries the CSP as a <meta> tag. */
export function pagesCspPlugin(): Plugin {
  return {
    name: 'qa-toolbox-pages-csp',
    apply: 'build',
    transformIndexHtml(html) {
      if (process.env.QA_TOOLBOX_TARGET !== 'pages') return html;
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${metaCsp()}" />`,
      );
    },
  };
}
