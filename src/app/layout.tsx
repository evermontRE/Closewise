import type { Metadata } from "next";
import { Instrument_Serif, Noto_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { AuthSessionRedirect } from "@/app/auth/session-redirect";
import "./globals.css";

const notoSans = Noto_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-editorial",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Closewise",
  description: "Finance, deals and taxes for real estate agents — in one subscription.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${notoSans.variable} ${jakartaSans.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthSessionRedirect />
        {children}
      </body>
    </html>
  );
}
