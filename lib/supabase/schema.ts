// PostgREST schema the app queries. A shared SayThanks project uses `lms`;
// standalone installations keep the default `public` schema.
const configuredSchema = process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA?.trim() || 'public'

if (configuredSchema !== 'public' && configuredSchema !== 'lms') {
  throw new Error('NEXT_PUBLIC_SUPABASE_DB_SCHEMA must be public or lms')
}

// The existing SDK clients and generated database types describe the public
// table shape; lms is its deployment namespace. Keep that static SDK contract
// until types are generated for both schemas. This assertion does not convert
// the runtime value: Supabase still sends the validated `lms` profile on the wire.
export const DB_SCHEMA = configuredSchema as 'public'
