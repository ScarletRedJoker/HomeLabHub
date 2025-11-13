-- Grant developer access to Discord user ID: 368610753885896705
INSERT INTO developers (discord_id, is_active) 
VALUES ('368610753885896705', true) 
ON CONFLICT (discord_id) 
DO UPDATE SET is_active = true;

-- Verify the developer was added
SELECT * FROM developers WHERE discord_id = '368610753885896705';
