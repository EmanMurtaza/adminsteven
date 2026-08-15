import InquiriesSection from "@/components/inquiries/InquiriesSection";

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <InquiriesSection
      source="buyer"
      title="Buyers"
      basePath="/inquiries/buyers"
      searchParams={await searchParams}
    />
  );
}
