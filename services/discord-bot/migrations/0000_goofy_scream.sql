CREATE TABLE "bot_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"bot_name" text DEFAULT 'Ticket Bot',
	"bot_prefix" text DEFAULT '!',
	"welcome_message" text DEFAULT 'Thank you for creating a ticket. Our support team will assist you shortly.',
	"notifications_enabled" boolean DEFAULT true,
	"admin_role_id" text,
	"support_role_id" text,
	"auto_close_enabled" boolean DEFAULT false,
	"auto_close_hours" text DEFAULT '48',
	"debug_mode" boolean DEFAULT false,
	"log_channel_id" text,
	"ticket_channel_id" text,
	"dashboard_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "bot_settings_server_id_unique" UNIQUE("server_id")
);
--> statement-breakpoint
CREATE TABLE "discord_users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"discriminator" text NOT NULL,
	"avatar" text,
	"is_admin" boolean DEFAULT false,
	"server_id" text,
	"onboarding_completed" boolean DEFAULT false,
	"first_login_at" timestamp DEFAULT now(),
	"last_seen_at" timestamp DEFAULT now(),
	"admin_guilds" text,
	"connected_servers" text
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"owner_id" text,
	"admin_role_id" text,
	"support_role_id" text,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "ticket_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#5865F2' NOT NULL,
	"server_id" text
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"sender_id" text NOT NULL,
	"content" text NOT NULL,
	"sender_username" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ticket_panel_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"ticket_category_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"emoji" text DEFAULT '🎫' NOT NULL,
	"button_style" text DEFAULT 'Primary' NOT NULL,
	"is_enabled" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"custom_id" text NOT NULL,
	"requires_role" text,
	"welcome_message" text,
	"assign_to_role" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ticket_panel_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"title" text DEFAULT '🎫 Support Ticket System' NOT NULL,
	"description" text DEFAULT '**Welcome to our support ticket system!**

Click one of the buttons below to create a new support ticket. Our team will respond as quickly as possible.

*Please provide as much detail as possible when creating your ticket to help us assist you better.*' NOT NULL,
	"embed_color" text DEFAULT '#5865F2' NOT NULL,
	"footer_text" text DEFAULT 'Click a button below to get started • Support Team' NOT NULL,
	"show_timestamp" boolean DEFAULT true,
	"thumbnail_url" text,
	"author_name" text,
	"author_icon_url" text,
	"buttons_per_row" integer DEFAULT 2,
	"show_categories_in_description" boolean DEFAULT true,
	"max_categories" integer DEFAULT 25,
	"is_enabled" boolean DEFAULT true,
	"require_reason" boolean DEFAULT true,
	"cooldown_minutes" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ticket_panel_settings_server_id_unique" UNIQUE("server_id")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal',
	"category_id" integer,
	"creator_id" text NOT NULL,
	"assignee_id" text,
	"server_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "ticket_panel_categories" ADD CONSTRAINT "ticket_panel_categories_ticket_category_id_ticket_categories_id_fk" FOREIGN KEY ("ticket_category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE no action ON UPDATE no action;