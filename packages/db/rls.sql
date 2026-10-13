-- ─────────────────────────────────────────────────────────────
-- Row-Level Security (build spec §4.3)
-- Apply AFTER drizzle migrations, as a superuser/owner role.
-- Idempotent where practical (drop policy if exists before create).
-- ─────────────────────────────────────────────────────────────

-- App roles ---------------------------------------------------
-- app_user     : the application connects as this (no BYPASSRLS).
-- app_platform : platform/admin jobs (BYPASSRLS) for shared fund data + admin.
-- Create roles once (NOLOGIN group roles; grant to the login role in Neon).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_platform') THEN
    CREATE ROLE app_platform NOLOGIN BYPASSRLS;
  END IF;
END$$;

-- Helper: current firm id from the transaction-local setting.
CREATE OR REPLACE FUNCTION app_current_firm() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.firm_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_current_user() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;
CREATE OR REPLACE FUNCTION app_current_role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.role', true), '') $$;

-- Tenant isolation macro applied to every tenant table ---------
-- (firm_id column must exist on the table)
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'portfolio','portfolio_holding','presentation','slide','export',
    'firm_settings','team_member','firm_profile','member','invitation',
    'subscription','privacy_request','support_grant','terms_acceptance'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    -- terms_acceptance keys on user, not firm; handled separately below
    IF t <> 'terms_acceptance' THEN
      EXECUTE format($f$
        CREATE POLICY tenant_isolation ON %I
          USING (firm_id = app_current_firm())
          WITH CHECK (firm_id = app_current_firm())
      $f$, t);
    END IF;
  END LOOP;
END$$;

-- Personal-portfolio visibility (restrictive, spec §4.3) -------
DROP POLICY IF EXISTS personal_owner ON portfolio;
CREATE POLICY personal_owner ON portfolio AS RESTRICTIVE
  USING (
    kind = 'house'
    OR owner_user_id = app_current_user()
    OR app_current_role() = 'firm_admin'
  );

-- Audit log: append-only (no UPDATE/DELETE for app_user) --------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_tenant_select ON audit_log;
CREATE POLICY audit_tenant_select ON audit_log FOR SELECT
  USING (firm_id = app_current_firm() OR firm_id IS NULL);
DROP POLICY IF EXISTS audit_insert ON audit_log;
CREATE POLICY audit_insert ON audit_log FOR INSERT
  WITH CHECK (firm_id = app_current_firm() OR firm_id IS NULL);
REVOKE UPDATE, DELETE ON audit_log FROM app_user;

-- Shared fund-data tables: readable by app_user, writable only by platform.
-- (provider, fund, data_version, fund_price, fund_fact_version, fund_metric,
--  stress_event, forbidden_term, data_upload, platform_state)
DO $$
DECLARE
  t text;
  shared_tables text[] := ARRAY[
    'provider','fund','data_version','fund_price','fund_fact_version',
    'fund_metric','stress_event','forbidden_term'
  ];
BEGIN
  FOREACH t IN ARRAY shared_tables LOOP
    EXECUTE format('GRANT SELECT ON %I TO app_user', t);
  END LOOP;
END$$;

-- Platform-only tables: no grant to app_user at all.
REVOKE ALL ON data_upload, platform_state FROM app_user;

-- Default: app_user gets DML on tenant tables (RLS still filters rows).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  portfolio, portfolio_holding, presentation, slide, export,
  firm_settings, team_member, firm_profile, member, invitation,
  subscription, privacy_request, support_grant, terms_acceptance,
  audit_log
  TO app_user;
