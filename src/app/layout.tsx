import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'O2C Graph — SAP Order-to-Cash Intelligence',
  description: 'Interactive graph visualization and AI-powered querying of SAP Order-to-Cash data',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
