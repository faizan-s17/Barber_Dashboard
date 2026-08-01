import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pisqnikabugmlzohibrz.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpc3FuaWthYnVnbWx6b2hpYnJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0ODYxMDEsImV4cCI6MjEwMTA2MjEwMX0.-p4AgGqXhmyQReWtkWtjKxziXNYK5je05Cn-ulpGdrc'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
