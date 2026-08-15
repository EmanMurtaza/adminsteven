import InquiriesSection from "@/components/inquiries/InquiriesSection";

export default async function SellersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <InquiriesSection
      source="seller"
      title="Sellers"
      basePath="/inquiries/sellers"
      searchParams={await searchParams}
    />
  );
}
