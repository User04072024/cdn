const express = require('express');
const fileUpload = require('express-fileupload');
const favicon = require('serve-favicon');
const axios = require('axios');
const path = require('path');
const cfonts = require('cfonts');
const { getBucket } = require('./lib/mongodb');

const app = express();
const PORT = process.env.PORT || 7001;

// Batas ukuran file. Kalau di-deploy ke Vercel, body request Serverless
// Function DIBATASI KERAS 4.5MB oleh infrastrukturnya (gak bisa diubah dari
// kode/config), jadi default di sini 4MB. Kalau host di server sendiri
// (VPS/PM2/dll), boleh dinaikkan lewat env MAX_FILE_SIZE (dalam bytes).
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE, 10) || 4 * 1024 * 1024;

app.use(
  fileUpload({
    createParentPath: true,
    useTempFiles: false, // simpan buffer di memory, JANGAN nulis ke disk (Vercel read-only)
    limits: { fileSize: MAX_FILE_SIZE },
    abortOnLimit: true,
  })
);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(favicon(path.join(__dirname, 'assets', 'img', 'favicon.ico')));

app.get('/', (req, res) => {
  res.render('home.ejs');
});

app.get('/docs', (req, res) => {
  res.render('docs.ejs');
});

// ---------- Helpers ----------

function generateRandomFileName(length) {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

function cleanFileName(originalName) {
  return originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '-');
}

function formatFileSize(size) {
  if (size > 1000000) return `${(size / 1000000).toFixed(2)} MB`;
  if (size > 1000) return `${(size / 1000).toFixed(2)} KB`;
  return `${size} Bytes`;
}

async function findFileDoc(bucket, filename) {
  const docs = await bucket.find({ filename }).toArray();
  return docs[0] || null;
}

async function uniqueName(bucket, base, ext) {
  let name = `${base}.${ext}`;
  let number = 0;
  while (await findFileDoc(bucket, name)) {
    number += 1;
    name = `${base}-${number}.${ext}`;
  }
  return name;
}

// Nyimpen buffer ke GridFS. Link yang dihasilkan TIDAK PERNAH EXPIRED —
// file cuma hilang kalau memang dihapus manual dari MongoDB.
function saveToGridFS(bucket, filename, buffer, contentType) {
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, { contentType });
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve(uploadStream));
    uploadStream.end(buffer);
  });
}

// ---------- Upload (form, dipakai halaman utama) ----------

app.post('/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).send('No file uploaded.');
    }
    const file = req.files.file;
    const fileExtension = file.name.split('.').pop();
    const base = generateRandomFileName(8);
    const type = file.mimetype;

    const bucket = await getBucket();
    const name = await uniqueName(bucket, base, fileExtension);

    await saveToGridFS(bucket, name, file.data, type);

    res.redirect('/data/' + name);
  } catch (err) {
    console.error(err);
    res.status(500).send('Terjadi kesalahan saat upload.');
  }
});

// ---------- Upload (API, JSON response) ----------

app.post('/api/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ status: false, message: 'No file uploaded.' });
    }
    const file = req.files.file;
    const fileExtension = file.name.split('.').pop();
    const base = cleanFileName(file.name);
    const type = file.mimetype;
    const size = file.size;

    const bucket = await getBucket();
    const name = await uniqueName(bucket, base, fileExtension);

    await saveToGridFS(bucket, name, file.data, type);

    res.status(200).json({
      creator: 'FuadXyro',
      status: true,
      message: 'File uploaded successfully',
      data: {
        url: `https://${req.get('host')}/${name}`,
        type,
        size: formatFileSize(size),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: 'Error uploading file.' });
  }
});

// ---------- Upload dari URL eksternal ----------

app.get('/api/upload/to', async (req, res) => {
  try {
    const { url, namefile } = req.query;
    if (!url) return res.status(400).json({ status: false, message: 'URL not provided.' });
    if (!namefile) return res.status(400).json({ status: false, message: 'Filename not provided.' });

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      maxContentLength: MAX_FILE_SIZE,
      maxBodyLength: MAX_FILE_SIZE,
    });

    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const fileExtension = contentType.split('/')[1] || 'bin';
    const base = cleanFileName(namefile);
    const buffer = Buffer.from(response.data);

    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({ status: false, message: 'Sorry, the downloaded file is too large.' });
    }

    const bucket = await getBucket();
    const name = await uniqueName(bucket, base, fileExtension);
    await saveToGridFS(bucket, name, buffer, contentType);

    res.status(200).json({
      creator: 'FuadXyro',
      status: true,
      message: 'File uploaded successfully',
      data: {
        url: `https://${req.get('host')}/${name}`,
        type: contentType,
        size: formatFileSize(buffer.length),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: 'Error downloading the file.' });
  }
});

// ---------- Halaman detail file ----------

app.get('/data/:filename', async (req, res) => {
  try {
    const bucket = await getBucket();
    const doc = await findFileDoc(bucket, req.params.filename);
    if (!doc) return res.redirect('/');

    res.render('data.ejs', {
      filename: doc.filename,
      type: doc.contentType,
      size: formatFileSize(doc.length),
      host: req.get('host'),
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// ---------- Serve file langsung dari GridFS ----------

app.get('/:filename', async (req, res, next) => {
  try {
    const bucket = await getBucket();
    const doc = await findFileDoc(bucket, req.params.filename);
    if (!doc) return next();

    res.set('Content-Type', doc.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    bucket.openDownloadStreamByName(req.params.filename).pipe(res);
  } catch (err) {
    console.error(err);
    next();
  }
});

app.use((req, res) => {
  res.status(404).render('404.ejs');
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.clear();
    cfonts.say('FuadXyro', {
      font: 'block',
      align: 'center',
      colors: ['blueBright', 'cyan'],
      background: 'transparent',
      letterSpacing: 1,
      lineHeight: 1.5,
      space: true,
      maxLength: '0',
      gradient: true,
      independentGradient: false,
      transitionGradient: false,
      env: 'node',
    });
    console.log('\x1b[36m%s\x1b[0m', 'Project by : FuadXyro');
    console.log('\x1b[33m%s\x1b[0m', 'CDN Deskripsi : Media Hosting');
    console.log('\x1b[33m%s\x1b[0m', 'CDN Support : Mp3, Mp4, Image, File');
    console.log('\x1b[35m%s\x1b[0m', `Server Online. port ${PORT}`);
  });
}

module.exports = app;
