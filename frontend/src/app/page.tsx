'use client';

import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    window.location.replace('/chat/');
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
      正在进入 CCZU All-knowing...
    </main>
  );
}
