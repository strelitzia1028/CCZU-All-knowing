import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/components/app-provider';

export const metadata: Metadata = {
  title: '常大西太湖 · 生活互助智能体',
  description: '常州大学西太湖校区生活互助智能体，为你提供校区生活信息、找搭子、二手交易等服务。',
};

export default function RootLayout({
  children,
}: ReadonlyProps<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}

type ReadonlyProps<T> = T;
