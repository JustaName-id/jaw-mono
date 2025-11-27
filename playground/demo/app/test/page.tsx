'use client';

import dynamic from 'next/dynamic';

const TestPageContent = dynamic(
  () => import('./TestPageContent'),
  { ssr: false }
);

export default function TestPage() {
  return <TestPageContent />;
}
