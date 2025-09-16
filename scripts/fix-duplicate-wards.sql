-- Script to fix wards that end with ' Ward Ward' by removing the duplicate ' Ward'
-- This updates the 'ward' column in the 'candidates' table

-- First, let's see what records would be affected (optional, for verification)
SELECT ward FROM candidates WHERE ward LIKE '% Ward Ward';

-- Update the wards by replacing ' Ward Ward' with ' Ward'
UPDATE candidates
SET ward = REPLACE(ward, ' Ward Ward', ' Ward')
WHERE ward LIKE '% Ward Ward';

-- Verify the changes (optional)
SELECT ward FROM candidates WHERE ward LIKE '% Ward';