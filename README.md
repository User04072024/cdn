# Deploy ke Vercel + MongoDB Atlas

## 1. Setup MongoDB Atlas
1. Buat cluster gratis di https://cloud.mongodb.com (kalau belum punya).
2. Database Access → buat user + password.
3. Network Access → tambah IP `0.0.0.0/0` (allow from anywhere), karena IP Vercel dinamis.
4. Connect → Drivers → copy connection string, bentuknya:
   `mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/cdn?retryWrites=true&w=majority`
   (pastikan ada nama database, mis. `/cdn`, sebelum tanda `?`)

## 2. Set environment variable di Vercel
Di dashboard project Vercel → Settings → Environment Variables, tambahkan:
- `MONGODB_URI` = connection string dari langkah di atas

## 3. Deploy
```bash
npm i -g vercel
vercel
```
atau langsung import repo ini dari GitHub lewat dashboard Vercel — vercel.json
sudah ngatur build & routing-nya (termasuk static assets di /assets).

## Kenapa link file gak akan expired?
File disimpan permanen di MongoDB Atlas lewat GridFS (bukan lagi di disk
lokal `./file` + `db/db.json` yang hilang tiap deploy/restart di Vercel).
Selama dokumennya gak dihapus manual dari database, link `/nama-file.ext`
akan terus bisa diakses.

## Batas ukuran file
Vercel Serverless Function punya limit KERAS 4.5MB per request body (gak
bisa diubah dari config). Default di project ini di-set 4MB lewat env
`MAX_FILE_SIZE`. Kalau butuh upload file lebih besar, opsinya:
- Pakai Vercel Blob / S3 presigned URL (upload langsung dari browser ke
  storage, gak lewat function ini), atau
- Deploy ke VPS/server sendiri (bukan Vercel) — di situ `MAX_FILE_SIZE`
  boleh dinaikkan bebas.

## Testing lokal
```bash
cp .env.example .env   # isi MONGODB_URI
npm install
npm start
```
Buka http://localhost:7001
