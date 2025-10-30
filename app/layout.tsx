import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Politics, Drug Deaths & Mental Health Dashboard',
  description: 'Interactive county-level analysis of political affiliation, drug deaths, and mental health (2018-2023)',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link href='https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css' rel='stylesheet' />
      </head>
      <body className="bg-gray-50">{children}</body>
    </html>
  )
}
