import { createClient } from '@supabase/supabase-js'

// Service role client — backend only. Never expose to frontend.
export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
