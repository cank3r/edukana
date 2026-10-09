-- Allow announcement images while preserving the existing private academic formats.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        UPDATE storage.buckets
        SET
            public = false,
            file_size_limit = 104857600,
            allowed_mime_types = ARRAY[
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'text/plain',
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/gif',
                'video/mp4',
                'video/webm'
            ]::text[]
        WHERE id = 'edukana';
    END IF;
END $$;
