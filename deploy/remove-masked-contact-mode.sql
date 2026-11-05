UPDATE sources
SET contact_mode = 'platform',
    updated_at = NOW()
WHERE contact_mode = 'masked';
