import { createCoachHandler } from './handler.ts';

function publicApiKey() {
  try {
    const named = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    if (typeof named.default === 'string' && named.default) return named.default;
  } catch {
    // Older environments use a single key.
  }
  return Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
}

Deno.serve(createCoachHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  anonKey: publicApiKey(),
  openAiKey: Deno.env.get('OPENAI_API_KEY'),
  model: Deno.env.get('FITNESS_COACH_MODEL')?.trim() || 'gpt-4.1-mini',
}));
