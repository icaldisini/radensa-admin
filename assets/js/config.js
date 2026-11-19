window.R = window.R || {};

// Kunci publik (publishable/anon). Aman berada di frontend: RLS Supabase
// hanya membuka SELECT untuk tabel surveilans. JANGAN taruh service_role di sini.
R.config = {
  supabaseUrl: 'https://tawdmkdkrswlbiylgdxu.supabase.co',
  anonKey: 'sb_publishable_Syyaa8VK74hH09p73Ach2A_-RHKo39U',
  // Ganti dengan URL hosting Radensa Warga setelah deploy.
  wargaUrl: '../Radensa_Warga/index.html',
};
