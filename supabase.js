const { createClient } = require("@supabase/supabase-js");
require("dotenv").config(); // If using dotenv

const supabaseUrl = "https://aaidndkmqlionnwyzhgd.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhaWRuZGttcWxpb25ud3l6aGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMDgxNzksImV4cCI6MjA2ODc4NDE3OX0.-cDX4BPxLOq2g2-ejxX1kRMxkU-ACQdDjIaj9y-YANY";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

module.exports = supabase;
