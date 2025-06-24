# About this

A Cloudflare Worker-based usher system with CSV upload functionality.

When organising large scale conferences or other events in China, the organisers would often insist assigning specific seats to all participants. Therefore, an usher system would be very convient for participants to look for their seats.

## Features

- **Public Search Interface**: Search seats by name (English/Chinese) with keyword matching
- **Admin Panel**: Password-protected CSV upload with data replacement
- **Responsive Design**: Bootstrap-powered UI that works on all devices
- **Security Features**: File size limits, query limits, atomic transactions
- **Multi-language Support**: Handles both English and Chinese names

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Prerequisites

- Cloudflare account
- Wrangler CLI installed (`npm install -g wrangler`)
- Basic knowledge of Cloudflare Workers and D1 databases

## Setup Instructions with Wrangler CLI

### 1. Clone and Install

```bash
git clone https://github.com/estds/cf-find-my-seat.git
cd cf-find-my-seat
```

### 2. D1 Database Setup

Create a new D1 database:

```bash
wrangler d1 create seat-search-db
```

Create the seats table:

```bash
wrangler d1 execute seat-search-db --command "CREATE TABLE seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en TEXT,
  name_zh TEXT,
  seat TEXT
);"
```

### 3. Configure wrangler.toml

Create or update your `wrangler.toml` file:

```toml
name = "seat-search-system"
main = "worker.js"
compatibility_date = "2024-01-01"

# Environment Variables
[vars]
ADMIN_ROUTE = "admin"  # Change this to your preferred admin route
PASS = "your-secure-password"  # Change this to your secure password

# D1 Database Binding
[[d1_databases]]
binding = "DB"
database_name = "seat-search-db"
database_id = "your-database-id"  # Get this from the wrangler d1 create output
```

### 4. Environment Variables

Set the following environment variables in your `wrangler.toml` or Cloudflare Dashboard:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ADMIN_ROUTE` | Admin panel URL path | `admin` | No |
| `PASS` | Admin password | `admin` | No |

**Security Note**: Always change the default password in production!

### 5. Deploy

```bash
wrangler deploy
```

## Setup Instructions with Cloudflare Dashboard

If you prefer using the web interface instead of the CLI, follow these steps:

### 1. Create D1 Database

1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** > **D1 SQL Database**
3. Click **Create database**
4. Name your database `seat-search-db`
5. Click **Create**

### 2. Create Database Table

1. In your newly created database, go to the **Console** tab
2. Run the following SQL command:

```sql
CREATE TABLE seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en TEXT,
  name_zh TEXT,
  seat TEXT
);
```

3. Click **Execute** to create the table

### 3. Create Worker

1. Navigate to **Workers & Pages** > **Overview**
2. Click **Create application**
3. Select **Create Worker**
4. Name your worker `seat-search-system`
5. Click **Deploy**

### 4. Upload Worker Code

1. In your worker's dashboard, click **Quick edit**
2. Replace the default code with your `worker.js` content
3. Click **Save and deploy**

### 5. Configure Environment Variables

1. In your worker's dashboard, go to **Settings** > **Variables**
2. Under **Environment Variables**, add:
   - `ADMIN_ROUTE`: `admin` (or your preferred admin route)
   - `PASS`: Your secure password (change from default!)
3. Click **Save**

### 6. Bind D1 Database

1. Still in **Settings**, scroll to **D1 database bindings**
2. Click **Add binding**
3. Set **Variable name** to `DB`
4. Select your `seat-search-db` database
5. Click **Save**

### 7. Deploy Changes

1. Go back to your worker's **Code** tab
2. Click **Save and deploy** to apply all configurations

### 8. Test Your Setup

1. Visit your worker URL (found in the worker dashboard)
2. Test the search functionality
3. Access the admin panel at `your-worker-url/admin` (or your custom route)

**Dashboard Benefits:**
- Visual interface for managing resources
- Easy database browsing and querying
- Built-in monitoring and analytics
- Simple environment variable management

## Usage

### Public Search

1. Visit your worker URL (e.g., `https://your-worker.your-subdomain.workers.dev`)
2. Enter a name to search (supports multiple keywords)
3. View results in a responsive table

**Search Features:**
- Partial matching (e.g., "john" matches "Johnson", "Johnny")
- Multi-keyword search (e.g., "james lee" finds records containing "james" OR "lee")
- Searches both English and Chinese name columns
- Limited to 5 keywords for performance

### Admin Panel

1. Visit `https://your-worker.your-subdomain.workers.dev/admin` (or your custom admin route)
2. Enter your admin password
3. Upload a CSV file with the required format

**CSV Format Requirements:**
- Must include columns: `name_en`, `name_zh`, `seat`
- First row should contain headers
- Additional columns will be ignored
- File size limit: 3MB
- Supports UTF-8 BOM (Excel exported CSVs)

**Example CSV:**
```csv
name_en,name_zh,seat
John Smith,约翰·史密斯,A1
Mary Johnson,,B2
Li Ming,李明,C3
```

## Security Features

- **Password Protection**: Admin functions require password authentication
- **File Size Limits**: CSV uploads limited to 3MB
- **Query Limits**: Search limited to 5 keywords maximum
- **Atomic Transactions**: Database updates are all-or-nothing
- **Input Validation**: All inputs are sanitized and validated

## Database Schema

```sql
CREATE TABLE seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en TEXT,     -- English name
  name_zh TEXT,     -- Chinese name
  seat TEXT         -- Seat identifier
);
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Search form / Search results |
| `/admin` | GET | Admin login form |
| `/admin` | POST | Admin authentication & CSV upload |

## Troubleshooting

### Common Issues

1. **Database not found**
   - Ensure D1 database is created and binding is correct in `wrangler.toml`

2. **Admin page not working**
   - Check `ADMIN_ROUTE` environment variable
   - Verify password in `PASS` environment variable

3. **CSV upload fails**
   - Check file size (must be under 3MB)
   - Verify CSV has required columns: `name_en`, `name_zh`, `seat`
   - Ensure proper CSV formatting

4. **Search not working**
   - Check database has data
   - Verify D1 binding configuration

### Development

To test locally:

```bash
wrangler dev
```

To check D1 database contents:

```bash
wrangler d1 execute seat-search-db --command "SELECT * FROM seats LIMIT 10;"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Attribution

This project was developed with assistance from Claude Sonnet 4, an AI assistant created by Anthropic.

## Support

For issues and questions, please open an issue in the repository or refer to the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/).
