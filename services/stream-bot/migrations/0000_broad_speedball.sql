CREATE TABLE "active_trivia_questions" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "player" text NOT NULL,
        "platform" text NOT NULL,
        "question" text NOT NULL,
        "correct_answer" text NOT NULL,
        "difficulty" text NOT NULL,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_history" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "alert_type" text NOT NULL,
        "username" text,
        "message" text NOT NULL,
        "platform" text NOT NULL,
        "metadata" jsonb,
        "timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_settings" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "enable_follower_alerts" boolean DEFAULT true NOT NULL,
        "enable_sub_alerts" boolean DEFAULT true NOT NULL,
        "enable_raid_alerts" boolean DEFAULT true NOT NULL,
        "enable_milestone_alerts" boolean DEFAULT true NOT NULL,
        "follower_template" text DEFAULT 'Thanks for the follow, {user}! Welcome to the community!' NOT NULL,
        "sub_template" text DEFAULT 'Thanks for subscribing, {user}! {tier} sub for {months} months!' NOT NULL,
        "raid_template" text DEFAULT 'Thanks for the raid, {raider}! {viewers} viewers joining the party!' NOT NULL,
        "milestone_thresholds" integer[] DEFAULT ARRAY[50, 100, 500, 1000, 5000, 10000]::integer[] NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "alert_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "date" timestamp NOT NULL,
        "followers" integer DEFAULT 0 NOT NULL,
        "subscribers" integer DEFAULT 0 NOT NULL,
        "avg_viewers" integer DEFAULT 0 NOT NULL,
        "total_streams" integer DEFAULT 0 NOT NULL,
        "total_hours" integer DEFAULT 0 NOT NULL,
        "revenue" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_configs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "interval_mode" text DEFAULT 'manual' NOT NULL,
        "fixed_interval_minutes" integer,
        "random_min_minutes" integer,
        "random_max_minutes" integer,
        "ai_model" text DEFAULT 'gpt-4o' NOT NULL,
        "ai_prompt_template" text,
        "ai_temperature" integer DEFAULT 1,
        "enable_chat_triggers" boolean DEFAULT true NOT NULL,
        "chat_keywords" text[] DEFAULT ARRAY['!snapple', '!fact']::text[] NOT NULL,
        "active_platforms" text[] DEFAULT ARRAY[]::text[] NOT NULL,
        "is_active" boolean DEFAULT false NOT NULL,
        "last_fact_posted_at" timestamp,
        "auto_shoutout_on_raid" boolean DEFAULT false NOT NULL,
        "auto_shoutout_on_host" boolean DEFAULT false NOT NULL,
        "shoutout_message_template" text DEFAULT 'Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}',
        "banned_words" text[] DEFAULT ARRAY[]::text[] NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "bot_configs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "bot_instances" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "status" text DEFAULT 'stopped' NOT NULL,
        "last_heartbeat" timestamp,
        "error_message" text,
        "started_at" timestamp,
        "stopped_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "bot_instances_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_activity" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "session_id" varchar NOT NULL,
        "username" text NOT NULL,
        "message_count" integer DEFAULT 1 NOT NULL,
        "first_seen" timestamp DEFAULT now() NOT NULL,
        "last_seen" timestamp DEFAULT now() NOT NULL,
        "timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot_context" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "bot_user_id" varchar NOT NULL,
        "username" text NOT NULL,
        "platform" text NOT NULL,
        "recent_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "conversation_summary" text,
        "message_count" integer DEFAULT 0 NOT NULL,
        "last_seen" timestamp DEFAULT now() NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot_personalities" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "name" text NOT NULL,
        "system_prompt" text NOT NULL,
        "temperature" integer DEFAULT 10 NOT NULL,
        "traits" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "is_preset" boolean DEFAULT false NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "usage_count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot_responses" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "username" text NOT NULL,
        "platform" text NOT NULL,
        "message" text NOT NULL,
        "response" text NOT NULL,
        "personality" text NOT NULL,
        "was_helpful" boolean,
        "engagement_score" integer DEFAULT 0 NOT NULL,
        "metadata" jsonb,
        "timestamp" timestamp DEFAULT now() NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot_settings" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "is_enabled" boolean DEFAULT false NOT NULL,
        "personality" text DEFAULT 'friendly' NOT NULL,
        "custom_personality_prompt" text,
        "temperature" integer DEFAULT 10 NOT NULL,
        "response_rate" integer DEFAULT 30 NOT NULL,
        "context_window" integer DEFAULT 10 NOT NULL,
        "learning_enabled" boolean DEFAULT true NOT NULL,
        "mention_trigger" text DEFAULT '@bot' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "chatbot_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "currency_rewards" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "bot_user_id" varchar NOT NULL,
        "reward_name" text NOT NULL,
        "cost" integer DEFAULT 100 NOT NULL,
        "command" text,
        "stock" integer,
        "max_redeems" integer,
        "reward_type" text NOT NULL,
        "reward_data" jsonb,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_settings" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "currency_name" text DEFAULT 'Points' NOT NULL,
        "currency_symbol" text DEFAULT '⭐' NOT NULL,
        "earn_per_message" integer DEFAULT 1 NOT NULL,
        "earn_per_minute" integer DEFAULT 10 NOT NULL,
        "starting_balance" integer DEFAULT 100 NOT NULL,
        "max_balance" integer DEFAULT 1000000 NOT NULL,
        "enable_gambling" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "currency_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "currency_transactions" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "balance_id" varchar NOT NULL,
        "username" text NOT NULL,
        "type" text NOT NULL,
        "amount" integer NOT NULL,
        "description" text NOT NULL,
        "timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_commands" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "name" text NOT NULL,
        "response" text NOT NULL,
        "cooldown" integer DEFAULT 0 NOT NULL,
        "permission" text DEFAULT 'everyone' NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "usage_count" integer DEFAULT 0 NOT NULL,
        "last_used_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_history" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "game_type" text NOT NULL,
        "player" text NOT NULL,
        "opponent" text,
        "outcome" text NOT NULL,
        "points_awarded" integer DEFAULT 0 NOT NULL,
        "details" jsonb,
        "platform" text NOT NULL,
        "timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_settings" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "enable_games" boolean DEFAULT true NOT NULL,
        "cooldown_minutes" integer DEFAULT 5 NOT NULL,
        "points_per_win" integer DEFAULT 10 NOT NULL,
        "enable_8ball" boolean DEFAULT true NOT NULL,
        "enable_trivia" boolean DEFAULT true NOT NULL,
        "enable_duel" boolean DEFAULT true NOT NULL,
        "enable_slots" boolean DEFAULT true NOT NULL,
        "enable_roulette" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "game_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "game_stats" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "username" text NOT NULL,
        "game_name" text NOT NULL,
        "platform" text NOT NULL,
        "wins" integer DEFAULT 0 NOT NULL,
        "losses" integer DEFAULT 0 NOT NULL,
        "neutral" integer DEFAULT 0 NOT NULL,
        "total_plays" integer DEFAULT 0 NOT NULL,
        "total_points_earned" integer DEFAULT 0 NOT NULL,
        "last_played" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "giveaway_entries" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "giveaway_id" varchar NOT NULL,
        "user_id" varchar NOT NULL,
        "username" text NOT NULL,
        "platform" text NOT NULL,
        "subscriber_status" boolean DEFAULT false NOT NULL,
        "entered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "giveaway_winners" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "giveaway_id" varchar NOT NULL,
        "username" text NOT NULL,
        "platform" text NOT NULL,
        "selected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "giveaways" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "title" text NOT NULL,
        "keyword" text NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "requires_subscription" boolean DEFAULT false NOT NULL,
        "max_winners" integer DEFAULT 1 NOT NULL,
        "started_at" timestamp DEFAULT now() NOT NULL,
        "ended_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_whitelist" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "domain" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_history" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "platform" text NOT NULL,
        "trigger_type" text NOT NULL,
        "trigger_user" text,
        "fact_content" text NOT NULL,
        "posted_at" timestamp DEFAULT now() NOT NULL,
        "status" text DEFAULT 'success' NOT NULL,
        "error_message" text
);
--> statement-breakpoint
CREATE TABLE "milestones" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "milestone_type" text NOT NULL,
        "threshold" integer NOT NULL,
        "achieved" boolean DEFAULT false NOT NULL,
        "achieved_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_logs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "platform" text NOT NULL,
        "username" text NOT NULL,
        "message" text NOT NULL,
        "rule_triggered" text NOT NULL,
        "action" text NOT NULL,
        "severity" text NOT NULL,
        "timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_rules" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "rule_type" text NOT NULL,
        "is_enabled" boolean DEFAULT true NOT NULL,
        "severity" text DEFAULT 'medium' NOT NULL,
        "action" text DEFAULT 'warn' NOT NULL,
        "custom_pattern" text,
        "timeout_duration" integer DEFAULT 60,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_connections" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "platform" text NOT NULL,
        "platform_user_id" text,
        "platform_username" text,
        "access_token" text,
        "refresh_token" text,
        "token_expires_at" timestamp,
        "channel_id" text,
        "is_connected" boolean DEFAULT false NOT NULL,
        "last_connected_at" timestamp,
        "connection_data" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "poll_id" varchar NOT NULL,
        "username" text NOT NULL,
        "platform" text NOT NULL,
        "option" text NOT NULL,
        "voted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polls" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "question" text NOT NULL,
        "options" text[] NOT NULL,
        "duration" integer NOT NULL,
        "platform" text NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "twitch_poll_id" text,
        "started_at" timestamp,
        "ended_at" timestamp,
        "total_votes" integer DEFAULT 0 NOT NULL,
        "winner" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prediction_bets" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "prediction_id" varchar NOT NULL,
        "username" text NOT NULL,
        "platform" text NOT NULL,
        "outcome" text NOT NULL,
        "points" integer NOT NULL,
        "payout" integer DEFAULT 0 NOT NULL,
        "placed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "title" text NOT NULL,
        "outcomes" text[] NOT NULL,
        "duration" integer NOT NULL,
        "platform" text NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "twitch_prediction_id" text,
        "started_at" timestamp,
        "locked_at" timestamp,
        "ended_at" timestamp,
        "total_points" integer DEFAULT 0 NOT NULL,
        "total_bets" integer DEFAULT 0 NOT NULL,
        "winning_outcome" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "reward_id" varchar NOT NULL,
        "bot_user_id" varchar NOT NULL,
        "username" text NOT NULL,
        "platform" text NOT NULL,
        "fulfilled" boolean DEFAULT false NOT NULL,
        "fulfilled_at" timestamp,
        "redeemed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentiment_analysis" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "date" timestamp NOT NULL,
        "positive_messages" integer DEFAULT 0 NOT NULL,
        "negative_messages" integer DEFAULT 0 NOT NULL,
        "neutral_messages" integer DEFAULT 0 NOT NULL,
        "sentiment_score" integer DEFAULT 0 NOT NULL,
        "top_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoutout_history" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "target_username" text NOT NULL,
        "platform" text NOT NULL,
        "shoutout_type" text NOT NULL,
        "message" text NOT NULL,
        "timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoutout_settings" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "enable_auto_shoutouts" boolean DEFAULT false NOT NULL,
        "shoutout_template" text DEFAULT 'Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}' NOT NULL,
        "enable_raid_shoutouts" boolean DEFAULT false NOT NULL,
        "enable_host_shoutouts" boolean DEFAULT false NOT NULL,
        "recent_follower_shoutouts" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "shoutout_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "shoutouts" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "target_username" text NOT NULL,
        "target_platform" text NOT NULL,
        "custom_message" text,
        "usage_count" integer DEFAULT 1 NOT NULL,
        "last_used_at" timestamp DEFAULT now() NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_queue" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "requested_by" text NOT NULL,
        "song_title" text NOT NULL,
        "artist" text NOT NULL,
        "url" text NOT NULL,
        "platform" text NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "album_image_url" text,
        "duration" integer,
        "position" integer NOT NULL,
        "requested_at" timestamp DEFAULT now() NOT NULL,
        "played_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_settings" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "enable_song_requests" boolean DEFAULT true NOT NULL,
        "max_queue_size" integer DEFAULT 20 NOT NULL,
        "max_songs_per_user" integer DEFAULT 3 NOT NULL,
        "allow_duplicates" boolean DEFAULT false NOT NULL,
        "profanity_filter" boolean DEFAULT true NOT NULL,
        "banned_songs" text[] DEFAULT ARRAY[]::text[] NOT NULL,
        "volume_limit" integer DEFAULT 100 NOT NULL,
        "allow_spotify" boolean DEFAULT true NOT NULL,
        "allow_youtube" boolean DEFAULT true NOT NULL,
        "moderator_only" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "song_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "stream_sessions" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "platform" text NOT NULL,
        "started_at" timestamp DEFAULT now() NOT NULL,
        "ended_at" timestamp,
        "peak_viewers" integer DEFAULT 0 NOT NULL,
        "total_messages" integer DEFAULT 0 NOT NULL,
        "unique_chatters" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_balances" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "bot_user_id" varchar NOT NULL,
        "username" text NOT NULL,
        "platform" text NOT NULL,
        "balance" integer DEFAULT 0 NOT NULL,
        "total_earned" integer DEFAULT 0 NOT NULL,
        "total_spent" integer DEFAULT 0 NOT NULL,
        "last_earned" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "email" text NOT NULL,
        "password_hash" text,
        "primary_platform" text,
        "role" text DEFAULT 'user' NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "onboarding_completed" boolean DEFAULT false NOT NULL,
        "onboarding_step" integer DEFAULT 0 NOT NULL,
        "dismissed_welcome" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "viewer_snapshots" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "session_id" varchar NOT NULL,
        "viewer_count" integer DEFAULT 0 NOT NULL,
        "timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_trivia_questions" ADD CONSTRAINT "active_trivia_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_configs" ADD CONSTRAINT "bot_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_instances" ADD CONSTRAINT "bot_instances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_activity" ADD CONSTRAINT "chat_activity_session_id_stream_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."stream_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_context" ADD CONSTRAINT "chatbot_context_bot_user_id_users_id_fk" FOREIGN KEY ("bot_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_personalities" ADD CONSTRAINT "chatbot_personalities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_responses" ADD CONSTRAINT "chatbot_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_settings" ADD CONSTRAINT "chatbot_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_rewards" ADD CONSTRAINT "currency_rewards_bot_user_id_users_id_fk" FOREIGN KEY ("bot_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_settings" ADD CONSTRAINT "currency_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_transactions" ADD CONSTRAINT "currency_transactions_balance_id_user_balances_id_fk" FOREIGN KEY ("balance_id") REFERENCES "public"."user_balances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_commands" ADD CONSTRAINT "custom_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_history" ADD CONSTRAINT "game_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_settings" ADD CONSTRAINT "game_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_stats" ADD CONSTRAINT "game_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "giveaway_entries" ADD CONSTRAINT "giveaway_entries_giveaway_id_giveaways_id_fk" FOREIGN KEY ("giveaway_id") REFERENCES "public"."giveaways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "giveaway_entries" ADD CONSTRAINT "giveaway_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "giveaway_winners" ADD CONSTRAINT "giveaway_winners_giveaway_id_giveaways_id_fk" FOREIGN KEY ("giveaway_id") REFERENCES "public"."giveaways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_whitelist" ADD CONSTRAINT "link_whitelist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_history" ADD CONSTRAINT "message_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_rules" ADD CONSTRAINT "moderation_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_bets" ADD CONSTRAINT "prediction_bets_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_reward_id_currency_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."currency_rewards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_bot_user_id_users_id_fk" FOREIGN KEY ("bot_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentiment_analysis" ADD CONSTRAINT "sentiment_analysis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoutout_history" ADD CONSTRAINT "shoutout_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoutout_settings" ADD CONSTRAINT "shoutout_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoutouts" ADD CONSTRAINT "shoutouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_queue" ADD CONSTRAINT "song_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_settings" ADD CONSTRAINT "song_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_balances" ADD CONSTRAINT "user_balances_bot_user_id_users_id_fk" FOREIGN KEY ("bot_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_snapshots" ADD CONSTRAINT "viewer_snapshots_session_id_stream_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."stream_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_snapshots_user_id_date_unique" ON "analytics_snapshots" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "chatbot_context_bot_user_id_username_platform_unique" ON "chatbot_context" USING btree ("bot_user_id","username","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "chatbot_personalities_user_id_name_unique" ON "chatbot_personalities" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "currency_rewards_bot_user_id_reward_name_unique" ON "currency_rewards" USING btree ("bot_user_id","reward_name");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_commands_user_id_name_unique" ON "custom_commands" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "game_stats_user_id_username_game_name_platform_unique" ON "game_stats" USING btree ("user_id","username","game_name","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "giveaway_entries_giveaway_id_username_platform_unique" ON "giveaway_entries" USING btree ("giveaway_id","username","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "link_whitelist_user_id_domain_unique" ON "link_whitelist" USING btree ("user_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "milestones_user_id_type_threshold_unique" ON "milestones" USING btree ("user_id","milestone_type","threshold");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_rules_user_id_rule_type_unique" ON "moderation_rules" USING btree ("user_id","rule_type");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_connections_user_id_platform_unique" ON "platform_connections" USING btree ("user_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "poll_votes_poll_id_username_platform_unique" ON "poll_votes" USING btree ("poll_id","username","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_bets_prediction_id_username_platform_unique" ON "prediction_bets" USING btree ("prediction_id","username","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "sentiment_analysis_user_id_date_unique" ON "sentiment_analysis" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "shoutouts_user_id_target_username_platform_unique" ON "shoutouts" USING btree ("user_id","target_username","target_platform");--> statement-breakpoint
CREATE UNIQUE INDEX "user_balances_bot_user_id_username_platform_unique" ON "user_balances" USING btree ("bot_user_id","username","platform");