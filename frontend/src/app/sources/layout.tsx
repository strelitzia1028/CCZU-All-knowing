'use client';

import React from 'react';
import { Navigation } from '@/components/navigation';

export default function SourcesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <main className="cczu-page-transition">{children}</main>
    </div>
  );
}
