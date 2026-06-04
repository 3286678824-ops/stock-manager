// Supabase client singleton — loaded from CDN

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// The Supabase JS client is loaded via CDN <script> tag before modules.
// It exposes window.supabase.createClient
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;
