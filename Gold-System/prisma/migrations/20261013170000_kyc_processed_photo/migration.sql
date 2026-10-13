-- Background-free personal photo, stored separately from the review original.
ALTER TABLE "customer_documents"
ADD COLUMN "processed_file_key" TEXT;
