import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { AppProvider } from '@/components/app-provider';

export const metadata: Metadata = {
  title: 'CCZU All-knowing',
  description: 'CCZU All-knowing 校园生活 Agent，为你提供校区生活信息、找搭子、二手交易等服务。',
};

export default function RootLayout({
  children,
}: ReadonlyProps<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <Script
          id="chunk-load-recovery"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var key = 'cczu-chunk-reload-at';
                function recover(message) {
                  if (!/(ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|Importing a module script failed)/i.test(message || '')) return;
                  try {
                    var last = Number(sessionStorage.getItem(key) || 0);
                    if (Date.now() - last < 10000) return;
                    sessionStorage.setItem(key, String(Date.now()));
                  } catch (_) {}
                  window.location.reload();
                }
                window.addEventListener('error', function (event) {
                  var target = event && event.target;
                  recover(
                    (event && event.message) ||
                    (event && event.error && event.error.message) ||
                    (target && target.src) ||
                    ''
                  );
                }, true);
                window.addEventListener('unhandledrejection', function (event) {
                  var reason = event && event.reason;
                  recover(
                    (reason && reason.message) ||
                    (typeof reason === 'string' ? reason : '')
                  );
                });
              })();
            `,
          }}
        />
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}

type ReadonlyProps<T> = T;
