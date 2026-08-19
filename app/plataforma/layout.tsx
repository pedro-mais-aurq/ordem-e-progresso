import { AcademicDataProvider } from "@/src/components/platform/AcademicDataProvider";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <AcademicDataProvider>{children}</AcademicDataProvider>;
}

