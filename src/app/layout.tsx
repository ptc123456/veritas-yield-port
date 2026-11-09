import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veritas Port | Atomic Solana Lending Yield Port on Rome Protocol",
  description:
    "An atomic yield port letting EVM (MetaMask) and Solana (Solflare/Phantom) wallets earn in Solana lending markets (Kamino, Save, Meteora) via Rome CPI precompiles in a single transaction.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#06080F] text-slate-100 antialiased selection:bg-amber-500/30 selection:text-amber-200">
        {children}
      </body>
    </html>
  );
}
