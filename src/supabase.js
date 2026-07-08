import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://eatpsykqvqtncdrvsqnc.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhdHBzeWtxdnF0bmNkcnZzcW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODUyMjcsImV4cCI6MjA5NjA2MTIyN30.yPSh-WK_wf0dRKv5e-3qdd3xx4htrzIzdvV1jbVtT84'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
