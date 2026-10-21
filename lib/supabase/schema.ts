// PostgREST schema the app queries. Defaults to `public`; set
// NEXT_PUBLIC_SUPABASE_DB_SCHEMA=lms when the LMS lives in its own schema
// on a shared Supabase project (e.g. SayThanks staging).
export const DB_SCHEMA = (process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA || 'public') as 'public'
