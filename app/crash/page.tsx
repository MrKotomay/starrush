'use client';

import dynamic from 'next/dynamic';

const CrashGame = dynamic(
  () => import('@/components/crash/CrashGame').then((mod) => mod.CrashGame),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground/70">Загрузка…</p>
        </div>
      </div>
    ),
  }
);

export default function CrashPage() {
  return (
    <div className="min-h-screen bg-background">
      <CrashGame demoMode={true} />
    </div>
  );
}

