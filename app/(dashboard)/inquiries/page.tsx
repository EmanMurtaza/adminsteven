import { redirect } from "next/navigation";

// Buyers and sellers each have their own section now; land on Buyers by default.
export default function InquiriesIndex() {
  redirect("/inquiries/buyers");
}
