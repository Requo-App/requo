const dbConnectTimeoutSeconds = 15;
const supabasePoolerHostFragment = "pooler.supabase.com";
const supabasePoolerPort = "6543";

export function getDatabaseConnectionOptions(databaseUrl: string) {
  const isSupabasePooler = isSupabasePoolerDatabaseUrl(databaseUrl);

  return {
    connect_timeout: dbConnectTimeoutSeconds,
    prepare: false,
    max: isSupabasePooler ? 5 : 10,
    // Pin the session timezone to UTC so `current_date` in SQL agrees with
    // the application's `getTodayUtcDateString()`. Without it the two clocks
    // can disagree by a day around midnight, and the derived quote status
    // would not match the stored one.
    connection: { TimeZone: "UTC" },
    ...(isSupabasePooler ? { idle_timeout: 20 } : {}),
  };
}

export function isSupabasePoolerDatabaseUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);

    return (
      url.hostname.includes(supabasePoolerHostFragment) ||
      url.port === supabasePoolerPort
    );
  } catch {
    return false;
  }
}
