import "./globals.css";

export const metadata = {
  title: "Aspen Kingfisher — River Hunt: Living River",
  description: "A cinematic kingfisher wildlife game: read a living river, dive at speed, catch rainbow trout and many other fish species, surface, perch, and master the hunt.",
  applicationName: "Aspen Kingfisher River Hunt",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kingfisher River Hunt",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#06151a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
