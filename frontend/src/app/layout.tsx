import type { Metadata } from "next";
import { createElement, type ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "docintel — AI Document Intelligence",
  description: "Automated invoice processing, extraction, validation, and search",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return createElement(
    "html",
    { lang: "en" },
    createElement("body", { className: inter.className }, children),
  );
}