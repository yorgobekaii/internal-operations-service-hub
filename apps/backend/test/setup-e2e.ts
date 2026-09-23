// Jest setupFiles entry: runs before the test framework loads any test file.
// Forces the isolated SQLite database so e2e can never touch prisma/dev.db.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'file:./test.db';
