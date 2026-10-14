-- ─────────────────────────────────────────────────────────────
-- Row-Level Security (build spec §4.3)
-- Apply AFTER drizzle migrations, as the owner role.
-- Idempotent where practical.
-- ─────────────────────────────────────────────────────────────

-- App roles ---------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_platform') THEN
    CREATE ROLE app_platform NOLOGIN BYPASSRLS;
  END IF;
END$$;

-- Context helpers ---------------------------------------------
CREATE OR REPLACE FUNCTION app_current_firm() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.firm_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_current_user() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;
CREATE OR REPLACE FUNCTION app_current_role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.role', true), '') $$;

-- Tenant isolation on tables that have a firm_id column ---------
DO $$
DECLARE
  t text;
  firm_id_tables text[] := ARRAY[
    'portfolio','portfolio_holding','presentation','slide','export',
    'firm_settings','team_member','firm_profile','subscription',
    'privacy_request','support_grant'
  ];
BEGIN
  FOREACH t IN ARRAY firm_id_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (firm_id = app_current_firm())
        WITH CHECK (firm_id = app_current_firm())
    $f$, t);
  END LOOP;
END$$;

-- member + invitation key on organization_id (= firm id) --------
DO $$
DECLARE
  t text;
  org_id_tables text[] := ARRAY['member','invitation'];
BEGIN
  FOREACH t IN ARRAY org_id_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (organization_id = app_current_firm())
        WITH CHECK (organization_id = app_current_firm())
    $f$, t);
  END LOOP;
END$$;

-- terms_acceptance keys on user, not firm ----------------------
ALTER TABLE terms_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms_acceptance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_terms ON terms_acceptance;
CREATE POLICY own_terms ON terms_acceptance
  USING (user_id = app_current_user())
  WITH CHECK (user_id = app_current_user());

-- Personal-portfolio visibility (restrictive, spec §4.3) -------
DROP POLICY IF EXISTS personal_owner ON portfolio;
CREATE POLICY personal_owner ON portfolio AS RESTRICTIVE
  USING (
    kind = 'house'
    OR owner_user_id = app_current_user()
    OR app_current_role() = 'firm_admin'
  );

-- Audit log: append-only ---------------------------------------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_tenant_select ON audit_log;
CREATE POLICY audit_tenant_select ON audit_log FOR SELECT
  USING (firm_id = app_current_firm() OR firm_id IS NULL);
DROP POLICY IF EXISTS audit_insert ON audit_log;
CREATE POLICY audit_insert ON audit_log FOR INSERT
  WITH CHECK (firm_id = app_current_firm() OR firm_id IS NULL);

-- Shared fund-data tables: readable by app_user ----------------
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

-- Platform-only tables: no app_user access ---------------------
REVOKE ALL ON data_upload FROM app_user;

-- platform_state: app_user needs to READ the live-version pointer
-- (every fund query resolves live_version_id), but never writes it.
REVOKE ALL ON platform_state FROM app_user;
GRANT SELECT ON platform_state TO app_user;

-- DML grants on tenant + audit tables (RLS still filters rows) --
GRANT SELECT, INSERT, UPDATE, DELETE ON
  portfolio, portfolio_holding, presentation, slide, export,
  firm_settings, team_member, firm_profile, member, invitation,
  subscription, privacy_request, support_grant, terms_acceptance,
  audit_log
  TO app_user;

-- audit_log is append-only for app_user
REVOKE UPDATE, DELETE ON audit_log FROM app_user;


-- ─────────────────────────────────────────────────────────────
-- Session bootstrap: read a user's own memberships before any firm
-- context exists (RLS on `member` would otherwise hide them).
-- SECURITY DEFINER = runs as the function owner, bypassing RLS, but ONLY
-- for this one vetted, read-only, user-scoped lookup. `member` stays fully
-- RLS-protected for every other code path.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_user_memberships(p_user_id text)
  RETURNS TABLE (
    firm_id uuid,
    role firm_role,
    can_edit_house_portfolios boolean,
    can_download boolean,
    firm_status firm_status
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT m.organization_id, m.role, m.can_edit_house_portfolios, m.can_download, o.status
  FROM member m
  JOIN organization o ON o.id = m.organization_id
  WHERE m.user_id = p_user_id
$$;

-- Let the app role execute it; revoke from PUBLIC for tightness.
REVOKE ALL ON FUNCTION app_user_memberships(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_user_memberships(text) TO app_user;