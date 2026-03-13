import "./globals.css";

export const metadata = {
  title: "TodoTest Flashcards",
  description: "Flashcards de preguntas de TodoTest",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
