-- Cap the inquiry attachment bucket at the storage layer.
--
-- The public upload route validates the client-declared size and extension,
-- but the signed PUT URL it hands out was previously unconstrained: an
-- anonymous caller could declare a small file and upload an arbitrarily
-- large body into a private bucket. The application-side size check only
-- runs when an inquiry is submitted, so the object already existed by then.
--
-- The bucket limit is the largest plan allowance (business plan: 50 MB), and
-- the mime types match the public inquiry attachment allowlist.
update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
  ],
  updated_at = now()
where id = 'inquiry-attachments';
