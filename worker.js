const bootstrap = {
  js: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  css: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
};

export default {
  async fetch(request, env, ctx) {
    const admin_route = env.ADMIN_ROUTE || 'admin';
    const pass = env.PASS || 'admin';
    
    const url = new URL(request.url);
    const path = url.pathname;
    
  // Handle admin route
  if (path === `/${admin_route}`) {
    if (request.method === 'GET') {
      return new Response(getAdminLoginHTML(), {
        headers: { 'Content-Type': 'text/html' }
      });
    } else if (request.method === 'POST') {
      const formData = await request.formData();
      const password = formData.get('password');
      
      if (password !== pass) {
        return new Response(getAdminLoginHTML('Invalid password'), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      // Check if this is a CSV upload (has csvfile field)
      const csvFile = formData.get('csvfile');
      if (csvFile) {
        // Handle CSV upload
        try {

          // Check file size (3MB = 3 * 1024 * 1024 bytes)
          if (csvFile.size > 3 * 1024 * 1024) {
            return new Response(getAdminUploadHTML(`Error: File too large.`, pass, admin_route), {
              headers: { 'Content-Type': 'text/html' }
            });
          }

          const csvText = await csvFile.text();
          const result = await processCsvUpload(csvText, env.DB);
          
          if (result.success) {
            return new Response(getAdminUploadHTML(`Successfully uploaded ${result.count} records`, pass, admin_route), {
              headers: { 'Content-Type': 'text/html' }
            });
          } else {
            return new Response(getAdminUploadHTML(`Error: ${result.error}`, pass, admin_route), {
              headers: { 'Content-Type': 'text/html' }
            });
          }
        } catch (error) {
          return new Response(getAdminUploadHTML(`Error processing file: ${error.message}`, pass, admin_route), {
            headers: { 'Content-Type': 'text/html' }
          });
        }
      } else {
        // Just password login, show upload form
        return new Response(getAdminUploadHTML('', pass, admin_route), {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }
  }
    
    // Handle root route
    if (path === '/') {
      if (request.method === 'GET') {
        const searchName = url.searchParams.get('name');
        
        if (searchName) {
          // Handle search
          if (!searchName.trim()) {
            return new Response(getMainHTML('Please enter a name to search'), {
              headers: { 'Content-Type': 'text/html' }
            });
          }
          
          try {
            const spaceCount = (searchName.match(/ /g) || []).length;
            const results = await searchSeats(searchName.trim(), env.DB);
            if (results.length === 0) {
              return new Response(getMainHTML('No record found. Please check input.', [], searchName), {
                headers: { 'Content-Type': 'text/html' }
              });
            }
            const successMessage = spaceCount> 4 ? 'To prevent abuse, only the first 5 keywords were processed.' : '';
            return new Response(getMainHTML(successMessage, results, searchName), {
              headers: { 'Content-Type': 'text/html' }
            });
          } catch (error) {
            return new Response(getMainHTML(`Error: ${error.message}`, [], searchName), {
              headers: { 'Content-Type': 'text/html' }
            });
          }
        } else {
          // Show empty search form
          return new Response(getMainHTML(), {
            headers: { 'Content-Type': 'text/html' }
          });
        }
      }
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

async function searchSeats(name, db) {
  // Split input by spaces and filter out empty strings
  let keywords = name.trim().split(/\s+/).filter(keyword => keyword.length > 0);
  
  if (keywords.length === 0) {
    return [];
  }
  
  // Limit to first 5 keywords to prevent resource exhaustion
  if (keywords.length > 5) {
    keywords = keywords.slice(0, 5);
  }
  
  // Build dynamic query with OR conditions for each keyword
  const conditions = [];
  const bindings = [];
  
  keywords.forEach(keyword => {
    conditions.push('(name_en LIKE ? OR name_zh LIKE ?)');
    bindings.push(`%${keyword}%`, `%${keyword}%`);
  });
  
  const query = `
    SELECT name_en, name_zh, seat 
    FROM seats 
    WHERE ${conditions.join(' OR ')}
    ORDER BY name_en
  `;
  
  const result = await db.prepare(query).bind(...bindings).all();
  return result.results;
}

async function processCsvUpload(csvText, db) {
  try {
    // Remove UTF-8 BOM if present
    const cleanedCsvText = csvText.replace(/^\uFEFF/, '');
    const lines = cleanedCsvText.trim().split('\n');
    
    if (lines.length < 2) {
      return { success: false, error: 'CSV file must have at least a header row and one data row' };
    }
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Check required columns
    const requiredColumns = ['name_en', 'name_zh', 'seat'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    
    if (missingColumns.length > 0) {
      return { success: false, error: `Missing required columns: ${missingColumns.join(', ')}` };
    }
    
    // Get column indices
    const nameEnIndex = headers.indexOf('name_en');
    const nameZhIndex = headers.indexOf('name_zh');
    const seatIndex = headers.indexOf('seat');
    
    // Prepare statements for batch operation
    const stmts = [db.prepare('DELETE FROM seats')];
    const insertStmt = db.prepare('INSERT INTO seats (name_en, name_zh, seat) VALUES (?, ?, ?)');
    let count = 0;
    
    // Process all rows and add to batch
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
      
      if (row.length >= Math.max(nameEnIndex, nameZhIndex, seatIndex) + 1) {
        const nameEn = row[nameEnIndex] || '';
        const nameZh = row[nameZhIndex] || '';
        const seat = row[seatIndex] || '';
        
        if (nameEn || nameZh || seat) {
          stmts.push(insertStmt.bind(nameEn, nameZh, seat));
          count++;
        }
      }
    }
    
    // Execute all statements as a single atomic transaction
    await db.batch(stmts);
    
    return { success: true, count };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getMainHTML(message = '', results = [], key = '') {
  const resultsHTML = results.length > 0 ? `
    <div class="pt-4 border-top">
      <h3>Search Results:</h3>
      <div class="table-responsive">
        <table class="table table-striped">
          <thead>
            <tr>
              <th>Name</th>
              <th>姓名</th>
              <th>Seat</th>
            </tr>
          </thead>
          <tbody>
            ${results.map(result => `
              <tr>
                <td>${escapeHtml(result.name_en || '')}</td>
                <td>${escapeHtml(result.name_zh || '')}</td>
                <td>${escapeHtml(result.seat || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Seat Search${key ? `: ${key}` : ''}</title>
      <link href="${bootstrap.css}" rel="stylesheet">
    </head>
    <body>
      <div class="container mt-5">
        <div class="row justify-content-center">
          <div class="col mx-auto" style="max-width: 36rem;">
            <div class="card shadow-lg">
              <div class="card-header mt-5">
                <h2 class="text-center mb-0">Find My Seat</h2>
              </div>
              <div class="card-body">
                ${message ? `<div class="alert alert-warning small">${escapeHtml(message)}</div>` : ''}
                
                <form method="GET" action="/" class="mb-4">
                  <div class="mb-3">
                    <input type="text" class="form-control form-control-lg" id="name" name="name" value="${key}" required 
                           placeholder="Enter name to search...">
                  </div>
                  <button type="submit" class="btn btn-primary btn-lg w-100">Find</button>
                </form>
                
                ${resultsHTML}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <script src="${bootstrap.js}"></script>
    </body>
    </html>
  `;
}

function getAdminLoginHTML(message = '') {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Login</title>
      <link href="${bootstrap.css}" rel="stylesheet">
    </head>
    <body>
      <div class="container mt-5">
        <div class="row justify-content-center">
          <div class="col-md-6">
            <div class="card shadow-lg">
              <div class="card-header mt-3">
                <h2 class="text-center mb-0">Admin Access</h2>
              </div>
              <div class="card-body mb-3">
                ${message ? `<div class="alert alert-danger">${escapeHtml(message)}</div>` : ''}
                
                <form method="POST">
                  <div class="mb-3">
                    <label for="password" class="form-label">Password:</label>
                    <input type="password" class="form-control form-control-lg" id="password" name="password" required>
                  </div>
                  <button type="submit" class="btn btn-primary btn-lg w-100">Login</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <script src="${bootstrap.js}"></script>
    </body>
    </html>
  `;
}

function getAdminUploadHTML(message = '', password = 'admin', adminRoute = 'admin') {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Upload</title>
      <link href="${bootstrap.css}" rel="stylesheet">
    </head>
    <body>
      <div class="container mt-5">
        <div class="row justify-content-center">
          <div class="col-md-8">
            <div class="card shadow-lg">
              <div class="card-header mt-3">
                <h2 class="text-center mb-0">Upload Data</h2>
              </div>
              <div class="card-body mb-3">
                ${message ? `<div class="alert ${message.includes('Error') ? 'alert-danger' : 'alert-success'}">${escapeHtml(message)}</div>` : ''}
                
                <div class="alert alert-info">
                  <strong>CSV Format Requirements:</strong>
                  <ul class="mb-0">
                    <li>Must include columns: <code>name_en</code>, <code>name_zh</code>, <code>seat</code></li>
                    <li>First row should be headers</li>
                    <li>File size <code>≤ 3MB</code> (roughly 20,000 lines)</li>
                    <li>Additional columns will be ignored</li>
                    <li>This will replace all existing data</li>
                  </ul>
                </div>
                
                <form id="uploadForm" method="POST" action="/${adminRoute}" enctype="multipart/form-data" novalidate>
                  <div class="mb-3">
                    <label for="csvfile" class="form-label">CSV File:</label>
                    <input type="file" class="form-control form-control-lg" id="csvfile" name="csvfile" 
                          accept=".csv" required>
                    <div class="invalid-feedback">
                      Please select a CSV file.
                    </div>
                  </div>
                  <button type="button" class="btn btn-danger btn-lg w-100" id="uploadButton">
                    Upload and Replace Data
                  </button>
                </form>
                
                <div class="mt-3">
                  <a href="/" class="btn btn-link">Back to Search</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>


      <!-- Confirmation Modal -->
      <div class="modal fade" id="confirmModal" tabindex="-1" aria-labelledby="confirmModalLabel" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="confirmModalLabel">Confirm Data Replacement</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="alert alert-warning">
                <strong>Warning:</strong> This action will permanently delete all existing data and replace it with the uploaded CSV file.
              </div>
              <div class="mb-3">
                <label for="confirmPassword" class="form-label">Enter password to confirm:</label>
                <input type="password" class="form-control" id="confirmPassword" required>
                <div class="invalid-feedback">
                  Please enter the password.
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger" id="confirmUpload">Confirm Upload</button>
            </div>
          </div>
        </div>
      </div>
      
      <script src="${bootstrap.js}"></script>

      <script>
        document.getElementById('uploadButton').addEventListener('click', function() {
          const csvFileInput = document.getElementById('csvfile');
          const form = document.getElementById('uploadForm');
          
          // Check if file is selected
          if (!csvFileInput.files || csvFileInput.files.length === 0) {
            // Show Bootstrap validation
            csvFileInput.classList.add('is-invalid');
            form.classList.add('was-validated');
            return;
          }
          
          // File exists, remove validation classes and show modal
          csvFileInput.classList.remove('is-invalid');
          csvFileInput.classList.add('is-valid');
          
          // Show the modal
          const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
          modal.show();
        });
        
        document.getElementById('confirmUpload').addEventListener('click', function() {
          const passwordInput = document.getElementById('confirmPassword');
          const password = passwordInput.value;
          
          if (!password) {
            // Show Bootstrap validation for password
            passwordInput.classList.add('is-invalid');
            return;
          }
          
          // Password provided, remove validation and proceed
          passwordInput.classList.remove('is-invalid');
          passwordInput.classList.add('is-valid');
          
          // Add password to form data
          const hiddenPasswordInput = document.createElement('input');
          hiddenPasswordInput.type = 'hidden';
          hiddenPasswordInput.name = 'password';
          hiddenPasswordInput.value = password;
          document.getElementById('uploadForm').appendChild(hiddenPasswordInput);
          
          // Submit the form
          document.getElementById('uploadForm').submit();
        });
      </script>

    </body>
    </html>
  `;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
