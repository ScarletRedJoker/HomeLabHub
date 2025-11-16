# E2E Test Setup Guide

## Quick Start

### Prerequisites

1. **Node.js 18+** installed
2. **Python 3.9+** installed
3. **PostgreSQL** running (for full E2E tests)
4. **Environment variables** configured

### Setup Test Environment

#### 1. Install Dependencies

**Stream Bot**:
```bash
cd services/stream-bot
npm install
```

**Discord Bot**:
```bash
cd services/discord-bot
npm install
```

**Dashboard**:
```bash
cd services/dashboard
pip install -r requirements.txt
```

#### 2. Configure Test Database

Create a separate test database to avoid affecting development data:

```bash
# Create test database
createdb homelab_test

# Set environment variable
export DATABASE_URL="postgresql://user:password@localhost:5432/homelab_test"
export NODE_ENV="test"
export MOCK_EXTERNAL_APIS="true"
```

#### 3. Run Database Migrations

**Stream Bot**:
```bash
cd services/stream-bot
npm run db:push
```

**Discord Bot**:
```bash
cd services/discord-bot
npm run db:push
```

**Dashboard**:
```bash
cd services/dashboard
alembic upgrade head
```

## Running Tests

### Smoke Tests (No Database Required)

Quick validation tests that don't require database setup:

```bash
# Stream Bot
cd services/stream-bot
npm test tests/smoke.test.ts

# Discord Bot
cd services/discord-bot
npm test tests/smoke.test.ts

# Dashboard
cd services/dashboard
pytest tests/test_smoke.py -v
```

### Unit Tests

```bash
# Stream Bot
cd services/stream-bot
npm run test:unit

# Discord Bot
cd services/discord-bot
npm run test:unit

# Dashboard
pytest tests/ -m "not e2e" -v
```

### E2E Tests (Requires Database)

```bash
# Stream Bot
cd services/stream-bot
export DATABASE_URL="postgresql://user:password@localhost:5432/homelab_test"
npm run test:e2e

# Discord Bot
cd services/discord-bot
export DATABASE_URL="postgresql://user:password@localhost:5432/homelab_test"
npm run test:e2e

# Dashboard
cd services/dashboard
export DATABASE_URL="postgresql://user:password@localhost:5432/homelab_test"
pytest tests/e2e/ -v
```

### Generate Coverage Reports

```bash
# Stream Bot
cd services/stream-bot
npm run test:coverage
# Open coverage/index.html

# Discord Bot
cd services/discord-bot
npm run test:coverage
# Open coverage/index.html

# Dashboard
cd services/dashboard
pytest --cov --cov-report=html
# Open htmlcov/index.html
```

## Test Environment Variables

Create `.env.test` file in each service directory:

**Stream Bot & Discord Bot** (.env.test):
```env
NODE_ENV=test
DATABASE_URL=postgresql://user:password@localhost:5432/homelab_test
MOCK_EXTERNAL_APIS=true
SESSION_SECRET=test_secret_key_12345

# Mock API keys (not real, just for testing)
TWITCH_CLIENT_ID=mock_twitch_client_id
TWITCH_CLIENT_SECRET=mock_twitch_secret
YOUTUBE_CLIENT_ID=mock_youtube_client_id
YOUTUBE_CLIENT_SECRET=mock_youtube_secret
DISCORD_CLIENT_ID=mock_discord_client_id
DISCORD_CLIENT_SECRET=mock_discord_secret
```

**Dashboard** (.env.test):
```env
FLASK_ENV=testing
DATABASE_URL=postgresql://user:password@localhost:5432/homelab_test
SECRET_KEY=test_secret_key_12345
TESTING=true

# Mock credentials
DOCKER_HOST=unix:///var/run/docker.sock
OPENAI_API_KEY=mock_openai_key
GOOGLE_CLIENT_ID=mock_google_client_id
GOOGLE_CLIENT_SECRET=mock_google_secret
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test-stream-bot:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: homelab_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd services/stream-bot
          npm install
      
      - name: Run smoke tests
        run: |
          cd services/stream-bot
          npm test tests/smoke.test.ts
      
      - name: Setup database
        run: |
          cd services/stream-bot
          npm run db:push
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/homelab_test
      
      - name: Run E2E tests
        run: |
          cd services/stream-bot
          npm run test:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/homelab_test
          NODE_ENV: test
          MOCK_EXTERNAL_APIS: true
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./services/stream-bot/coverage/coverage-final.json

  test-dashboard:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: homelab_test
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          cd services/dashboard
          pip install -r requirements.txt
      
      - name: Run smoke tests
        run: |
          cd services/dashboard
          pytest tests/test_smoke.py -v
      
      - name: Setup database
        run: |
          cd services/dashboard
          alembic upgrade head
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/homelab_test
      
      - name: Run E2E tests
        run: |
          cd services/dashboard
          pytest tests/e2e/ -v --cov
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/homelab_test
          FLASK_ENV: testing
```

## Troubleshooting

### Database Connection Errors

**Problem**: `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution**:
```bash
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL
sudo service postgresql start

# Verify connection
psql -h localhost -U postgres -d homelab_test
```

### Port Already in Use

**Problem**: Tests fail because port is already in use

**Solution**:
```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>
```

### Mock APIs Not Working

**Problem**: External API calls are being made during tests

**Solution**:
```bash
# Ensure MOCK_EXTERNAL_APIS is set
export MOCK_EXTERNAL_APIS=true

# Verify in tests
echo $MOCK_EXTERNAL_APIS
```

### Test Timeout

**Problem**: Tests timeout after 30 seconds

**Solution**: Increase timeout in vitest.config.ts or pytest.ini:

```typescript
// vitest.config.ts
test: {
  testTimeout: 60000  // 60 seconds
}
```

```ini
# pytest.ini
[pytest]
timeout = 60
```

## Test Data Cleanup

Tests automatically clean up their data in `afterAll` hooks, but if tests are interrupted:

```bash
# Stream Bot & Discord Bot - Reset test database
cd services/stream-bot
npx drizzle-kit drop --config=drizzle.config.ts
npm run db:push

# Dashboard - Reset migrations
cd services/dashboard
alembic downgrade base
alembic upgrade head
```

## Best Practices

1. **Always run smoke tests first** - They're fast and verify basic setup
2. **Use test database** - Never run tests against production or development databases
3. **Enable mocks** - Set `MOCK_EXTERNAL_APIS=true` to avoid real API calls
4. **Clean up data** - Tests should clean up after themselves
5. **Parallel execution** - Tests are designed to run in parallel safely
6. **CI/CD integration** - Use provided GitHub Actions example

## Coverage Goals

- **Line Coverage**: > 80%
- **Branch Coverage**: > 75%
- **E2E Flows**: 100% of critical paths

## Quick Test Commands

```bash
# Run all tests for all services
./run-all-tests.sh

# Run only smoke tests (fast)
./run-smoke-tests.sh

# Run with coverage
./run-tests-with-coverage.sh
```

For detailed test documentation, see [E2E_TEST_DOCUMENTATION.md](./E2E_TEST_DOCUMENTATION.md)
