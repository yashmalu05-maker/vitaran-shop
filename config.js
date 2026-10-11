// Vitaran Saathi.
// Cloud customers: one online database for every firm (Supabase project "vitaran-saathi", Mumbai). The tables
// are closed; the apps only call functions that check the company login and touch that company's data alone.
// Private customers: their data is in their own database. This phone remembers it after the company code is
// entered once; the licence (trial, plan, logins) is still checked with the Vitaran database.
(function () {
  var URL = "https://exziomeweckncvqigpnl.supabase.co";
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4emlvbWV3ZWNrbmN2cWlncG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5ODA1MTQsImV4cCI6MjEwNjU1NjUxNH0.zUS18xK8SBR16HDPqs6y_mCU4olmSXvWFDIMIS4rKhg";
  var role = new URLSearchParams(location.search).get("app") || window.APP_ROLE || "boss";
  var p = null;
  try { p = JSON.parse(localStorage.getItem("vs-private-" + role)); } catch (e) {}
  window.GSM_CONFIG = p && p.url && p.key
    ? { PRIVATE: p, SUPABASE_URL: p.url, SUPABASE_ANON_KEY: p.key, LIC_URL: URL, LIC_KEY: KEY }
    : { CLOUD: true, SUPABASE_URL: URL, SUPABASE_ANON_KEY: KEY, LIC_URL: URL, LIC_KEY: KEY };
  window.BRAND = { product: "Vitaran Saathi", short: "Vitaran", accent: "indigo", trialDays: 7 };
})();
