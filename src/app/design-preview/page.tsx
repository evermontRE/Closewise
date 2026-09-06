import type { Metadata } from "next";
import DesignPreview from "./preview";

export const metadata: Metadata = {
  title: "Finance Studio Design Preview",
  robots: { index: false, follow: false },
};

export default function DesignPreviewPage() {
  return <DesignPreview />;
}
