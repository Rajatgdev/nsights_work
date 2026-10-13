CREATE TYPE "public"."asset_class" AS ENUM('Equity', 'Multi-Asset', 'Bond', 'Property', 'Cash');--> statement-breakpoint
CREATE TYPE "public"."compare_mode" AS ENUM('common', 'own');--> statement-breakpoint
CREATE TYPE "public"."data_upload_status" AS ENUM('pending', 'validating', 'failed', 'draft', 'published', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."data_version_status" AS ENUM('draft', 'live', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('pptx', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('queued', 'running', 'ready', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."firm_role" AS ENUM('firm_admin', 'adviser', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."firm_status" AS ENUM('onboarding', 'trial', 'active', 'past_due', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."holding_role" AS ENUM('core', 'satellite');--> statement-breakpoint
CREATE TYPE "public"."portfolio_approach" AS ENUM('core-satellite', 'equal-weighted', 'multi-manager', 'multi-strategy');--> statement-breakpoint
CREATE TYPE "public"."portfolio_kind" AS ENUM('house', 'personal');--> statement-breakpoint
CREATE TYPE "public"."presentation_status" AS ENUM('draft', 'final');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_kind" AS ENUM('erase', 'export');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_status" AS ENUM('open', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."rebalancing" AS ENUM('monthly', 'buy-and-hold');--> statement-breakpoint
CREATE TYPE "public"."slide_kind" AS ENUM('cover', 'chart', 'summary', 'portfolio', 'team', 'philosophy', 'strategy', 'disclaimer');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "firm_role" DEFAULT 'adviser' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "firm_role" DEFAULT 'adviser' NOT NULL,
	"can_edit_house_portfolios" boolean DEFAULT false NOT NULL,
	"can_download" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_org_user_uq" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"seat_limit" integer DEFAULT 5 NOT NULL,
	"status" "firm_status" DEFAULT 'onboarding' NOT NULL,
	"stripe_customer_id" text,
	"trial_ends_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"delete_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text,
	"backup_codes" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firm_profile" (
	"firm_id" uuid PRIMARY KEY NOT NULL,
	"philosophy" text,
	"strategy" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firm_settings" (
	"firm_id" uuid PRIMARY KEY NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"tagline" text,
	"logo_s3_key" text,
	"accent_hex" text DEFAULT '#16a394',
	"template_id" text DEFAULT 'boardroom',
	"palette_id" text DEFAULT 'default',
	"disclaimer_text" text,
	"show_slide_numbers" boolean DEFAULT true NOT NULL,
	"price_date_means" text DEFAULT 'month_end',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firm_id" uuid NOT NULL,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"status" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"seats_billed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "subscription_firm_id_unique" UNIQUE("firm_id")
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firm_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"bio" text,
	"photo_s3_key" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms_acceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"terms_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "data_upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text NOT NULL,
	"s3_key" text NOT NULL,
	"filename" text NOT NULL,
	"status" "data_upload_status" DEFAULT 'pending' NOT NULL,
	"report" jsonb,
	"created_version_id" uuid
);
--> statement-breakpoint
CREATE TABLE "data_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_month" date NOT NULL,
	"status" "data_version_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"source_upload_id" uuid,
	"parent_version_id" uuid
);
--> statement-breakpoint
CREATE TABLE "forbidden_term" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"term" text NOT NULL,
	CONSTRAINT "forbidden_term_term_unique" UNIQUE("term")
);
--> statement-breakpoint
CREATE TABLE "fund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_id" uuid NOT NULL,
	"external_code" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"category" text,
	"launch_date" date,
	"closed_at" date,
	"is_estimated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "fund_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "fund_fact_version" (
	"version_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"risk_rating" smallint,
	"ongoing_charge_pct" numeric(8, 4),
	"amc_pct" numeric(8, 4),
	"manager" text,
	"style" text,
	"region" text,
	"risk_controlled" boolean,
	"sfdr_article" smallint,
	"description" text,
	CONSTRAINT "fund_fact_version_version_id_fund_id_pk" PRIMARY KEY("version_id","fund_id")
);
--> statement-breakpoint
CREATE TABLE "fund_metric" (
	"version_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"metrics" jsonb NOT NULL,
	CONSTRAINT "fund_metric_version_id_fund_id_pk" PRIMARY KEY("version_id","fund_id")
);
--> statement-breakpoint
CREATE TABLE "fund_price" (
	"version_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"price_date" date NOT NULL,
	"price" numeric(18, 6) NOT NULL,
	CONSTRAINT "fund_price_version_id_fund_id_price_date_pk" PRIMARY KEY("version_id","fund_id","price_date")
);
--> statement-breakpoint
CREATE TABLE "platform_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"live_version_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"colour_hex" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "provider_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "stress_event" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firm_id" uuid,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"meta" jsonb,
	"ip" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"format" "export_format" NOT NULL,
	"status" "export_status" DEFAULT 'queued' NOT NULL,
	"s3_key" text,
	"data_version_id" uuid NOT NULL,
	"checksum" text,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portfolio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firm_id" uuid NOT NULL,
	"owner_user_id" text,
	"kind" "portfolio_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"approach" "portfolio_approach",
	"rebalancing" "rebalancing" DEFAULT 'monthly' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_holding" (
	"portfolio_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"weight_bp" integer NOT NULL,
	"role" "holding_role",
	CONSTRAINT "portfolio_holding_portfolio_id_fund_id_pk" PRIMARY KEY("portfolio_id","fund_id")
);
--> statement-breakpoint
CREATE TABLE "presentation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firm_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"client_name" text,
	"adviser_name" text,
	"data_version_id" uuid NOT NULL,
	"template_id" text DEFAULT 'boardroom' NOT NULL,
	"palette_id" text DEFAULT 'default' NOT NULL,
	"compare_mode" "compare_mode" DEFAULT 'common' NOT NULL,
	"status" "presentation_status" DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firm_id" uuid NOT NULL,
	"subject_email" text NOT NULL,
	"kind" "privacy_request_kind" NOT NULL,
	"status" "privacy_request_status" DEFAULT 'open' NOT NULL,
	"handled_by" text,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "slide" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "slide_kind" NOT NULL,
	"chart_key" text,
	"fund_ids" uuid[],
	"portfolio_id" uuid,
	"options" jsonb,
	"commentary_enabled" boolean DEFAULT true NOT NULL,
	"commentary_text" text,
	"commentary_edited" boolean DEFAULT false NOT NULL,
	"commentary_generated" text,
	"commentary_model" text
);
--> statement-breakpoint
CREATE TABLE "support_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firm_id" uuid NOT NULL,
	"granted_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_profile" ADD CONSTRAINT "firm_profile_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_settings" ADD CONSTRAINT "firm_settings_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptance" ADD CONSTRAINT "terms_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_upload" ADD CONSTRAINT "data_upload_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_version" ADD CONSTRAINT "data_version_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund" ADD CONSTRAINT "fund_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_fact_version" ADD CONSTRAINT "fund_fact_version_version_id_data_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."data_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_fact_version" ADD CONSTRAINT "fund_fact_version_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_metric" ADD CONSTRAINT "fund_metric_version_id_data_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."data_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_metric" ADD CONSTRAINT "fund_metric_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_price" ADD CONSTRAINT "fund_price_version_id_data_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."data_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_price" ADD CONSTRAINT "fund_price_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_state" ADD CONSTRAINT "platform_state_live_version_id_data_version_id_fk" FOREIGN KEY ("live_version_id") REFERENCES "public"."data_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export" ADD CONSTRAINT "export_presentation_id_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export" ADD CONSTRAINT "export_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export" ADD CONSTRAINT "export_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export" ADD CONSTRAINT "export_data_version_id_data_version_id_fk" FOREIGN KEY ("data_version_id") REFERENCES "public"."data_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio" ADD CONSTRAINT "portfolio_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio" ADD CONSTRAINT "portfolio_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_holding" ADD CONSTRAINT "portfolio_holding_portfolio_id_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_holding" ADD CONSTRAINT "portfolio_holding_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_holding" ADD CONSTRAINT "portfolio_holding_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation" ADD CONSTRAINT "presentation_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation" ADD CONSTRAINT "presentation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation" ADD CONSTRAINT "presentation_data_version_id_data_version_id_fk" FOREIGN KEY ("data_version_id") REFERENCES "public"."data_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_request" ADD CONSTRAINT "privacy_request_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_request" ADD CONSTRAINT "privacy_request_handled_by_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide" ADD CONSTRAINT "slide_presentation_id_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide" ADD CONSTRAINT "slide_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide" ADD CONSTRAINT "slide_portfolio_id_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_grant" ADD CONSTRAINT "support_grant_firm_id_organization_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_grant" ADD CONSTRAINT "support_grant_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;