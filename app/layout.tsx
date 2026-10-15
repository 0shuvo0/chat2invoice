import './globals.css';
import type { Metadata, Viewport } from 'next';
export const metadata: Metadata = { title: 'Chat2Invoice – AI Invoice Generator', description: 'Turn client chats into an invoice in seconds' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#5a45e6' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className="font-sans antialiased">{children}</body></html>);
}
