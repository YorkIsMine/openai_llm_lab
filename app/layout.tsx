import './globals.css';

export const metadata = {
  title: 'AI Assistant',
  description: 'Чат с AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className="h-full overflow-hidden antialiased">
      <body className="h-full overflow-hidden bg-[#0f172a] text-slate-200">{children}</body>
    </html>
  )
}
