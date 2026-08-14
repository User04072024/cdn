// Tombol "Choose File" -> trigger klik input file tersembunyi
document.getElementById('upload').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('input').click();
});

// Setelah user pilih file lewat dialog -> langsung submit form
document.getElementById('input').addEventListener('change', () => {
  document.querySelector('form').submit();
  document.getElementById('uploading').style.display = 'block';
});

const dropArea = document.getElementById('drop-area');

// Drag & drop handling
dropArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropArea.classList.add('dragover');
});

dropArea.addEventListener('dragleave', () => {
  dropArea.classList.remove('dragover');
});

dropArea.addEventListener('drop', (e) => {
  e.preventDefault();
  dropArea.classList.remove('dragover');

  // Ambil file yang di-drop, masukkan ke input file, lalu submit form
  document.getElementById('input').files = e.dataTransfer.files;
  document.querySelector('form').submit();
  document.getElementById('uploading').style.display = 'block';
});
