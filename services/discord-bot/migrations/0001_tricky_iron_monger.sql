CREATE TABLE "music_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"voice_channel_id" text,
	"voice_channel_name" text,
	"text_channel_id" text,
	"is_playing" boolean DEFAULT false,
	"is_paused" boolean DEFAULT false,
	"volume" integer DEFAULT 50,
	"current_track" text,
	"track_position" integer DEFAULT 0,
	"queue" text,
	"queue_position" integer DEFAULT 0,
	"repeat_mode" text DEFAULT 'off',
	"shuffle_enabled" boolean DEFAULT false,
	"last_activity" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "music_sessions_server_id_unique" UNIQUE("server_id")
);
--> statement-breakpoint
CREATE TABLE "panel_template_buttons" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"custom_id" text NOT NULL,
	"label" text NOT NULL,
	"emoji" text,
	"button_style" text DEFAULT 'Primary' NOT NULL,
	"url" text,
	"action_type" text DEFAULT 'custom' NOT NULL,
	"action_data" text,
	"row" integer DEFAULT 1,
	"position" integer DEFAULT 0,
	"is_enabled" boolean DEFAULT true,
	"requires_role" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "panel_template_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"inline" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"is_enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "panel_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'custom' NOT NULL,
	"embed_title" text,
	"embed_description" text,
	"embed_color" text DEFAULT '#5865F2',
	"embed_url" text,
	"author_name" text,
	"author_icon_url" text,
	"author_url" text,
	"thumbnail_url" text,
	"image_url" text,
	"footer_text" text,
	"footer_icon_url" text,
	"show_timestamp" boolean DEFAULT false,
	"is_enabled" boolean DEFAULT true,
	"is_ticket_panel" boolean DEFAULT false,
	"last_used" timestamp,
	"use_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"playlist_id" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"duration" integer DEFAULT 0,
	"thumbnail_url" text,
	"platform" text DEFAULT 'youtube',
	"video_id" text,
	"added_by" text NOT NULL,
	"added_by_username" text,
	"position" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"thumbnail_url" text,
	"created_by" text NOT NULL,
	"created_by_username" text,
	"is_public" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"song_count" integer DEFAULT 0,
	"total_duration" integer DEFAULT 0,
	"play_count" integer DEFAULT 0,
	"last_played" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "server_role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"role_id" text NOT NULL,
	"role_name" text NOT NULL,
	"can_view_tickets" boolean DEFAULT true,
	"can_manage_tickets" boolean DEFAULT true,
	"can_delete_tickets" boolean DEFAULT false,
	"can_manage_settings" boolean DEFAULT false,
	"can_use_music_bot" boolean DEFAULT true,
	"can_manage_playlists" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ticket_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"action" text NOT NULL,
	"performed_by" text NOT NULL,
	"performed_by_username" text,
	"details" text,
	"created_at" timestamp DEFAULT now(),
	"server_id" text
);
--> statement-breakpoint
CREATE TABLE "ticket_resolutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"resolution_type" text NOT NULL,
	"resolution_notes" text,
	"action_taken" text,
	"resolved_by" text NOT NULL,
	"resolved_by_username" text,
	"resolved_at" timestamp DEFAULT now(),
	"server_id" text
);
--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "default_priority" text DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "admin_channel_id" text;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "public_log_channel_id" text;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "admin_notifications_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "send_copy_to_admin_channel" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "music_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "music_channel_id" text;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "default_volume" integer DEFAULT 50;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "max_queue_size" integer DEFAULT 50;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "allow_non_admin_play" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "ticket_categories" ADD COLUMN "emoji" text DEFAULT '🎫';--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "mediation_actions" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "user_actions" text;--> statement-breakpoint
ALTER TABLE "panel_template_buttons" ADD CONSTRAINT "panel_template_buttons_template_id_panel_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."panel_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_template_fields" ADD CONSTRAINT "panel_template_fields_template_id_panel_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."panel_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;