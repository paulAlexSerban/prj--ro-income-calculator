export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://app_user:app_password@localhost:5432/offercompare",
  databaseUrlAdmin:
    process.env.DATABASE_URL_ADMIN ?? "postgres://postgres:postgres@localhost:5432/offercompare",
  appDbUser: process.env.APP_DB_USER ?? "app_user",
  appDbPassword: process.env.APP_DB_PASSWORD ?? "app_password",
  postgresDb: process.env.POSTGRES_DB ?? "offercompare",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
  jwtRefreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
  allowRegistration: (process.env.ALLOW_REGISTRATION ?? "true") !== "false",
  port: Number(process.env.PORT ?? 3000),
};
