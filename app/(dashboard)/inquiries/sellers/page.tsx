import InquiriesSection from "@/components/inquiries/InquiriesSection";

export default async function SellersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const p = (await searchParams).page;
  const page = Math.max(1, Number(typeof p === "string" ? p : "1") || 1);
  return (
    <InquiriesSection
      source="seller"
      title="Sellers"
      basePath="/inquiries/sellers"
      page={page}
    />
  );
}
