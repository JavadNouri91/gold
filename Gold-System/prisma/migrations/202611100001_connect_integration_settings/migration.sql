CREATE TABLE "connect_integration_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "http_base_url" TEXT NOT NULL DEFAULT 'https://connect.tala-app.ir',
    "websocket_url" TEXT NOT NULL DEFAULT 'wss://connect.tala-app.ir/ws',
    "access_key_encrypted" TEXT,
    "access_secret_encrypted" TEXT,
    "webhook_secret_encrypted" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "price_sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "external_buy_enabled" BOOLEAN NOT NULL DEFAULT false,
    "external_sell_enabled" BOOLEAN NOT NULL DEFAULT false,
    "external_execution_feature_gate" BOOLEAN NOT NULL DEFAULT false,
    "last_http_check_at" TIMESTAMP(3),
    "last_http_check_status" TEXT,
    "last_websocket_check_at" TIMESTAMP(3),
    "last_websocket_check_status" TEXT,
    "last_connection_error_code" TEXT,
    "last_successful_check_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connect_integration_settings_pkey" PRIMARY KEY ("id")
);
