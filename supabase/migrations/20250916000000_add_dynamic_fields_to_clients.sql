-- 1. Create custom_fields table
CREATE TABLE custom_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name) -- Each user has a unique set of custom field names
);

-- Enable RLS
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

-- Policies for custom_fields
CREATE POLICY "Allow users to manage their own custom fields"
ON custom_fields
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Create client_custom_field_values table
CREATE TABLE client_custom_field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    field_id UUID REFERENCES custom_fields(id) ON DELETE CASCADE,
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (client_id, field_id)
);

-- Enable RLS
ALTER TABLE client_custom_field_values ENABLE ROW LEVEL SECURITY;

-- Policies for client_custom_field_values
CREATE POLICY "Allow users to manage their own client custom field values"
ON client_custom_field_values
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM clients
    WHERE clients.id = client_custom_field_values.client_id AND clients.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM clients
    WHERE clients.id = client_custom_field_values.client_id AND clients.user_id = auth.uid()
  )
);


-- 3. Migrate data
DO $$
DECLARE
    user_record RECORD;
    device_key_field_id UUID;
    mac_address_field_id UUID;
    app_field_id UUID;
BEGIN
    -- For each user who has clients with old fields
    FOR user_record IN
        SELECT DISTINCT user_id
        FROM clients
        WHERE device_key IS NOT NULL OR mac_address IS NOT NULL OR app IS NOT NULL
    LOOP
        -- Create the custom fields for the user if they don't exist
        INSERT INTO custom_fields (name, user_id) VALUES ('Device Key', user_record.user_id) ON CONFLICT (user_id, name) DO NOTHING;
        INSERT INTO custom_fields (name, user_id) VALUES ('MAC', user_record.user_id) ON CONFLICT (user_id, name) DO NOTHING;
        INSERT INTO custom_fields (name, user_id) VALUES ('App', user_record.user_id) ON CONFLICT (user_id, name) DO NOTHING;

        -- Get the IDs of the custom fields for this user
        SELECT id INTO device_key_field_id FROM custom_fields WHERE name = 'Device Key' AND user_id = user_record.user_id;
        SELECT id INTO mac_address_field_id FROM custom_fields WHERE name = 'MAC' AND user_id = user_record.user_id;
        SELECT id INTO app_field_id FROM custom_fields WHERE name = 'App' AND user_id = user_record.user_id;

        -- Migrate device_key for the user's clients
        IF device_key_field_id IS NOT NULL THEN
            INSERT INTO client_custom_field_values (client_id, field_id, value)
            SELECT id, device_key_field_id, device_key
            FROM clients
            WHERE user_id = user_record.user_id AND device_key IS NOT NULL AND device_key != ''
            ON CONFLICT (client_id, field_id) DO NOTHING;
        END IF;

        -- Migrate mac_address for the user's clients
        IF mac_address_field_id IS NOT NULL THEN
            INSERT INTO client_custom_field_values (client_id, field_id, value)
            SELECT id, mac_address_field_id, mac_address
            FROM clients
            WHERE user_id = user_record.user_id AND mac_address IS NOT NULL AND mac_address != ''
            ON CONFLICT (client_id, field_id) DO NOTHING;
        END IF;

        -- Migrate app for the user's clients
        IF app_field_id IS NOT NULL THEN
            INSERT INTO client_custom_field_values (client_id, field_id, value)
            SELECT id, app_field_id, app
            FROM clients
            WHERE user_id = user_record.user_id AND app IS NOT NULL AND app != ''
            ON CONFLICT (client_id, field_id) DO NOTHING;
        END IF;

    END LOOP;
END $$;

-- 4. Remove old columns
ALTER TABLE clients
DROP COLUMN IF EXISTS device_key,
DROP COLUMN IF EXISTS mac_address,
DROP COLUMN IF EXISTS app;