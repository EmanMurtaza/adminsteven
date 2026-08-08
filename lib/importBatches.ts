export interface ImportBatch {
  id: string;
  kind: "csv" | "website";
  file_name: string | null;
  source: string | null;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  created_at: string;
}

export function importBatchLabel(batch: ImportBatch): string {
  if (batch.kind === "website") return "Website enquiries";
  return batch.file_name || "CSV upload";
}
