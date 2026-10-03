# Change Log

Semua perubahan penting pada proyek **PDF View** akan didokumentasikan di dalam file ini.

Format ini didasarkan pada [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), dan proyek ini mematuhi [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-02

### 🎉 Initial Release

Rilis perdana dari ekstensi **PDF View** untuk Visual Studio Code.

#### ✨ Ditambahkan (Added)
- **Custom Editor Provider**: Memungkinkan file `.pdf` terbuka secara otomatis di tab editor saat diklik di File Explorer.
- **Dukungan Native Viewer**:
  - Alat *Zoom* (*Zoom In*, *Zoom Out*, *Fit to Width*, *Fit to Page*).
  - Navigasi Halaman dan *Sidebar Thumbnail*.
  - Alat Rotasi Halaman (*Rotate*).
  - Fitur *Print* (Cetak) dan *Download* (Unduh) dokumen langsung dari Webview.
- **Retain Context**: Menyimpan status posisi membaca, rotasi, dan *zoom* saat pengguna berpindah tab di VS Code.
- **Brand & Assets**: Menambahkan ikon ekstensi resmi pada lokasi `icon/icon.png`.
- **Dokumentasi**: Menambahkan petunjuk penggunaan lengkap di `README.md`.