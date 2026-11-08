import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fyStartYear } from "@/lib/gst/calendar";
import { GstWorkspace } from "./_components/GstWorkspace";

export const metadata: Metadata = { title: "GST & Tax" };

export default async function TaxPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  // useSearchParams (URL-backed tab/period) requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <GstWorkspace currentFy={fyStartYear(new Date())} />
    </Suspense>
  );
}
