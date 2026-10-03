# PDF View for Visual Studio Code

<p align="center">
  <img src="https://github.com/DwiDevelopes/pos-file-view/blob/main/icon.png?raw=true" width="128" height="128" alt="PDF View Logo">
</p>

**PDF View** adalah ekstensi Visual Studio Code modern dan sangat ringan dengan antarmuka bergaya Google Drive / Chrome PDF Viewer. Memungkinkan Anda membuka, mencari, mencetak, memilih teks, dan mengonversi file PDF ke Microsoft Word (.docx) langsung di dalam editor tanpa lag dan tanpa aplikasi pihak ketiga.

---

## ✨ Fitur Utama

- ⚡ **Sangat Ringan & Cepat (Google UI Style)**: Menggunakan teknik *Virtual / Lazy Rendering* berbasis `IntersectionObserver`. Dokumen dengan ratusan halaman dapat terbuka instan dalam hitungan milidetik tanpa membebani memori.
- 🔍 **Pencarian Kata Real-time (Ctrl + F)**:
  - Kotak pencarian melayang (*floating search bar*) dengan hotkey `Ctrl+F` atau `Cmd+F`.
  - Penandaan kata (*glowing highlight*) berwarna kuning & oranye untuk hasil aktif.
  - Tombol navigasi pencocokan sebelumnya (`Shift+Enter`) dan berikutnya (`Enter`).
  - Indikator jumlah pencocokan (*match count badge*, misal `3 / 15`).
- 📝 **Konversi ke Microsoft Word (.docx) Bersih & Cepat**:
  - Menghasilkan format dokumen Office Open XML (.docx) asli berstandar Microsoft.
  - Tidak menimbulkan pesan rusak/recovery saat dibuka di Microsoft Word, Google Docs, maupun WPS.
  - Rekonstruksi paragraf terstruktur dan pemisah halaman (*page break*) rapi.
  - Indikator progres realtime interaktif.
  - Tombol langsung untuk membuka file di MS Word atau membuka foldernya.
- 🖨️ **Cetak Dokumen (Ctrl + P)**:
  - Dukungan `@media print` lengkap: mencetak dokumen dengan latar putih bersih beresolusi tinggi tanpa toolbar atau sidebar.
  - Opsi membuka di pembaca PDF sistem / browser default untuk cetak native cepat.
- 📋 **Seleksi & Salin Teks (Text Selection)**:
  - Dilengkapi lapisan teks (*Text Layer*) sehingga Anda dapat menyorot (*highlight*) dan menyalin teks (`Ctrl+C`) langsung menggunakan kursor mouse.
- 🔍 **Alat Zoom & Tata Letak Lengkap**:
  - *Zoom In* (+) dan *Zoom Out* (-)
  - Dropdown persentase zoom (50%, 75%, 100%, 120%, 150%, 200%)
  - *Fit to Width* (Sesuaikan lebar layar)
  - *Fit to Page* (Sesuaikan tinggi halaman)
- 📖 **Navigasi Halaman & Panel Thumbnail**:
  - Bilah samping (*sidebar drawer*) berisi thumbnail pratinjau tiap halaman.
  - Input nomor halaman langsung untuk melompat ke halaman tujuan.
  - Deteksi halaman aktif otomatis saat menggulir (*auto-scroll sync*).
- 🔄 **Rotasi Dokumen**: Putar halaman searah jarum jam (90°) atau berlawanan jarum jam (270°).
- ⛶ **Mode Layar Penuh (Fullscreen)**: Tampilan presentasi tanpa gangguan.
- 💾 **Memori Status (Retain Context)**: Posisi scroll dan tingkat zoom tetap tersimpan saat Anda berpindah tab di VS Code.

---

## 🛠️ Cara Penggunaan

1. Buka folder kerja Anda di Visual Studio Code.
2. Klik file berekstensi `.pdf` pada **File Explorer**.
3. Dokumen PDF akan langsung terbuka dengan tampilan Google PDF Viewer.
4. Gunakan:
   - **`Ctrl + F`**: Mencari kata
   - **`Ctrl + P`**: Mencetak dokumen
   - **`+` / `-`**: Memperbesar / memperkecil tampilan
   - **Convert to Word**: Mengonversi ke file Word `.docx`

> **Tips:** Jika file PDF tidak langsung terbuka dengan ekstensi ini, klik kanan pada file `.pdf` $\rightarrow$ pilih **Open With...** $\rightarrow$ pilih **PDF Preview**.

---

## 📂 Struktur Proyek

```text
pdf-view/
├── icon/
│   └── icon.png          # Ikon ekstensi
├── src/
│   └── extension.ts      # Kode sumber TypeScript
├── dist/
│   └── extension.js      # Bundel JavaScript terkompilasi
├── package.json          # Konfigurasi manifest ekstensi
└── README.md             # Dokumentasi ekstensi
```
