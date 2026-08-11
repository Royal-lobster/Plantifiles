INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at)
VALUES ('user_demo', 'Demo User', 'demo@plantifiles.local', 1, unixepoch(), unixepoch());

INSERT OR IGNORE INTO workspace (id, slug, name, required_approvals)
VALUES ('workspace_demo', 'demo', 'Demo', 1);

INSERT OR IGNORE INTO membership (id, user_id, workspace_id, role)
VALUES ('membership_demo', 'user_demo', 'workspace_demo', 'owner');

INSERT OR IGNORE INTO api_token (id, user_id, name, token_hash)
VALUES ('token_demo', 'user_demo', 'Local demo', 'bded19adb17af54c202736d501ac4d0d1a4d4d4da840e3df5b74daa4dea1735e');
