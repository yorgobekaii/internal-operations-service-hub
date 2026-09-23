// Jest setupFiles entry: runs before the test framework loads any test file.
// Forces the isolated SQLite database so e2e can never touch prisma/dev.db.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'file:./test.db';
// Pin the deterministic mock AI provider so a shell-exported AI_PROVIDER=groq
// (used for live UI testing) can never flip e2e to the real Groq API.
process.env.AI_PROVIDER = 'mock';
