import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Online Sign System',
  description: '1-on-1 live signing experience with real-time WebRTC and canvas sync.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased bg-white text-gray-900">{children}</body>
    </html>
  );
}
