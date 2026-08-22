INSERT OR IGNORE INTO user (id, clerk_user_id, name, email, email_verified, created_at, updated_at)
VALUES ('user_demo', 'user_local_demo', 'Demo User', 'demo@plantifiles.local', 1, unixepoch(), unixepoch());
UPDATE user SET clerk_user_id = 'user_local_demo' WHERE id = 'user_demo' AND clerk_user_id IS NULL;

INSERT OR IGNORE INTO workspace (id, clerk_organization_id, slug, name)
VALUES ('workspace_demo', 'org_local_demo', 'demo', 'Demo');
UPDATE workspace SET clerk_organization_id = 'org_local_demo' WHERE id = 'workspace_demo' AND clerk_organization_id IS NULL;

INSERT OR IGNORE INTO membership (id, user_id, workspace_id, role)
VALUES ('membership_demo', 'user_demo', 'workspace_demo', 'owner');

INSERT OR IGNORE INTO api_token (id, user_id, name, token_hash)
VALUES ('token_demo', 'user_demo', 'Local demo', 'bded19adb17af54c202736d501ac4d0d1a4d4d4da840e3df5b74daa4dea1735e');
